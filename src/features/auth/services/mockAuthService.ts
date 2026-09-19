import type {
  AuthSession,
  IdentifierKind,
  OtpPurpose,
  PendingVerification,
  RegistrationDraft,
} from '../types/auth.types';
import { HttpError } from '@/services/http';
import { delay } from '@/services/mock/store';

/**
 * Mock authentication.
 *
 * Everything auth-related is deliberately isolated in this one module. When the
 * ASP.NET Core endpoints land, each method becomes a single HTTP call and
 * nothing above it changes:
 *
 *   register    -> POST /api/auth/register
 *   requestOtp  -> POST /api/auth/login
 *   verifyOtp   -> POST /api/auth/verify-otp
 *   resendOtp   -> POST /api/auth/resend-otp
 *   signOut     -> POST /api/auth/logout
 *   restore     -> GET  /api/auth/me
 */

/** Development code. The real service sends this by SMS or email. */
export const DEV_OTP = '1234';

const SESSION_KEY = 'auth.session';

interface MockAccount {
  userId: string;
  email: string;
  mobile: string;
  displayName: string;
  roleId: string;
  landingPath: string;
}

/* Demo accounts. A cashier lands on the till; an owner lands on the dashboard. */
const ACCOUNTS: MockAccount[] = [
  {
    userId: 'usr_001',
    email: 'owner@demo.com',
    mobile: '+966501234567',
    displayName: 'Ahmed Ali',
    roleId: 'rol_owner',
    landingPath: '/dashboard',
  },
  {
    userId: 'usr_002',
    email: 'manager@demo.com',
    mobile: '+966534452211',
    displayName: 'Sara Abdullah',
    roleId: 'rol_manager',
    landingPath: '/dashboard',
  },
  {
    userId: 'usr_003',
    email: 'cashier@demo.com',
    mobile: '+966552207788',
    displayName: 'Yousef Al Harbi',
    roleId: 'rol_cashier',
    landingPath: '/pos',
  },
];

export const DEMO_ACCOUNTS = ACCOUNTS.map((account) => ({
  email: account.email,
  displayName: account.displayName,
  roleId: account.roleId,
}));

/** Normalise so "+966 50 123 4567", "0501234567" and "501234567" all match. */
export function normaliseMobile(value: string): string {
  const digits = value.replace(/[\s\-()]/g, '');
  if (digits.startsWith('00966')) return `+${digits.slice(2)}`;
  if (digits.startsWith('+966')) return digits;
  if (digits.startsWith('966')) return `+${digits}`;
  if (digits.startsWith('05')) return `+966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;
  return digits;
}

export function detectIdentifier(value: string): IdentifierKind | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) return 'email';
  if (/\d/.test(trimmed)) return 'mobile';
  return null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Saudi mobile: +9665XXXXXXXX once normalised. */
export function isValidSaudiMobile(value: string): boolean {
  return /^\+9665\d{8}$/.test(normaliseMobile(value));
}

/** Enough to recognise, not enough to leak. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, name.length - 1))}@${domain}`;
}

export function maskMobile(mobile: string): string {
  const normalised = normaliseMobile(mobile);
  return `${normalised.slice(0, 4)} •• ••• •${normalised.slice(-2)}`;
}

function readSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null): void {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* Storage blocked — the session still holds for this tab. */
  }
}

function findAccount(identifier: string): MockAccount | undefined {
  const trimmed = identifier.trim().toLowerCase();
  return ACCOUNTS.find(
    (account) =>
      account.email.toLowerCase() === trimmed ||
      normaliseMobile(account.mobile) === normaliseMobile(identifier),
  );
}

/* Registration is parked here until the code is verified. */
let pendingRegistration: RegistrationDraft | null = null;

export const mockAuthService = {
  /** Rehydrate an existing session on page load. */
  async restore(): Promise<AuthSession | null> {
    await delay(120);
    return readSession();
  },

  /**
   * Start a sign-in and return what the OTP screen needs.
   *
   * An unknown identifier is rejected here only because this is a mock. A real
   * implementation should answer identically either way, so the endpoint cannot
   * be used to discover which addresses have accounts.
   */
  async requestOtp(identifier: string, purpose: OtpPurpose): Promise<PendingVerification> {
    await delay(420);

    const kind = detectIdentifier(identifier);
    if (!kind) {
      throw new HttpError({
        status: 422,
        code: 'invalid_identifier',
        message: 'Enter an email address or a mobile number.',
        fieldErrors: { identifier: ['Enter an email address or a mobile number.'] },
      });
    }

    if (kind === 'email' && !isValidEmail(identifier)) {
      throw new HttpError({
        status: 422,
        code: 'invalid_email',
        message: 'Please enter a valid email address.',
        fieldErrors: { identifier: ['Please enter a valid email address.'] },
      });
    }

    if (kind === 'mobile' && !isValidSaudiMobile(identifier)) {
      throw new HttpError({
        status: 422,
        code: 'invalid_mobile',
        message: 'Please enter a valid Saudi mobile number, for example +966 50 123 4567.',
        fieldErrors: { identifier: ['Please enter a valid Saudi mobile number.'] },
      });
    }

    if (purpose === 'login' && !findAccount(identifier)) {
      throw new HttpError({
        status: 404,
        code: 'account_not_found',
        message: 'No account uses that email or mobile number.',
        fieldErrors: { identifier: ['No account uses that email or mobile number.'] },
      });
    }

    return {
      purpose,
      destination: identifier.trim(),
      kind,
      maskedDestination: kind === 'email' ? maskEmail(identifier.trim()) : maskMobile(identifier),
      attemptsRemaining: 5,
    };
  },

  async resendOtp(pending: PendingVerification): Promise<PendingVerification> {
    await delay(360);
    return { ...pending, attemptsRemaining: 5 };
  },

  /** Verify a code. For a login this returns and stores the session. */
  async verifyOtp(pending: PendingVerification, code: string): Promise<AuthSession> {
    await delay(500);

    if (code !== DEV_OTP) {
      throw new HttpError({
        status: 401,
        code: 'invalid_otp',
        message: 'Invalid verification code. Please try again.',
      });
    }

    if (pending.purpose === 'register') {
      if (!pendingRegistration) {
        throw new HttpError({
          status: 409,
          code: 'no_pending_registration',
          message: 'That registration has expired. Please start again.',
        });
      }

      const draft = pendingRegistration;
      pendingRegistration = null;

      /* A newly registered owner is deliberately not signed in here — they go
         through a first login, which is both what the spec asks for and what a
         real system would do. No session is written. */
      return {
        userId: 'usr_new',
        email: draft.owner.email,
        mobile: normaliseMobile(draft.owner.mobile),
        displayName: `${draft.owner.firstName} ${draft.owner.lastName}`.trim(),
        roleId: 'rol_owner',
        landingPath: '/dashboard',
        issuedAt: new Date().toISOString(),
      };
    }

    const account = findAccount(pending.destination);
    if (!account) {
      throw new HttpError({
        status: 404,
        code: 'account_not_found',
        message: 'No account uses that email or mobile number.',
      });
    }

    const session: AuthSession = {
      userId: account.userId,
      email: account.email,
      mobile: account.mobile,
      displayName: account.displayName,
      roleId: account.roleId,
      landingPath: account.landingPath,
      issuedAt: new Date().toISOString(),
    };

    writeSession(session);
    return session;
  },

  /** Submit a registration. Parks it until the code is verified. */
  async register(draft: RegistrationDraft): Promise<PendingVerification> {
    await delay(700);

    if (findAccount(draft.owner.email)) {
      throw new HttpError({
        status: 409,
        code: 'email_taken',
        message: 'An account already uses that email address. Try signing in instead.',
        fieldErrors: { email: ['An account already uses that email address.'] },
      });
    }

    pendingRegistration = draft;

    return {
      purpose: 'register',
      destination: draft.owner.mobile,
      kind: 'mobile',
      maskedDestination: maskMobile(draft.owner.mobile),
      attemptsRemaining: 5,
    };
  },

  async signOut(): Promise<void> {
    await delay(200);
    writeSession(null);
  },
};
