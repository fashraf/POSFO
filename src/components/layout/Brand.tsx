import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/version';
import { useTranslation } from '@/i18n';

export interface BrandProps {
  /** Hide the wordmark and show the mark alone (collapsed sidebar). */
  compact?: boolean;
  className?: string;
}

/**
 * The mark is a receipt edge: a rounded square with a torn bottom. It is the one
 * decorative element in the interface, so everything else can stay quiet.
 */
export function Brand({ compact = false, className }: BrandProps) {
  const { t } = useTranslation();

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden>
          <path
            d="M6 4.5h12v13.2l-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4V4.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M9 9h6M9 12.5h4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="truncate text-md font-semibold tracking-tight text-ink-900">
          {t('common.appName') || APP_NAME}
        </span>
      )}
    </span>
  );
}
