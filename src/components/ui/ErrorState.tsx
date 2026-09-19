import type { ReactNode } from 'react';
import { AlertOctagon, RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useTranslation } from '@/i18n';

export interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Wiring this up renders a retry button. */
  onRetry?: () => void;
  className?: string;
}

/** Errors say what happened and how to fix it. They do not apologise. */
export function ErrorState({ title, description, onRetry, className }: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}
    >
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-50 text-danger-500"
      >
        <AlertOctagon className="h-5 w-5" />
      </span>

      <div className="max-w-sm space-y-1">
        <p className="text-md font-semibold text-ink-900">{title ?? t('states.errorTitle')}</p>
        <p className="text-sm text-ink-500">{description ?? t('states.errorDescription')}</p>
      </div>

      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} leadingIcon={<RotateCw />}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
