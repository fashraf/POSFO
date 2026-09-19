import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

export interface EmptyStateProps {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** The one thing the person should do next. */
  action?: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

/** An empty screen is an invitation to act, so it always offers a next step. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'md' ? 'gap-3 px-6 py-14' : 'gap-2.5 px-4 py-8',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-full bg-ink-100 text-ink-400',
          size === 'md' ? 'h-11 w-11 [&>svg]:h-5 [&>svg]:w-5' : 'h-9 w-9 [&>svg]:h-4 [&>svg]:w-4',
        )}
      >
        {icon ?? <Inbox />}
      </span>

      <div className="max-w-sm space-y-1">
        <p className={cn('font-semibold text-ink-900', size === 'md' ? 'text-md' : 'text-base')}>
          {title ?? t('states.emptyTitle')}
        </p>
        <p className="text-sm text-ink-500">{description ?? t('states.emptyDescription')}</p>
      </div>

      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
