import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import {
  Alert,
  Button,
  CurrencyDisplay,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchableSelect,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useSession } from '@/contexts/SessionContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import { ledgerService, safeCall } from '@/services';
import type { FinanceSummary } from '@/services/api';

function recentMonths(count = 12): string[] {
  const months: string[] = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

/**
 * One line of the statement.
 *
 * The amount sits in a fixed-width column so every figure on the page shares a
 * right edge. Financial statements are read by scanning that column, and rows
 * that each size themselves to their own number defeat it.
 */
function StatementRow({
  label,
  amountH,
  level = 'detail',
  negative = false,
  trailing,
}: {
  label: ReactNode;
  amountH: number;
  /** `detail` indents; `subtotal` rules off; `section` is a heading row. */
  level?: 'detail' | 'subtotal';
  negative?: boolean;
  trailing?: string;
}) {
  const subtotal = level === 'subtotal';

  return (
    <div
      className={cn(
        'flex items-baseline gap-4 px-5',
        subtotal ? 'border-t border-ink-300 py-2.5' : 'py-1.5',
      )}
    >
      <dt
        className={cn(
          'min-w-0 flex-1 truncate',
          subtotal ? 'text-sm font-semibold text-ink-900' : 'ps-4 text-sm text-ink-600',
        )}
      >
        {label}
      </dt>

      {trailing && (
        <dd className="numeric w-14 shrink-0 text-end text-xs text-ink-400">{trailing}</dd>
      )}

      <dd className={cn('shrink-0 text-end', trailing ? 'w-32' : 'w-32')}>
        <CurrencyDisplay
          amount={amountH}
          className={cn(
            subtotal ? 'text-base font-semibold text-ink-900' : 'text-sm text-ink-700',
            negative && !subtotal && 'text-danger-600',
          )}
        />
      </dd>
    </div>
  );
}

/** A section heading inside the statement. */
function StatementSection({ label }: { label: ReactNode }) {
  return (
    <p className="border-t border-ink-200 bg-ink-50/60 px-5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-500 first:border-t-0">
      {label}
    </p>
  );
}

export default function ProfitLossPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch } = useSession();

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string | null>(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    const result = await safeCall(() =>
      ledgerService.monthSummary(month, activeBranch?.id ?? null),
    );
    setSummary(result.ok ? result.data : null);
    setLoading(false);
  }, [activeBranch, month]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Built from recognition entries, not payments.
   *
   * This is why a year of rent paid in January does not make January look
   * catastrophic: only January's tenth of it appears in January's operating
   * expenses.
   */
  const statement = useMemo(() => {
    /* The server reports revenue net of returns and the returns on their
       own, so gross sales is the two added back together. */
    const returnsH = summary?.returnsH ?? 0;
    const netRevenueH = summary?.revenueH ?? 0;
    const salesH = netRevenueH + returnsH;
    /* Gross profit is the server's: net revenue (ex VAT, after returns) less
       the cost of the goods AND services sold — the same rule the dashboard
       uses. Services' cost is not in the ledger, so it arrives on its own. */
    const cogsH = summary?.cogsH ?? 0;
    const goodsCostH = summary?.goodsCostH ?? cogsH;
    const serviceCostH = summary?.serviceCostH ?? 0;
    const grossProfitH = summary?.grossProfitH ?? netRevenueH - cogsH;

    const operatingH = summary?.expensesH ?? 0;
    /* Each expense account with movement this month. */
    const operatingLines = (summary?.expensesByAccount ?? []).filter(
      (account) => account.amountH !== 0,
    );

    return {
      salesH,
      returnsH,
      netRevenueH,
      operatingLines,
      cogsH,
      goodsCostH,
      serviceCostH,
      grossProfitH,
      operatingH,
      netProfitH: grossProfitH - operatingH,
      grossMargin: summary?.grossMargin ?? (netRevenueH > 0 ? grossProfitH / netRevenueH : null),
      netMargin: netRevenueH > 0 ? (grossProfitH - operatingH) / netRevenueH : null,
      hasActivity: salesH !== 0 || cogsH !== 0 || operatingH !== 0,
    };
  }, [summary]);

  if (loading) return <LoadingState className="py-20" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('pnl.title')}
        description={t('pnl.description')}
        actions={
          <>
            <SearchableSelect
              size="sm"
              className="w-40"
              value={month}
              onChange={setMonth}
              options={recentMonths().map((value) => ({ value, label: value }))}
            />
            <Button variant="outline" leadingIcon={<Printer />} onClick={() => window.print()}>
              {t('pnl.export')}
            </Button>
          </>
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      {!statement.hasActivity ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-surface">
          <EmptyState title={t('pnl.empty.title')} description={t('pnl.empty.description')} />
        </div>
      ) : (
        <>
          {/* One document, not four cards. A statement is read top to bottom
              as a single sequence, and card borders between sections break the
              line the eye follows down the amount column. */}
          <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-ink-200 bg-surface shadow-xs">
            <header className="border-b border-ink-200 px-5 py-3.5">
              <h2 className="text-base font-semibold text-ink-900">{t('pnl.title')}</h2>
              <p className="numeric text-xs text-ink-500">{month}</p>
            </header>

            <dl className="py-1">
              <StatementSection label={t('pnl.revenue')} />
              <StatementRow label={t('pnl.sales')} amountH={statement.salesH} />
              {statement.returnsH !== 0 && (
                <StatementRow label={t('pnl.returns')} amountH={-statement.returnsH} negative />
              )}
              <StatementRow
                label={t('pnl.netRevenue')}
                amountH={statement.netRevenueH}
                level="subtotal"
              />

              <StatementSection label={t('pnl.cogs')} />
              {statement.serviceCostH !== 0 ? (
                <>
                  <StatementRow label={t('pnl.goodsCost')} amountH={-statement.goodsCostH} negative />
                  <StatementRow label={t('pnl.serviceCost')} amountH={-statement.serviceCostH} negative />
                </>
              ) : (
                <StatementRow label={t('pnl.cogs')} amountH={-statement.cogsH} negative />
              )}
              <StatementRow
                label={t('pnl.grossProfit')}
                amountH={statement.grossProfitH}
                level="subtotal"
                trailing={
                  statement.grossMargin !== null
                    ? formatPercent(statement.grossMargin, { language })
                    : undefined
                }
              />

              <StatementSection label={t('pnl.operating')} />
              {statement.operatingLines.map((account) => (
                <StatementRow
                  key={account.accountCode}
                  label={
                    (language === 'ar' ? account.nameAr : account.nameEn) ||
                    account.name ||
                    account.accountCode
                  }
                  amountH={-account.amountH}
                  negative
                />
              ))}
              <StatementRow
                label={t('pnl.operating')}
                amountH={-statement.operatingH}
                level="subtotal"
              />
            </dl>

            {/* The bottom line, double-ruled the way a statement is. */}
            <div
              className={cn(
                'flex items-baseline gap-4 border-t-2 border-double px-5 py-4',
                statement.netProfitH < 0
                  ? 'border-danger-300 bg-danger-50/60'
                  : 'border-success-300 bg-success-50/60',
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-base font-semibold',
                    statement.netProfitH < 0 ? 'text-danger-700' : 'text-success-700',
                  )}
                >
                  {statement.netProfitH < 0 ? t('pnl.loss') : t('pnl.netProfit')}
                </span>
              </span>

              {statement.netMargin !== null && (
                <span className="numeric w-14 shrink-0 text-end text-xs text-ink-500">
                  {formatPercent(statement.netMargin, { language })}
                </span>
              )}

              <span className="w-32 shrink-0 text-end">
                <CurrencyDisplay
                  amount={Math.abs(statement.netProfitH)}
                  className={cn(
                    'text-xl font-semibold',
                    statement.netProfitH < 0 ? 'text-danger-700' : 'text-success-700',
                  )}
                />
              </span>
            </div>
          </div>

          <Alert tone="tip" compact className="mx-auto max-w-3xl">
            {t('pnl.accrualNote')}
          </Alert>
        </>
      )}
    </div>
  );
}
