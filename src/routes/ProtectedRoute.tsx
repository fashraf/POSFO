import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/components/ui';
import { useAuth } from '@/features/auth/context/AuthContext';

/**
 * Gate for everything behind sign-in.
 *
 * Waits for the stored session to be checked before deciding, so a signed-in
 * person reloading a deep link is not bounced to the login screen and back.
 * The attempted path is carried along so they land where they meant to go.
 */
export function ProtectedRoute() {
  const { session, initialising } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-ink-50">
        <LoadingState />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/** Keeps a signed-in person out of the login and registration screens. */
export function PublicOnlyRoute() {
  const { session, initialising } = useAuth();

  if (initialising) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-ink-50">
        <LoadingState />
      </div>
    );
  }

  if (session) {
    return <Navigate to={session.landingPath} replace />;
  }

  return <Outlet />;
}
