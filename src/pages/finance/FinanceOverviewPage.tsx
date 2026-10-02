import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, CalendarClock, Receipt, TrendingUp, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
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
  KpiCard,
  PageHeader,
  SearchableSelect,
  SkeletonCards,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { FinanceAlerts } from '@/features/finance/FinanceAlerts';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useSession } from '@/contexts/SessionContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';
import { expenseCategoryService, expenseService, ledgerService, recurringService, safeCall } from '@/services';
import type { FinanceSummary } from '@/services/api';
import { availableCashH, daysUntil, dueUrgency } from '@/types/finance';
import type { DueUrgency, ExpenseCategory, RecurringPayment } from '@/types/finance';
import type { BadgeTone } from '@/components/ui';

const URGENCY_TONES: Record<DueUrgency, BadgeTone> = {
  normal: 'neutral',
  soon: 'warning',
  today: 'danger',
  overdue: 'danger',
};

const DONUT_COLOURS = ['#1F7A63', '#1D6FA5', '#B26A00', '#7A4FA3', '#9AA4B0', '#4B5561'];

/* One colour per method, the same in every month. */
const METHOD_COLOURS: Record<'cash' | 'card' | 'credit' | 'bank', string> = {
  cash: DONUT_COLOURS[0],
  card: DONUT_COLOURS[1],
  credit: DONUT_COLOURS[2],
  bank: DONUT_COLOURS[3],
};

function monthsBack(count: number): string[] {
  const months: string[] = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    months.unshift(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

/** Signed change ratio, or null when there is no baseline. */
function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export default function FinanceOverviewPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch } = useSession();

  const [summaries, setSummaries] = useState<(FinanceSummary & { month: string })[]>([]);
  const [recognised, setRecognised] = useState<{ categoryId: string; amountH: number }[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [upcoming, setUpcoming] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<string | null>('6');

  const load = useCallback(async () => {
    setLoading(true);
    const branchId = activeBranch?.id ?? null;
    const thisMonth = new Date().toISOString().slice(0, 7);

    /* Twelve months covers the widest range, so changing it needs no reload.
       Oldest first, which is the order the chart reads in. */
    const [summaryResult, upcomingResult, recognisedResult, categoryResult] = await Promise.all([
      safeCall(() => ledgerService.monthSummaries(monthsBack(12), branchId)),
      safeCall(() => recurringService.upcoming(30, branchId)),
      safeCall(() => expenseService.recognitionFor(thisMonth, branchId)),
      safeCall(() => expenseCategoryService.list()),
    ]);
    if (summaryResult.ok) setSummaries(summaryResult.data);
    if (upcomingResult.ok) setUpcoming(upcomingResult.data);
    if (recognisedResult.ok) {
      setRecognised(
        recognisedResult.data.map((entry) => ({
          categoryId: entry.categoryId,
          amountH: entry.amountH,
        })),
      );
    }
    if (categoryResult.ok) setCategories(categoryResult.data);
    setLoading(false);
  }, [activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  const figures = useMemo(() => {
    const [previous, thisMonth] = monthsBack(2);

    const forMonth = (month: string) => {
      const summary = summaries.find((candidate) => candidate.month === month);
      const salesH = summary?.revenueH ?? 0;
      const expensesH = summary?.expensesH ?? 0;
      return { salesH, expensesH, netH: salesH - expensesH - (summary?.cogsH ?? 0) };
    };

    const current = forMonth(thisMonth);
    const prior = forMonth(previous);

    /* Cash and bank, all time — the summary reads these as balances, not as
       the month's movement. */
    const cashOnHandH = summaries.find((summary) => summary.month === thisMonth)?.cashH ?? 0;
    const cash = availableCashH(
      cashOnHandH,
      upcoming.map((payment) => ({ amountH: payment.amountH, dueOn: payment.nextDueOn })),
    );

    return { current, prior, cashOnHandH, ...cash };
  }, [summaries, upcoming]);

  /* Sales against expenses, month by month. */
  const comparison = useMemo(() => {
    const months = monthsBack(Number(range ?? 6));

    return months.map((month) => {
      const summary = summaries.find((candidate) => candidate.month === month);
      const salesH = summary?.revenueH ?? 0;
      const expensesH = summary?.expensesH ?? 0;

      return {
        label: month.slice(5),
        revenue: salesH / 100,
        expenses: expensesH / 100,
        net: (salesH - expensesH) / 100,
      };
    });
  }, [summaries, range]);

  /* This month's share of each recorded expense, by category — what the cost
     belongs to, not when it was paid. */
  const breakdown = useMemo(() => {
    const totals = new Map<string, number>();

    for (const entry of recognised) {
      const category = categories.find((candidate) => candidate.id === entry.categoryId);
      const label = category
        ? language === 'ar'
          ? category.nameAr
          : category.nameEn
        : entry.categoryId;
      totals.set(label, (totals.get(label) ?? 0) + entry.amountH);
    }

    return Array.from(totals.entries())
      .map(([name, amountH]) => ({ name, value: amountH / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [recognised, categories, language]);

  /* How this month's sales were tendered, as the server totals it from the
     sales themselves (cash net of change). */
  const paymentMix = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const mix = summaries.find((summary) => summary.month === thisMonth)?.paymentMix;
    if (!mix) return [];

    return [
      { key: 'cash' as const, name: t('pos.payment.cash'), value: mix.cashH / 100 },
      { key: 'card' as const, name: t('pos.payment.card'), value: mix.cardH / 100 },
      { key: 'credit' as const, name: t('pos.payment.credit'), value: mix.creditH / 100 },
      { key: 'bank' as const, name: t('vendors.payment.bank'), value: mix.bankH / 100 },
    ].filter((slice) => slice.value > 0);
  }, [summaries, t]);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('finance.title')} description={t('finance.description')} />
        <SkeletonCards />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('finance.title')} description={t('finance.description')} />

      <FinanceTabs />

      <ScopeBanner />

      <FinanceAlerts />

      {/* Headline figures */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('availableCash.label')}
              <InfoHint content={t('financeGlossary.availableCash')} />
            </span>
          }
          value={
            <CurrencyDisplay
              amount={figures.availableH}
              className={figures.availableH < 0 ? 'text-danger-600' : undefined}
            />
          }
          icon={<Wallet />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('financeDash.sales')}
              <InfoHint content={t('financeGlossary.revenue')} />
            </span>
          }
          value={<CurrencyDisplay amount={figures.current.salesH} />}
          change={change(figures.current.salesH, figures.prior.salesH) ?? undefined}
          changeLabel={t('financeDash.vsLastMonth')}
          icon={<TrendingUp />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('financeDash.expenses')}
              <InfoHint content={t('financeGlossary.expenses')} />
            </span>
          }
          value={<CurrencyDisplay amount={figures.current.expensesH} />}
          change={change(figures.current.expensesH, figures.prior.expensesH) ?? undefined}
          changeLabel={t('financeDash.vsLastMonth')}
          icon={<Receipt />}
          invertTrend
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('financeDash.netPosition')}
              <InfoHint content={t('financeGlossary.netProfit')} />
            </span>
          }
          value={
            <CurrencyDisplay
              amount={figures.current.netH}
              className={figures.current.netH < 0 ? 'text-danger-600' : undefined}
            />
          }
          change={change(figures.current.netH, figures.prior.netH) ?? undefined}
          changeLabel={t('financeDash.vsLastMonth')}
          icon={<Banknote />}
        />
      </div>

      {/* How available cash is arrived at — the number is meaningless without it */}
      <div className="rounded-lg border border-ink-200 bg-surface p-4">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="text-ink-500">{t('availableCash.onHand')}</dt>
            <dd>
              <CurrencyDisplay amount={figures.cashOnHandH} className="font-medium text-ink-800" />
            </dd>
          </div>

          <div className="flex items-center gap-2">
            <dt className="flex items-center gap-1 text-ink-500">
              {t('availableCash.committed')}
              <span className="text-2xs text-ink-400">({t('availableCash.horizon')})</span>
            </dt>
            <dd>
              <CurrencyDisplay amount={-figures.committedH} className="font-medium text-danger-600" />
            </dd>
          </div>

          <div className="flex items-center gap-2 rounded-md bg-ink-100 px-3 py-1.5">
            <dt className="font-semibold text-ink-900">{t('availableCash.available')}</dt>
            <dd>
              <CurrencyDisplay
                amount={figures.availableH}
                className={cn(
                  'text-lg font-semibold',
                  figures.availableH < 0 ? 'text-danger-700' : 'text-ink-900',
                )}
              />
            </dd>
          </div>
        </dl>
      </div>

      {figures.availableH < 0 && <Alert tone="warning">{t('availableCash.negative')}</Alert>}

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title={t('financeDash.comparison')}
          action={
            <SearchableSelect
              size="sm"
              className="w-36"
              value={range}
              onChange={setRange}
              options={[
                { value: '3', label: t('financeDash.range.m3') },
                { value: '6', label: t('financeDash.range.m6') },
                { value: '12', label: t('financeDash.range.m12') },
              ]}
            />
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparison} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                width={52}
                orientation={language === 'ar' ? 'right' : 'left'}
              />
              <RechartsTooltip
                cursor={{ fill: '#EFF1F3' }}
                formatter={(value: number) =>
                  formatCurrency(value, { language, fromMinorUnits: false })
                }
                contentStyle={{ borderRadius: 8, border: '1px solid #E3E6EA', fontSize: 12 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span style={{ fontSize: 12, color: '#4B5561' }}>{value}</span>
                )}
              />
              <Bar
                dataKey="revenue"
                name={t('financeDash.revenue')}
                fill="#1F7A63"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="expenses"
                name={t('financeDash.expense')}
                fill="#B26A00"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t('financeDash.breakdown')}>
          {breakdown.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-ink-400">
              {t('finance.empty.description')}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {breakdown.map((entry, index) => (
                    <Cell key={entry.name} fill={DONUT_COLOURS[index % DONUT_COLOURS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: number) =>
                    formatCurrency(value, { language, fromMinorUnits: false })
                  }
                  contentStyle={{ borderRadius: 8, border: '1px solid #E3E6EA', fontSize: 12 }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: 11, color: '#4B5561' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Payment mix */}
      {paymentMix.length > 0 && (
        <ChartCard title={t('dashboard.charts.byMethod')} height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={paymentMix}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
                stroke="none"
              >
                {paymentMix.map((slice) => (
                  <Cell key={slice.key} fill={METHOD_COLOURS[slice.key]} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value: number) =>
                  formatCurrency(value, { language, fromMinorUnits: false })
                }
                contentStyle={{ borderRadius: 8, border: '1px solid #E3E6EA', fontSize: 12 }}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span style={{ fontSize: 11, color: '#4B5561' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Upcoming commitments */}
      <section className="rounded-lg border border-ink-200 bg-surface">
        <header className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            <CalendarClock aria-hidden className="h-4 w-4 text-ink-400" />
            {t('financeDash.upcoming')}
          </h2>
          <Link
            to="/finance/recurring"
            className="flex items-center gap-1 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
          >
            {t('financeDash.viewAll')}
            <ArrowRight aria-hidden className="h-3 w-3 flip-rtl" />
          </Link>
        </header>

        {upcoming.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-400">
            {t('financeDash.noUpcoming')}
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {upcoming.slice(0, 6).map((payment) => {
              const urgency = dueUrgency(payment.nextDueOn);
              const days = daysUntil(payment.nextDueOn);

              return (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {payment.description}
                    </p>
                    <p className="text-2xs text-ink-400">
                      {formatDate(payment.nextDueOn, { language })}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={URGENCY_TONES[urgency]} dot={urgency !== 'normal'}>
                      {urgency === 'overdue'
                        ? t('recurring.due.overdue', { days: Math.abs(days) })
                        : urgency === 'today'
                          ? t('recurring.due.today')
                          : t('recurring.due.soon', { days })}
                    </Badge>
                    <CurrencyDisplay
                      amount={payment.amountH}
                      className="text-sm font-semibold text-ink-900"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
