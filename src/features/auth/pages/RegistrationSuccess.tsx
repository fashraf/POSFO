import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Package, Tags, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui';
import { AuthLayout } from '../components/AuthLayout';
import { useTranslation } from '@/i18n';

/**
 * Shown once, straight after a registration is verified.
 *
 * Deliberately restrained: a tick, a greeting, and the three things worth
 * doing first. A new owner arrives here with no catalog and no sales, so the
 * useful thing is direction, not confetti.
 */
export default function RegistrationSuccess() {
  const { t } = useTranslation();
  const location = useLocation();
  const name = (location.state as { name?: string } | null)?.name ?? '';

  const steps = [
    { icon: Package, text: t('celebrate.step1') },
    { icon: Tags, text: t('celebrate.step2') },
    { icon: ShoppingCart, text: t('celebrate.step3') },
  ];

  return (
    <AuthLayout title={t('celebrate.title')} subtitle={t('celebrate.subtitle', { name })}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full bg-success-50 text-success-500"
          >
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <p className="text-sm text-ink-500">{t('celebrate.body')}</p>
        </div>

        <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">
            {t('celebrate.next')}
          </p>
          <ul className="space-y-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.text} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="numeric mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-2xs font-semibold text-ink-500 ring-1 ring-ink-200"
                  >
                    {index + 1}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-ink-700">
                    <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                    {step.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <Link to="/login" className="block">
          <Button size="lg" fullWidth trailingIcon={<ArrowRight className="flip-rtl" />}>
            {t('celebrate.signIn')}
          </Button>
        </Link>
      </div>
    </AuthLayout>
  );
}
