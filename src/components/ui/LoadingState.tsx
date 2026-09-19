import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

export interface LoadingStateProps {
  label?: string;
  className?: string;
  /** `block` fills its container, `inline` sits in a row. */
  variant?: 'block' | 'inline';
}

export function LoadingState({ label, className, variant = 'block' }: LoadingStateProps) {
  const { t } = useTranslation();
  const text = label ?? t('states.loadingLabel');

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-2 text-sm text-ink-500', className)}>
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        {text}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14', className)}
    >
      <Loader2 aria-hidden className="h-6 w-6 animate-spin text-ink-400" />
      <p className="text-sm text-ink-500">{text}</p>
    </div>
  );
}
