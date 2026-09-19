import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authService } from '../services/authService';
import type {
  AuthSession,
  AuthStatus,
  OtpPurpose,
  PendingVerification,
  RegistrationDraft,
} from '../types/auth.types';

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  pending: PendingVerification | null;
  /** True until the stored session has been checked, so routes do not flicker. */
  initialising: boolean;
  /**
   * Step one. Resolves to a session in single-step mode, or a pending
   * verification in two-step. Check with `isAuthSession` before using it.
   */
  requestOtp: (
    identifier: string,
    purpose: OtpPurpose,
    password?: string,
  ) => Promise<AuthSession | PendingVerification>;
  register: (draft: RegistrationDraft) => Promise<PendingVerification>;
  verifyOtp: (code: string) => Promise<AuthSession>;
  resendOtp: () => Promise<void>;
  clearPending: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Did step one sign us in, or does it still need a code?
 *
 * An AuthSession carries a userId; a PendingVerification does not. Pages use
 * this to decide whether to navigate onward or show the OTP screen.
 */
export function isAuthSession(
  value: AuthSession | PendingVerification,
): value is AuthSession {
  return 'userId' in value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [pending, setPending] = useState<PendingVerification | null>(null);
  const [initialising, setInitialising] = useState(true);

  /* Restore before rendering any route, so a signed-in person reloading the
     page is not bounced to the login screen for a frame. */
  useEffect(() => {
    void (async () => {
      const restored = await authService.restore();
      setSession(restored);
      setInitialising(false);
    })();
  }, []);

  /**
   * Step one.
   *
   * The server decides whether a code is needed. When it signs us in outright
   * (single-step mode) the session lands here and there is no OTP screen to
   * show; when it returns a verification, the flow continues as before. The
   * caller checks which came back, so restoring two-step needs no change here.
   */
  const requestOtp = useCallback(
    async (identifier: string, purpose: OtpPurpose, password?: string) => {
      const result = await authService.requestOtp(identifier, purpose, password);

      if (isAuthSession(result)) {
        setSession(result);
        setPending(null);
        return result;
      }

      setPending(result);
      return result;
    },
    [],
  );

  const register = useCallback(async (draft: RegistrationDraft) => {
    const verification = await authService.register(draft);
    setPending(verification);
    return verification;
  }, []);

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!pending) {
        throw new Error('No verification is in progress.');
      }

      const result = await authService.verifyOtp(pending, code);

      /* Registration verification does not sign anyone in — the person goes on
         to a first login. Only a login verification establishes a session. */
      if (pending.purpose === 'login') setSession(result);
      setPending(null);

      return result;
    },
    [pending],
  );

  const resendOtp = useCallback(async () => {
    if (!pending) return;
    setPending(await authService.resendOtp(pending));
  }, [pending]);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setSession(null);
    setPending(null);
  }, []);

  const status: AuthStatus = session
    ? 'authenticated'
    : pending
      ? 'awaiting_otp'
      : 'unauthenticated';

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      pending,
      initialising,
      requestOtp,
      register,
      verifyOtp,
      resendOtp,
      clearPending: () => setPending(null),
      signOut,
    }),
    [status, session, pending, initialising, requestOtp, register, verifyOtp, resendOtp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
