import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  CircleDollarSign,
  PackageOpen,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
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
  Button,
  ChartCard,
  CurrencyDisplay,
  EmptyState,
  InfoHint,
  KpiCard,
  PageHeader,
  SkeletonCards,
  Tabs,
} from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { catalogService, customerService, safeCall, salesService } from '@/services';
import type { Product } from '@/types/catalog';
import type { Sale } from '@/types/sales';

type Period = 'today' | 'week' | 'month';

const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30 };

const METHOD_COLOURS: Record<string, string> = {
  cash: '#1F7A63',
  card: '#1D6FA5',
  credit: '#B26A00',
};

interface Analytics {
  salesH: number;
  transactions: number;
  averageH: number;
  grossProfitH: number;
  previous: { salesH: number; transactions: number; averageH: number; grossProfitH: number };
  daily: { date: string; salesH: number }[];
  byMethod: { method: string; amountH: number }[];
  topItems: { itemId: string; nameAr: string; nameEn: string; quantity: number; revenueH: number }[];
}

/** Signed change ratio, or undefined when there is no baseline to compare to. */
function changeRatio(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return (current - previous) / previous;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch } = useSession();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>('week');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [receivables, setReceivables] = useState({ outstandingH: 0, overLimit: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [analyticsResult, recentResult, lowStockResult, receivablesResult] = await Promise.all([
      safeCall(() => salesService.analytics(PERIOD_DAYS[period], activeBranch?.id ?? null)),
      safeCall(() => salesService.recent(5, activeBranch?.id ?? null)),
      safeCall(() => catalogService.lowStock(5)),
      safeCall(() => customerService.receivablesSummary()),
    ]);

    if (analyticsResult.ok) setAnalytics(analyticsResult.data);
    if (recentResult.ok) setRecent(recentResult.data);
    if (lowStockResult.ok) setLowStock(lowStockResult.data);
    if (receivablesResult.ok) {
      setReceivables({
        outstandingH: receivablesResult.data.outstandingH,
        overLimit: receivablesResult.data.overLimit,
      });
    }

    setLoading(false);
  }, [period, activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const hasSales = (analytics?.transactions ?? 0) > 0;

  /* One line summarising what, if anything, wants attention. Reading it should
     be enough to know whether the rest of the page needs a look. */
  const insight = useMemo(() => {
    if (lowStock.length > 0) {
      return {
        tone: 'warning' as const,
        text: t('dashboard.insight.lowStockCount', { count: lowStock.length }),
      };
    }
    if (receivables.overLimit > 0) {
      return {
        tone: 'warning' as const,
        text: t('dashboard.insight.overLimitCount', { count: receivables.overLimit }),
      };
    }
    if (!hasSales) {
      return { tone: 'tip' as const, text: t('dashboard.insight.noSalesToday') };
    }
    return { tone: 'success' as const, text: t('dashboard.insight.allGood') };
  }, [lowStock.length, receivables.overLimit, hasSales, t]);

  const chartData = useMemo(
    () =>
      (analytics?.daily ?? []).map((entry) => ({
        label: new Date(entry.date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-GB', {
          day: '2-digit',
          month: 'short',
          numberingSystem: 'latn',
        }),
        value: entry.salesH / 100,
      })),
    [analytics, language],
  );

  const methodData = useMemo(
    () =>
      (analytics?.byMethod ?? []).map((entry) => ({
        name: t(`pos.payment.${entry.method as 'cash' | 'card' | 'credit'}`),
        value: entry.amountH / 100,
        method: entry.method,
      })),
    [analytics, t],
  );

  if (loading && !analytics) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('dashboard.title')} description={t('dashboard.description')} />
        <SkeletonCards />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <Tabs
            variant="pill"
            value={period}
            onChange={(value) => setPeriod(value as Period)}
            aria-label={t('dashboard.title')}
            items={[
              { value: 'today', label: t('dashboard.period.today') },
              { value: 'week', label: t('dashboard.period.week') },
              { value: 'month', label: t('dashboard.period.month') },
            ]}
          />
        }
      />

      <Alert tone={insight.tone} compact>
        {insight.text}
      </Alert>

      {/* KPIs. Each carries a tooltip explaining exactly what it counts, because
          "gross profit" means different things to different people. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('dashboard.kpi.sales')}
              <InfoHint content={t('dashboard.kpi.salesHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={analytics?.salesH ?? 0} />}
          change={changeRatio(analytics?.salesH ?? 0, analytics?.previous.salesH ?? 0)}
          changeLabel={t('dashboard.kpi.vsPrevious')}
          icon={<CircleDollarSign />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('dashboard.kpi.transactions')}
              <InfoHint content={t('dashboard.kpi.transactionsHelp')} />
            </span>
          }
          value={
            <span className="numeric">{formatNumber(analytics?.transactions ?? 0, { language })}</span>
          }
          change={changeRatio(analytics?.transactions ?? 0, analytics?.previous.transactions ?? 0)}
          changeLabel={t('dashboard.kpi.vsPrevious')}
          icon={<Receipt />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('dashboard.kpi.average')}
              <InfoHint content={t('dashboard.kpi.averageHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={analytics?.averageH ?? 0} />}
          change={changeRatio(analytics?.averageH ?? 0, analytics?.previous.averageH ?? 0)}
          changeLabel={t('dashboard.kpi.vsPrevious')}
          icon={<ShoppingBag />}
        />

        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('dashboard.kpi.grossProfit')}
              <InfoHint content={t('dashboard.kpi.grossProfitHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={analytics?.grossProfitH ?? 0} />}
          change={changeRatio(analytics?.grossProfitH ?? 0, analytics?.previous.grossProfitH ?? 0)}
          changeLabel={t('dashboard.kpi.vsPrevious')}
          icon={<TrendingUp />}
        />
      </div>

      {!hasSales ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-surface">
          <EmptyState
            icon={<Banknote />}
            title={t('dashboard.empty.title')}
            description={t('dashboard.empty.description')}
            action={
              <Button onClick={() => navigate(ROUTES.pos)}>{t('dashboard.empty.action')}</Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title={
                <span className="flex items-center gap-1.5">
                  {t('dashboard.charts.trend')}
                  <InfoHint content={t('dashboard.charts.trendHelp')} />
                </span>
              }
              description={t('dashboard.charts.trendHelp')}
            >
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
                    width={52}
                    orientation={language === 'ar' ? 'right' : 'left'}
                  />
                  <RechartsTooltip
                    cursor={{ fill: '#EFF1F3' }}
                    formatter={(value: number) => formatCurrency(value, { language, fromMinorUnits: false })}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #E3E6EA',
                      fontSize: 12,
                      boxShadow: '0 6px 16px -4px rgb(20 24 29 / 0.09)',
                    }}
                  />
                  <Bar dataKey="value" fill="#1F7A63" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title={
                <span className="flex items-center gap-1.5">
                  {t('dashboard.charts.byMethod')}
                  <InfoHint content={t('dashboard.charts.byMethodHelp')} />
                </span>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={methodData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {methodData.map((entry) => (
                      <Cell key={entry.method} fill={METHOD_COLOURS[entry.method] ?? '#9AA4B0'} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => formatCurrency(value, { language, fromMinorUnits: false })}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #E3E6EA',
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span style={{ fontSize: 12, color: '#4B5561' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Recent sales */}
            <section className="rounded-lg border border-ink-200 bg-surface lg:col-span-2">
              <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
                <h2 className="text-md font-semibold text-ink-900">
                  {t('dashboard.lists.recentSales')}
                </h2>
                <Link
                  to={ROUTES.sales}
                  className="flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
                >
                  {t('dashboard.lists.viewAll')}
                  <ArrowRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
                </Link>
              </header>

              {recent.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<Receipt />}
                  title={t('dashboard.lists.noSales')}
                  description={t('dashboard.lists.noSalesHint')}
                />
              ) : (
                <ul className="divide-y divide-ink-200">
                  {recent.map((sale) => (
                    <li key={sale.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="numeric truncate text-base font-medium text-ink-900">
                          {sale.invoiceNumber}
                        </p>
                        <p className="text-xs text-ink-400">
                          {formatDate(sale.soldAt, { language, withTime: true })} ·{' '}
                          {t(`pos.payment.${sale.payments[0]?.method ?? 'cash'}`)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {sale.status !== 'completed' && (
                          <Badge tone={sale.status === 'voided' ? 'danger' : 'warning'}>
                            {t(`sales.status.${sale.status}`)}
                          </Badge>
                        )}
                        <CurrencyDisplay
                          amount={sale.totalH}
                          className={cn(
                            'font-semibold',
                            sale.status === 'voided'
                              ? 'text-ink-400 line-through'
                              : 'text-ink-900',
                          )}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Attention column */}
            <div className="space-y-4">
              <section className="rounded-lg border border-ink-200 bg-surface">
                <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
                  <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-900">
                    <PackageOpen aria-hidden className="h-4 w-4 text-ink-400" />
                    {t('dashboard.lists.lowStock')}
                    <InfoHint content={t('dashboard.lists.lowStockHelp')} />
                  </h2>
                </header>

                {lowStock.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-ink-400">
                    {t('dashboard.lists.allStocked')}
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-200">
                    {lowStock.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-5 py-2.5"
                      >
                        <span className="min-w-0 truncate text-base text-ink-800">
                          {nameOf(item)}
                        </span>
                        <Badge tone={item.stockQuantity === 0 ? 'danger' : 'warning'} dot>
                          {formatNumber(item.stockQuantity, { language })}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="border-t border-ink-200 px-5 py-2.5">
                  <Link
                    to={ROUTES.catalog}
                    className="flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
                  >
                    {t('dashboard.lists.viewAll')}
                    <ArrowRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
                  </Link>
                </div>
              </section>

              <section className="rounded-lg border border-ink-200 bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-ink-500">{t('dashboard.lists.receivables')}</p>
                    <CurrencyDisplay
                      amount={receivables.outstandingH}
                      className="mt-0.5 block text-xl font-semibold text-ink-900"
                    />
                  </div>
                  <span
                    aria-hidden
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-100 text-ink-400"
                  >
                    <Wallet className="h-4 w-4" />
                  </span>
                </div>

                {receivables.outstandingH === 0 ? (
                  <p className="mt-2 text-sm text-ink-400">
                    {t('dashboard.lists.noReceivables')}
                  </p>
                ) : (
                  <Link
                    to={ROUTES.customers}
                    className="mt-3 flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
                  >
                    {t('dashboard.lists.viewAll')}
                    <ArrowRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
                  </Link>
                )}
              </section>
            </div>
          </div>

          {/* Top items */}
          {(analytics?.topItems.length ?? 0) > 0 && (
            <section className="rounded-lg border border-ink-200 bg-surface">
              <header className="border-b border-ink-200 px-5 py-3.5">
                <h2 className="flex items-center gap-1.5 text-md font-semibold text-ink-900">
                  {t('dashboard.charts.topItems')}
                  <InfoHint content={t('dashboard.charts.topItemsHelp')} />
                </h2>
              </header>

              <ul className="divide-y divide-ink-200">
                {analytics?.topItems.map((item, index) => (
                  <li key={item.itemId} className="flex items-center gap-3 px-5 py-3">
                    <span
                      aria-hidden
                      className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-2xs font-semibold text-ink-500"
                    >
                      {index + 1}
                    </span>

                    <span className="min-w-0 flex-1 truncate text-base text-ink-800">
                      {nameOf(item)}
                    </span>

                    <span className="numeric shrink-0 text-sm text-ink-400">
                      ×{formatNumber(item.quantity, { language })}
                    </span>

                    <CurrencyDisplay
                      amount={item.revenueH}
                      className="shrink-0 font-medium text-ink-900"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
