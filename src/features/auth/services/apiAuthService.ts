import { api } from '@/services/apiClient';
import { tokenStore } from '@/services/tokenStore';
import type {
  AuthSession,
  IdentifierKind,
  OtpPurpose,
  PendingVerification,
  RegistrationDraft,
} from '../types/auth.types';

/**
 * Authentication against the real API.
 *
 * Deliberately the same shape as mockAuthService: same method names, same
 * arguments, same return types. That is what lets a single config flag swap
 * between them without a line changing anywhere above.
 */

/**
 * What POST /api/auth/login returns.
 *
 * Two-step gives a challenge; single-step gives a session. Which one arrives is
 * a server setting, so this is a union and the caller decides by looking at
 * what it got rather than by knowing the mode in advance. That is what lets the
 * server switch back to two-step without a frontend change.
 */
interface ChallengeResponse {
  challengeId: string;
  expiresAtUtc: string;
  devMode: boolean;
}

type LoginResponse = ChallengeResponse | SessionResponse;

function isSession(response: LoginResponse): response is SessionResponse {
  return 'accessToken' in response;
}

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresAtUtc: string;
  user: {
    userId: string;
    username: string;
    nameAr: string;
    nameEn: string;
    roleId: string;
    permissions: string[];
    branchIds: string[];
  };
}

/**
 * The challenge id the server issued.
 *
 * PendingVerification has no field for it — it is a server detail the UI has no
 * business knowing — so it is held here between the two steps.
 */
let pendingChallengeId: string | null = null;

const OTP_MAX_ATTEMPTS = 5;

function detectKind(identifier: string): IdentifierKind {
  return identifier.includes('@') ? 'email' : 'mobile';
}

/** j***@example.com, or +966 •• ••• •67 */
function mask(identifier: string, kind: IdentifierKind): string {
  if (kind === 'email') {
    const [local, domain] = identifier.split('@');
    if (!domain) return identifier;
    return `${local.slice(0, 1)}***@${domain}`;
  }

  const digits = identifier.replace(/\D/g, '');
  return `+${digits.slice(0, 3)} •• ••• •${digits.slice(-2)}`;
}

/** Where a role lands after sign-in. Kept in step with the mock service. */
function landingFor(roleId: string): string {
  switch (roleId) {
    case 'rol_cashier':
      return '/pos';
    case 'rol_accountant':
      return '/finance';
    case 'rol_inventory':
      return '/inventory';
    default:
      return '/dashboard';
  }
}

function toSession(user: SessionResponse['user']): AuthSession {
  return {
    userId: user.userId,
    email: user.username.includes('@') ? user.username : '',
    mobile: '',
    displayName: user.nameEn,
    roleId: user.roleId,
    landingPath: landingFor(user.roleId),
    issuedAt: new Date().toISOString(),
  };
}

export const apiAuthService = {
  /**
   * Restore a session on page load.
   *
   * The access token lives in memory, so every refresh lands here. Returning
   * null means "sign in again", which is a normal outcome rather than an error.
   */
  async restore(): Promise<AuthSession | null> {
    if (!tokenStore.getRefreshToken()) return null;

    try {
      const user = await api.get<SessionResponse['user']>('/api/auth/me');
      return toSession(user);
    } catch {
      tokenStore.clear();
      return null;
    }
  },

  /**
   * Step one.
   *
   * Returns a session when the server is in single-step mode, or a pending
   * verification when it is in two-step. The caller checks which it received.
   */
  async requestOtp(
    identifier: string,
    purpose: OtpPurpose,
    password?: string,
  ): Promise<PendingVerification | AuthSession> {
    const trimmed = identifier.trim();
    const kind = detectKind(trimmed);

    const response = await api.post<LoginResponse>(
      '/api/auth/login',
      { identifier: trimmed, purpose, password },
      { anonymous: true },
    );

    /* Single-step: the server already signed us in. */
    if (isSession(response)) {
      tokenStore.setSession(response.accessToken, response.expiresAtUtc, response.refreshToken);
      pendingChallengeId = null;
      return toSession(response.user);
    }

    pendingChallengeId = response.challengeId;

    return {
      purpose,
      destination: trimmed,
      kind,
      maskedDestination: mask(trimmed, kind),
      attemptsRemaining: OTP_MAX_ATTEMPTS,
    };
  },

  async resendOtp(pending: PendingVerification): Promise<PendingVerification> {
    /* Only reachable in two-step mode, where a challenge exists to replace. */
    /* A resend issues a fresh challenge rather than re-sending the old code.
       The previous one stops working, which is the point of it being one-time. */
    return apiAuthService.requestOtp(pending.destination, pending.purpose) as Promise<PendingVerification>;
  },

  async verifyOtp(_pending: PendingVerification, code: string): Promise<AuthSession> {
    if (!pendingChallengeId) {
      throw new Error('No sign-in is in progress. Request a code first.');
    }

    const session = await api.post<SessionResponse>(
      '/api/auth/verify',
      { challengeId: pendingChallengeId, code },
      { anonymous: true },
    );

    pendingChallengeId = null;
    tokenStore.setSession(session.accessToken, session.expiresAtUtc, session.refreshToken);

    return toSession(session.user);
  },

  /**
   * Create the business and start verification.
   *
   * The endpoint issues its own challenge and returns the id, so this must not
   * call requestOtp afterwards — that would replace the challenge with a second
   * one and the code the person receives would already be dead.
   */
  async register(draft: RegistrationDraft): Promise<PendingVerification> {
    const response = await api.post<ChallengeResponse & { userId: string }>(
      '/api/auth/register',
      draft,
      { anonymous: true },
    );

    pendingChallengeId = response.challengeId;

    const email = draft.owner.email.trim();

    return {
      purpose: 'register',
      destination: email,
      kind: 'email',
      maskedDestination: mask(email, 'email'),
      attemptsRemaining: OTP_MAX_ATTEMPTS,
    };
  },

  async signOut(): Promise<void> {
    const refreshToken = tokenStore.getRefreshToken();

    if (refreshToken) {
      /* Ask the server to revoke it, but clear locally regardless: someone who
         presses sign-out must end up signed out even if the call fails. */
      try {
        await api.post('/api/auth/logout', { refreshToken });
      } catch {
        /* Intentionally ignored. */
      }
    }

    tokenStore.clear();
  },
};
