import { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Lock } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Button,
  Card,
  CardBody,
  ConfirmModal,
  CurrencyDisplay,
  FormField,
  InfoHint,
  LoadingState,
  PageHeader,
  PriceInput,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate, toMinorUnits } from '@/lib/format';
import { openingBalanceService, safeCall } from '@/services';
import { openingEquityH } from '@/types/finance';
import type { OpeningBalances } from '@/types/finance';

const FIELDS = ['cash', 'bank', 'inventory', 'receivables'] as const;

export default function OpeningBalancesPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user } = useSession();
  const toast = useToast();

  const [existing, setExisting] = useState<
    (OpeningBalances & { postedAt: string; actor: string }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const [values, setValues] = useState<Record<string, string>>({
    cash: '',
    bank: '',
    inventory: '',
    receivables: '',
    payables: '',
    vat: '',
  });
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const actor = user ? (language === 'ar' ? user.nameAr : user.nameEn) : 'System';

  const load = useCallback(async () => {
    setLoading(true);
    const result = await safeCall(() => openingBalanceService.get());
    if (result.ok) setExisting(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const balances: OpeningBalances = useMemo(
    () => ({
      cashH: toMinorUnits(values.cash || '0'),
      bankH: toMinorUnits(values.bank || '0'),
      inventoryH: toMinorUnits(values.inventory || '0'),
      receivablesH: toMinorUnits(values.receivables || '0'),
      payablesH: toMinorUnits(values.payables || '0'),
      vatH: toMinorUnits(values.vat || '0'),
      asOf,
    }),
    [values, asOf],
  );

  const summary = openingEquityH(balances);
  const hasFigures = summary.assetsH > 0 || summary.liabilitiesH > 0;

  async function post() {
    setBusy(true);
    const result = await safeCall(() => openingBalanceService.post({ ...balances, actor }));
    setBusy(false);
    setConfirming(false);

    if (result.ok) {
      toast.success(t('opening.toast.posted'));
      await load();
    } else {
      toast.error(t('opening.toast.failed'), result.error.message);
    }
  }

  if (loading) return <LoadingState className="py-20" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('opening.title')}
        description={t('opening.description')}
        actions={
          !existing && (
            <Button
              leadingIcon={<Landmark />}
              onClick={() => setConfirming(true)}
              disabled={!hasFigures}
            >
              {t('opening.post')}
            </Button>
          )
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      {/* Posted once and then locked — a second set would double every asset. */}
      {existing ? (
        <Alert tone="success" icon={<Lock className="h-4 w-4" />} title={t('opening.posted', {
          date: formatDate(existing.postedAt, { language }),
        })}>
          {t('opening.postedHelp')}
        </Alert>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('opening.sections.assets')}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map((field) => (
                  <FormField
                    key={field}
                    label={t(`opening.fields.${field}` as never)}
                    help={field === 'inventory' ? t('opening.fields.inventoryHelp') : undefined}
                  >
                    <PriceInput
                      inputSize="sm"
                      disabled={Boolean(existing)}
                      value={existing ? String((balances as never)[`${field}H`] ?? '') : values[field]}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field]: event.target.value }))
                      }
                      placeholder="0.00"
                    />
                  </FormField>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('opening.sections.liabilities')}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t('opening.fields.payables')}>
                  <PriceInput
                    inputSize="sm"
                    disabled={Boolean(existing)}
                    value={values.payables}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, payables: event.target.value }))
                    }
                    placeholder="0.00"
                  />
                </FormField>

                <FormField label={t('opening.fields.vat')} help={t('opening.fields.vatHelp')}>
                  <PriceInput
                    inputSize="sm"
                    disabled={Boolean(existing)}
                    value={values.vat}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, vat: event.target.value }))
                    }
                    placeholder="0.00"
                  />
                </FormField>

                <FormField label={t('opening.asOf')} help={t('opening.asOfHelp')}>
                  <DatePicker
                size="sm"
                value={existing ? existing.asOf : asOf}
                onChange={(value) => setAsOf(value)}
                disabled={Boolean(existing)}
                />
                </FormField>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="lg:sticky lg:top-16 lg:h-fit">
          <Card>
            <CardBody className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">{t('opening.summary.assets')}</span>
                <CurrencyDisplay amount={summary.assetsH} className="font-medium text-ink-800" />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ink-500">{t('opening.summary.liabilities')}</span>
                <CurrencyDisplay
                  amount={summary.liabilitiesH}
                  className="font-medium text-danger-600"
                />
              </div>

              <div className="flex items-center justify-between border-t border-dashed border-ink-200 pt-2">
                <span className="flex items-center gap-1.5 font-semibold text-ink-900">
                  {t('opening.summary.equity')}
                  <InfoHint content={t('opening.summary.equityHelp')} />
                </span>
                <CurrencyDisplay
                  amount={summary.equityH}
                  className={cn(
                    'text-lg font-semibold',
                    summary.equityH < 0 ? 'text-danger-600' : 'text-ink-900',
                  )}
                />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={confirming}
        title={t('opening.confirmTitle')}
        description={t('opening.confirmDescription')}
        confirmLabel={t('opening.post')}
        variant="warning"
        loading={busy}
        onConfirm={post}
        onCancel={() => setConfirming(false)}
      >
        <dl className="space-y-1 rounded-md bg-ink-50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('opening.summary.assets')}</dt>
            <dd>
              <CurrencyDisplay amount={summary.assetsH} className="font-medium text-ink-900" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('opening.summary.equity')}</dt>
            <dd>
              <CurrencyDisplay amount={summary.equityH} className="font-semibold text-ink-900" />
            </dd>
          </div>
        </dl>
      </ConfirmModal>
    </div>
  );
}
