import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { ErrorState } from '@/components/ui';
import { useTranslation } from '@/i18n';

/** Catches a thrown render or loader error and offers a way back. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const description = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : error instanceof Error
      ? error.message
      : t('states.errorDescription');

  return (
    <div className="flex min-h-svh items-center justify-center bg-ink-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-ink-200 bg-surface shadow-sm">
        <ErrorState description={description} onRetry={() => navigate(0)} />
      </div>
    </div>
  );
}
