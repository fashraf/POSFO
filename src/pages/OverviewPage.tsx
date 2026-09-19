import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Blocks,
  Component,
  Languages,
  LayoutGrid,
  PlugZap,
} from 'lucide-react';
import { Button, Card, CardBody, PageHeader } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { APP_VERSION } from '@/lib/version';

const CAPABILITIES = [
  { id: 'routing', icon: LayoutGrid, titleKey: 'overview.items.routing', hintKey: 'overview.items.routingHint' },
  { id: 'i18n', icon: Languages, titleKey: 'overview.items.i18n', hintKey: 'overview.items.i18nHint' },
  { id: 'components', icon: Blocks, titleKey: 'overview.items.components', hintKey: 'overview.items.componentsHint' },
  { id: 'services', icon: PlugZap, titleKey: 'overview.items.services', hintKey: 'overview.items.servicesHint' },
] as const;

const STEPS = ['overview.step1', 'overview.step2', 'overview.step3'] as const;

export default function OverviewPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${t('overview.eyebrow')} · v${APP_VERSION}`}
        title={t('overview.title')}
        description={t('overview.description')}
        actions={
          <Link to="/components">
            <Button variant="outline" trailingIcon={<ArrowRight className="flip-rtl" />}>
              {t('overview.viewComponents')}
            </Button>
          </Link>
        }
      />

      <section aria-labelledby="capabilities-heading" className="space-y-4">
        <h2 id="capabilities-heading" className="text-md font-semibold text-ink-900">
          {t('overview.checklist')}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon;
            return (
              <Card key={capability.id}>
                <CardBody className="space-y-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-600"
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-ink-900">{t(capability.titleKey)}</p>
                    <p className="text-sm text-ink-500">{t(capability.hintKey)}</p>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="next-steps-heading">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2.5">
              <Component aria-hidden className="h-4.5 w-4.5 text-ink-400" />
              <h2 id="next-steps-heading" className="text-md font-semibold text-ink-900">
                {t('overview.nextSteps')}
              </h2>
            </div>

            <ol className="space-y-3">
              {STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="numeric mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-2xs font-semibold text-ink-600"
                  >
                    {index + 1}
                  </span>
                  <p className="text-base text-ink-600">{t(step)}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
