import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Building2, Scale, Users } from 'lucide-react';
import {
  Alert,
  Badge,
  CurrencyDisplay,
  InfoHint,
  KpiCard,
  LoadingState,
  PageHeader,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/format';
import { customerService, safeCall, vendorService } from '@/services';
import { ageBucket, ageInDays } from '@/types/finance';
import type { Customer } from '@/types/sales';
import type { Vendor } from '@/types/catalog';

interface Position {
  receivableH: number;
  payableH: number;
  customers: number;
  vendors: number;
  overLimit: number;
  staleReceivableH: number;
  stalePayableH: number;
}

/**
 * The whole credit picture on one screen.
 *
 * Receivables and payables each have their own page, but neither answers the
 * question an owner actually asks — *am I ahead or behind on credit?* That
 * needs both sides next to each other and the difference stated plainly.
 */
export default function CreditPage() {
  const { t } = useTranslation();
  const { language } = useI18n();

  const [position, setPosition] = useState<Position | null>(null);
  const [topCustomers, setTopCustomers] = useState<Customer[]>([]);
  const [topVendors, setTopVendors] = useState<(Vendor & { balanceH: number })[]>([]);
  const [loading, setLoading] = useState(true);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    setLoading(true);

    const [customerResult, vendorResult] = await Promise.all([
      safeCall(() => customerService.list()),
      safeCall(() => vendorService.list()),
    ]);

    const customers = customerResult.ok
      ? customerResult.data.filter((customer) => customer.balanceH > 0)
      : [];
    const vendors = vendorResult.ok
      ? vendorResult.data.filter((vendor) => vendor.balanceH > 0)
      : [];

    const stale = <T extends { balanceH: number; updatedAt: string }>(rows: T[]) =>
      rows
        .filter((row) => {
          const bucket = ageBucket(row.updatedAt);
          return bucket === 'd60' || bucket === 'd90';
        })
        .reduce((sum, row) => sum + row.balanceH, 0);

    setPosition({
      receivableH: customers.reduce((sum, customer) => sum + customer.balanceH, 0),
      payableH: vendors.reduce((sum, vendor) => sum + vendor.balanceH, 0),
      customers: customers.length,
      vendors: vendors.length,
      overLimit: customers.filter((customer) => customer.balanceH > customer.creditLimitH).length,
      staleReceivableH: stale(customers),
      stalePayableH: stale(vendors),
    });

    setTopCustomers([...customers].sort((a, b) => b.balanceH - a.balanceH).slice(0, 5));
    setTopVendors([...vendors].sort((a, b) => b.balanceH - a.balanceH).slice(0, 5));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !position) return <LoadingState className="py-20" />;

  const netH = position.receivableH - position.payableH;
  const inFavour = netH >= 0;

  return (
    <div className="space-y-4">
      <PageHeader title={t('credit.title')} description={t('credit.description')} />

      <FinanceTabs />

      <ScopeBanner />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('credit.owedToYou')}
              <InfoHint content={t('financeGlossary.receivable')} />
            </span>
          }
          value={<CurrencyDisplay amount={position.receivableH} />}
          icon={<Users />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('credit.youOwe')}
              <InfoHint content={t('financeGlossary.payable')} />
            </span>
          }
          value={
            <CurrencyDisplay amount={position.payableH} className="text-warning-700" />
          }
          icon={<Building2 />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('credit.netPosition')}
              <InfoHint
                content={inFavour ? t('credit.netPositiveHelp') : t('credit.netNegativeHelp')}
              />
            </span>
          }
          value={
            <CurrencyDisplay
              amount={Math.abs(netH)}
              className={inFavour ? 'text-success-600' : 'text-danger-600'}
            />
          }
          icon={<Scale />}
        />
      </div>

      {/* The two sides side by side, with the difference between them. */}
      <div className="rounded-lg border border-ink-200 bg-surface p-4">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="text-ink-500">{t('credit.owedToYou')}</dt>
            <dd>
              <CurrencyDisplay
                amount={position.receivableH}
                className="font-medium text-ink-800"
              />
            </dd>
          </div>

          <div className="flex items-center gap-2">
            <dt className="text-ink-500">{t('credit.youOwe')}</dt>
            <dd>
              <CurrencyDisplay
                amount={-position.payableH}
                className="font-medium text-warning-700"
              />
            </dd>
          </div>

          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5',
              inFavour ? 'bg-success-50' : 'bg-danger-50',
            )}
          >
            <dt
              className={cn(
                'font-semibold',
                inFavour ? 'text-success-700' : 'text-danger-700',
              )}
            >
              {inFavour ? t('credit.inYourFavour') : t('credit.againstYou')}
            </dt>
            <dd>
              <CurrencyDisplay
                amount={Math.abs(netH)}
                className={cn(
                  'text-lg font-semibold',
                  inFavour ? 'text-success-700' : 'text-danger-700',
                )}
              />
            </dd>
          </div>
        </dl>
      </div>

      {!inFavour && (
        <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
          {t('credit.settleWarning', {
            amount: formatCurrency(Math.abs(netH), { language }),
          })}
        </Alert>
      )}

      {position.overLimit > 0 && (
        <Alert tone="warning" compact>
          {position.overLimit} · {t('credit.overLimitHelp')}
        </Alert>
      )}

      {/* Who sits on each side */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-ink-200 bg-surface">
          <header className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-ink-900">
              {t('credit.customers')} ({formatNumber(position.customers, { language })})
            </h2>
            <Link
              to="/finance/receivables"
              className="flex items-center gap-1 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              {t('credit.viewReceivables')}
              <ArrowRight aria-hidden className="h-3 w-3 flip-rtl" />
            </Link>
          </header>

          {topCustomers.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-400">
              {t('receivables.empty.title')}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {topCustomers.map((customer) => {
                const over = customer.balanceH > customer.creditLimitH;
                return (
                  <li
                    key={customer.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {nameOf(customer)}
                      </p>
                      <p className="text-2xs text-ink-400">
                        {t('aging.days', { days: ageInDays(customer.updatedAt) })}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {over && <Badge tone="danger">{t('credit.overLimit')}</Badge>}
                      <CurrencyDisplay
                        amount={customer.balanceH}
                        className="text-sm font-semibold text-ink-900"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-ink-200 bg-surface">
          <header className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-ink-900">
              {t('credit.vendors')} ({formatNumber(position.vendors, { language })})
            </h2>
            <Link
              to="/finance/payables"
              className="flex items-center gap-1 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              {t('credit.viewPayables')}
              <ArrowRight aria-hidden className="h-3 w-3 flip-rtl" />
            </Link>
          </header>

          {topVendors.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-400">
              {t('payables.empty.title')}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {topVendors.map((vendor) => (
                <li
                  key={vendor.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{nameOf(vendor)}</p>
                    <p className="text-2xs text-ink-400">
                      {t('aging.days', { days: ageInDays(vendor.updatedAt) })}
                    </p>
                  </div>

                  <CurrencyDisplay
                    amount={vendor.balanceH}
                    className="shrink-0 text-sm font-semibold text-warning-700"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(position.staleReceivableH > 0 || position.stalePayableH > 0) && (
        <Alert tone="tip" compact>
          {t('credit.stale')}:{' '}
          <CurrencyDisplay amount={position.staleReceivableH + position.stalePayableH} />
        </Alert>
      )}
    </div>
  );
}
