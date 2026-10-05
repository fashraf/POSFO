import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, TrendingDown } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Alert,
  Badge,
  ChartCard,
  CurrencyDisplay,
  InfoHint,
  LoadingState,
  PageHeader,
  SearchableSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useSession } from '@/contexts/SessionContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPercent } from '@/lib/format';
import { ledgerService, safeCall } from '@/services';
import type { FinanceSummary } from '@/services/api';

interface BranchRow {
  id: string;
  name: string;
  revenueH: number;
  expensesH: number;
  cogsH: number;
  profitH: number;
  margin: number | null;
  share: number;
}

function recentMonths(count = 6): string[] {
  const months: string[] = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

/**
 * Branch comparison.
 *
 * Ranked by **margin, not revenue**. A branch turning over twice as much while
 * keeping a thinner slice of it is not the healthier branch, and a table sorted
 * by size would say it was.
 */
export default function BranchComparisonPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { branches } = useSession();

  const [summaries, setSummaries] = useState<Record<string, FinanceSummary>>({});
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string | null>(new Date().toISOString().slice(0, 7));

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);

    /* One summary per branch: this page exists to compare them. Each covers
       only that branch's own entries; entries with no branch (business-wide
       costs such as rent or payroll) come back separately, the same in every
       summary, and are shown once rather than charged to any branch. */
    const results = await Promise.all(
      branches.map((branch) => safeCall(() => ledgerService.monthSummary(month, branch.id))),
    );

    const byBranch: Record<string, FinanceSummary> = {};
    results.forEach((result, index) => {
      if (result.ok) byBranch[branches[index].id] = result.data;
    });

    setSummaries(byBranch);
    setLoading(false);
  }, [branches, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<BranchRow[]>(() => {
    const measured = branches.map((branch) => {
      const summary = summaries[branch.id];

      const revenueH = summary?.revenueH ?? 0;
      const cogsH = summary?.cogsH ?? 0;
      const expensesH = summary?.expensesH ?? 0;
      /* Gross profit by the shared rule (net revenue ex VAT less the cost of
         goods and services sold), then the branch's own expenses. Margin is
         on that net revenue, never on VAT-inclusive takings. */
      const profitH = (summary?.grossProfitH ?? revenueH - cogsH) - expensesH;

      return {
        id: branch.id,
        name: nameOf(branch),
        revenueH,
        expensesH,
        cogsH,
        profitH,
        margin: revenueH > 0 ? profitH / revenueH : null,
        share: 0,
      };
    });

    const totalRevenueH = measured.reduce((sum, row) => sum + row.revenueH, 0);

    return measured
      .map((row) => ({
        ...row,
        share: totalRevenueH > 0 ? row.revenueH / totalRevenueH : 0,
      }))
      .sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity));
  }, [summaries, branches, language]);

  const trading = rows.filter((row) => row.revenueH > 0);
  const best = trading[0];
  const worst = trading.length > 1 ? trading[trading.length - 1] : null;

  /* Business-wide figures are identical in every branch's summary. */
  const businessWide = Object.values(summaries).find((summary) => summary.businessWide)
    ?.businessWide;
  const sharedRevenueH = businessWide?.revenueH ?? 0;
  const sharedCostH = (businessWide?.cogsH ?? 0) + (businessWide?.expensesH ?? 0);

  /* The combined line is the whole business: every branch plus what belongs
     to none of them. */
  const branchTotals = rows.reduce(
    (sum, row) => ({
      revenueH: sum.revenueH + row.revenueH,
      expensesH: sum.expensesH + row.expensesH + row.cogsH,
      profitH: sum.profitH + row.profitH,
    }),
    { revenueH: 0, expensesH: 0, profitH: 0 },
  );
  const combined = {
    revenueH: branchTotals.revenueH + sharedRevenueH,
    expensesH: branchTotals.expensesH + sharedCostH,
    profitH: branchTotals.profitH + sharedRevenueH - sharedCostH,
  };

  const chartData = rows.map((row) => ({
    label: row.name,
    profit: row.profitH / 100,
    margin: row.margin,
  }));

  if (loading) return <LoadingState className="py-20" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('branchCompare.title')}
        description={t('branchCompare.description')}
        actions={
          <SearchableSelect
            size="sm"
            className="w-40"
            value={month}
            onChange={setMonth}
            options={recentMonths().map((value) => ({ value, label: value }))}
          />
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      {/* One sentence saying what the table means, so the comparison does not
          have to be worked out from the numbers. */}
      {trading.length === 0 ? (
        <Alert tone="tip">{t('branchCompare.insight.single')}</Alert>
      ) : worst && worst.profitH < 0 ? (
        <Alert tone="warning" icon={<TrendingDown className="h-4 w-4" />}>
          {t('branchCompare.insight.losing', { branch: worst.name })}
        </Alert>
      ) : worst && best ? (
        <Alert tone="info">
          {t('branchCompare.insight.lagging', {
            branch: worst.name,
            margin: formatPercent(worst.margin ?? 0, { language }),
            best: best.name,
            bestMargin: formatPercent(best.margin ?? 0, { language }),
          })}
        </Alert>
      ) : best ? (
        <Alert tone="success" icon={<Award className="h-4 w-4" />}>
          {t('branchCompare.insight.leading', {
            branch: best.name,
            margin: formatPercent(best.margin ?? 0, { language }),
          })}
        </Alert>
      ) : null}

      {(sharedCostH !== 0 || sharedRevenueH !== 0) && (
        <Alert tone="info" compact>
          {t('branchCompare.businessWide', {
            costs: formatCurrency(sharedCostH, { language }),
            revenue: formatCurrency(sharedRevenueH, { language }),
          })}
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('branchCompare.columns.branch')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('branchCompare.columns.revenue')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('branchCompare.columns.profit')}</TableHeaderCell>
                <TableHeaderCell numeric>
                  <span className="inline-flex items-center gap-1">
                    {t('branchCompare.columns.margin')}
                    <InfoHint content={t('branchCompare.marginHelp')} />
                  </span>
                </TableHeaderCell>
                <TableHeaderCell numeric>
                  <span className="inline-flex items-center gap-1">
                    {t('branchCompare.columns.share')}
                    <InfoHint content={t('branchCompare.shareHelp')} />
                  </span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink-900">{row.name}</span>
                      {trading.length > 1 && index === 0 && row.revenueH > 0 && (
                        <Badge tone="success">{t('branchCompare.best')}</Badge>
                      )}
                      {row.profitH < 0 && <Badge tone="danger">{t('branchCompare.loss')}</Badge>}
                    </span>
                  </TableCell>

                  <TableCell numeric className="text-ink-700">
                    <CurrencyDisplay amount={row.revenueH} />
                  </TableCell>

                  <TableCell numeric>
                    <CurrencyDisplay
                      amount={row.profitH}
                      className={cn(
                        'font-medium',
                        row.profitH < 0 ? 'text-danger-600' : 'text-ink-900',
                      )}
                    />
                  </TableCell>

                  <TableCell numeric>
                    <span
                      className={cn(
                        'numeric font-semibold',
                        row.margin === null
                          ? 'text-ink-300'
                          : row.margin < 0
                            ? 'text-danger-600'
                            : row.margin < 0.1
                              ? 'text-warning-600'
                              : 'text-success-600',
                      )}
                    >
                      {row.margin === null ? '—' : formatPercent(row.margin, { language })}
                    </span>
                  </TableCell>

                  <TableCell numeric>
                    {/* A bar rather than a bare number: relative size reads
                        faster than four percentages side by side. */}
                    <span className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-100">
                        <span
                          className="block h-full rounded-full bg-brand-500"
                          style={{ width: `${row.share * 100}%` }}
                        />
                      </span>
                      <span className="numeric w-10 text-xs text-ink-500">
                        {Math.round(row.share * 100)}%
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}

              <TableRow className="bg-ink-50/60">
                <TableCell className="font-semibold text-ink-900">
                  {t('branchCompare.combined')}
                </TableCell>
                <TableCell numeric>
                  <CurrencyDisplay
                    amount={combined.revenueH}
                    className="font-semibold text-ink-900"
                  />
                </TableCell>
                <TableCell numeric>
                  <CurrencyDisplay
                    amount={combined.profitH}
                    className={cn(
                      'font-semibold',
                      combined.profitH < 0 ? 'text-danger-600' : 'text-ink-900',
                    )}
                  />
                </TableCell>
                <TableCell numeric>
                  <span className="numeric font-semibold text-ink-700">
                    {combined.revenueH > 0
                      ? formatPercent(combined.profitH / combined.revenueH, { language })
                      : '—'}
                  </span>
                </TableCell>
                <TableCell numeric className="text-ink-400">
                  100%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <ChartCard title={t('branchCompare.columns.profit')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#6B7683' }}
                axisLine={{ stroke: '#E3E6EA' }}
                tickLine={false}
                reversed={language === 'ar'}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B7683' }}
                axisLine={false}
                tickLine={false}
                width={56}
                orientation={language === 'ar' ? 'right' : 'left'}
              />
              <RechartsTooltip
                cursor={{ fill: '#EFF1F3' }}
                formatter={(value: number) =>
                  formatCurrency(value, { language, fromMinorUnits: false })
                }
                contentStyle={{ borderRadius: 8, border: '1px solid #E3E6EA', fontSize: 12 }}
              />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.label}
                    fill={entry.profit < 0 ? '#C0392B' : '#1F7A63'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
