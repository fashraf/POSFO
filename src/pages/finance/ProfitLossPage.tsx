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
import { ACCOUNTS, accountBalanceH, monthKey } from '@/types/finance';
import type { JournalEntry } from '@/types/finance';

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

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string | null>(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    const result = await safeCall(() => ledgerService.all(activeBranch?.id ?? null));
    if (result.ok) setEntries(result.data);
    setLoading(false);
  }, [activeBranch]);

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
    const inMonth = entries.filter((entry) => monthKey(entry.postedAt) === month);

    const salesH = accountBalanceH(inMonth, '4100');
    const returnsH = accountBalanceH(inMonth, '4200');
    const netRevenueH = salesH - returnsH;
    const cogsH = accountBalanceH(inMonth, '5100');
    const grossProfitH = netRevenueH - cogsH;

    const operating = [
      { code: '6000', amountH: accountBalanceH(inMonth, '6000') },
      { code: '6100', amountH: accountBalanceH(inMonth, '6100') },
      { code: '6200', amountH: accountBalanceH(inMonth, '6200') },
      { code: '6300', amountH: accountBalanceH(inMonth, '6300') },
      { code: '5200', amountH: accountBalanceH(inMonth, '5200') },
    ].filter((line) => line.amountH !== 0);

    const operatingH = operating.reduce((sum, line) => sum + line.amountH, 0);

    return {
      salesH,
      returnsH,
      netRevenueH,
      cogsH,
      grossProfitH,
      operating,
      operatingH,
      netProfitH: grossProfitH - operatingH,
      grossMargin: netRevenueH > 0 ? grossProfitH / netRevenueH : null,
      netMargin: netRevenueH > 0 ? (grossProfitH - operatingH) / netRevenueH : null,
      hasActivity: inMonth.length > 0,
    };
  }, [entries, month]);

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

      <FinanceTabs />

      <ScopeBanner />
            <Button variant="outline" leadingIcon={<Printer />} onClick={() => window.print()}>
              {t('pnl.export')}
            </Button>
          </>
        }
      />

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
              {statement.returnsH > 0 && (
                <StatementRow
                  label={t('pnl.returns')}
                  amountH={-statement.returnsH}
                  negative
                />
              )}
              <StatementRow
                label={t('pnl.netRevenue')}
                amountH={statement.netRevenueH}
                level="subtotal"
              />

              <StatementSection label={t('pnl.cogs')} />
              <StatementRow label={t('pnl.cogs')} amountH={-statement.cogsH} negative />
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
              {statement.operating.length === 0 ? (
                <p className="px-5 ps-9 py-1.5 text-sm text-ink-400">—</p>
              ) : (
                statement.operating.map((line) => (
                  <StatementRow
                    key={line.code}
                    label={
                      language === 'ar'
                        ? (ACCOUNTS[line.code]?.nameAr ?? line.code)
                        : (ACCOUNTS[line.code]?.nameEn ?? line.code)
                    }
                    amountH={-line.amountH}
                    negative
                  />
                ))
              )}
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
