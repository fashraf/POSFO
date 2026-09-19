import { Languages } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LANGUAGES, LANGUAGE_META, useI18n } from '@/i18n';

export interface LanguageSwitcherProps {
  /** `segmented` shows both languages, `compact` shows a single toggle button. */
  variant?: 'segmented' | 'compact';
  className?: string;
}

export function LanguageSwitcher({ variant = 'segmented', className }: LanguageSwitcherProps) {
  const { language, setLanguage, toggleLanguage, t } = useI18n();

  if (variant === 'compact') {
    const next = language === 'ar' ? 'en' : 'ar';
    return (
      <button
        type="button"
        onClick={toggleLanguage}
        aria-label={`${t('common.language')}: ${LANGUAGE_META[next].nativeLabel}`}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded px-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900',
          className,
        )}
      >
        <Languages aria-hidden className="h-4 w-4" />
        <span>{LANGUAGE_META[next].nativeLabel}</span>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn('inline-flex items-center rounded-md bg-ink-100 p-0.5', className)}
    >
      {LANGUAGES.map((code) => {
        const active = code === language;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLanguage(code)}
            aria-pressed={active}
            className={cn(
              'rounded-sm px-2.5 py-1 text-sm font-medium transition-colors',
              active ? 'bg-surface text-ink-900 shadow-xs' : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {LANGUAGE_META[code].nativeLabel}
          </button>
        );
      })}
    </div>
  );
}
