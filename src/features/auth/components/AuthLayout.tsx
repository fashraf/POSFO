import type { ReactNode } from 'react';
import { Brand } from '@/components/layout/Brand';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useTranslation } from '@/i18n';
import { Typewriter } from './Typewriter';
import { APP_VERSION } from '@/lib/version';

export interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Rendered under the card — a link to the other flow. */
  footer?: ReactNode;
  /** Wider card for the registration wizard. */
  wide?: boolean;
}

/**
 * Shared chrome for every unauthenticated screen.
 *
 * A quiet left panel on desktop, a centred card on mobile. The language
 * switcher sits here rather than inside each page, because someone whose
 * Arabic is stronger needs it before they can read the form.
 */
export function AuthLayout({ title, subtitle, children, footer, wide = false }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-svh bg-ink-50">
      {/* Brand panel — desktop only, deliberately understated */}
      <aside className="relative hidden w-2/5 max-w-lg flex-col justify-between border-e border-ink-200 bg-surface p-10 lg:flex">
        <Brand />

        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-ink-900">
            {t('auth.brandHeadline')}
          </h2>

          {/* The feature list types itself out rather than sitting as a static
              block — it says what the product does without a wall of bullets. */}
          <p className="min-h-[1.75rem] text-lg font-medium text-brand-600">
            <Typewriter
              phrases={[
                t('login.typing.branches'),
                t('login.typing.inventory'),
                t('login.typing.kitchen'),
                t('login.typing.users'),
                t('login.typing.vendors'),
                t('login.typing.discounts'),
                t('login.typing.finance'),
                t('login.typing.reports'),
              ]}
            />
          </p>

          <p className="max-w-sm text-md text-ink-500">{t('auth.brandBody')}</p>
        </div>

        <p className="text-xs text-ink-400">
          {t('common.version')} <span className="numeric">{APP_VERSION}</span>
        </p>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-5 py-3 sm:px-8">
          <span className="lg:hidden">
            <Brand />
          </span>
          <span className="ms-auto">
            <LanguageSwitcher />
          </span>
        </header>

        <div className="flex flex-1 items-start justify-center px-5 pb-8 pt-1 sm:items-center sm:px-8">
          <div className={wide ? 'w-full max-w-3xl' : 'w-full max-w-md'}>
            <div className="mb-4 space-y-1 text-center">
              <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
              {subtitle && <p className="text-sm text-ink-500">{subtitle}</p>}
            </div>

            <div className="rounded-xl border border-ink-200 bg-surface p-5 shadow-sm sm:p-6">
              {children}
            </div>

            {footer && <div className="mt-5 text-center text-sm text-ink-500">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
