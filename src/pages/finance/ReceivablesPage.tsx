import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins, Users, Wallet } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  CurrencyDisplay,
  EmptyState,
  KpiCard,
  PageHeader,
  SearchInput,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { AgingStrip } from '@/features/finance/AgingStrip';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { customerService, safeCall } from '@/services';
import { ageBucket, ageInDays, agingTotals } from '@/types/finance';
import type { AgeBucket, AgingRow } from '@/types/finance';
import type { BadgeTone } from '@/components/ui';

const BUCKET_TONES: Record<AgeBucket, BadgeTone> = {
  current: 'neutral',
  d30: 'warning',
  d60: 'warning',
  d90: 'danger',
};

export default function ReceivablesPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const navigate = useNavigate();

  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);

    const result = await safeCall(() => customerService.list());
    if (!result.ok) {
      setLoading(false);
      return;
    }

    /* Age from the oldest unsettled movement on the statement, not from the
       customer record — a long-standing customer with a debt from last week
       is not 400 days overdue. */
    const owing = result.data.filter((customer) => customer.balanceH > 0);

    const built = await Promise.all(
      owing.map(async (customer) => {
        const statement = await safeCall(() => customerService.statement(customer.id));
        const firstUnsettled =
          statement.ok && statement.data.length > 0
            ? (statement.data.find(
                (entry) =>
                  entry.kind === 'credit_sale' ||
                  entry.kind === 'opening_balance' ||
                  entry.kind === 'balance_forward',
              )?.date ?? null)
            : null;

        const oldestIso = firstUnsettled ?? customer.updatedAt;

        return {
          id: customer.id,
          nameAr: customer.nameAr,
          nameEn: customer.nameEn,
          balanceH: customer.balanceH,
          oldestIso,
          bucket: ageBucket(oldestIso),
          ageDays: ageInDays(oldestIso),
        };
      }),
    );

    setRows(built.sort((a, b) => b.ageDays - a.ageDays));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const visible = useMemo(() => {
    const needle = debounced.trim().toLocaleLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      `${row.nameAr} ${row.nameEn}`.toLocaleLowerCase().includes(needle),
    );
  }, [rows, debounced]);

  const totalH = rows.reduce((sum, row) => sum + row.balanceH, 0);
  const oldest = rows[0]?.ageDays ?? 0;
  const totals = agingTotals(rows);
  const staleH = totals.d60 + totals.d90;

  return (
    <div className="space-y-4">
      <PageHeader title={t('receivables.title')} description={t('receivables.description')} />

      <FinanceTabs />

      <ScopeBanner />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label={t('receivables.outstanding')}
          value={<CurrencyDisplay amount={totalH} />}
          icon={<Wallet />}
        />
        <KpiCard
          label={t('receivables.customers')}
          value={<span className="numeric">{formatNumber(rows.length, { language })}</span>}
          icon={<Users />}
        />
        <KpiCard
          label={t('receivables.oldest')}
          value={<span className="numeric">{t('aging.days', { days: oldest })}</span>}
          icon={<HandCoins />}
          invertTrend
        />
      </div>

      {rows.length > 0 && <AgingStrip rows={rows} />}

      {/* Stale debt is the thing worth acting on, so it gets said explicitly. */}
      {staleH > 0 && (
        <Alert tone="warning" compact>
          {t('aging.staleWarning', { amount: formatCurrency(staleH, { language }) })}
        </Alert>
      )}

      <SearchInput
        className="sm:max-w-xs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onClear={() => setSearch('')}
      />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={4} columns={4} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('receivables.columns.customer')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('receivables.columns.balance')}</TableHeaderCell>
                <TableHeaderCell>{t('receivables.columns.oldest')}</TableHeaderCell>
                <TableHeaderCell>{t('receivables.columns.age')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={5}>
                  <EmptyState
                    icon={<Wallet />}
                    title={t('receivables.empty.title')}
                    description={t('receivables.empty.description')}
                  />
                </TableEmptyRow>
              ) : (
                visible.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-ink-900">{nameOf(row)}</TableCell>

                    <TableCell numeric>
                      <CurrencyDisplay
                        amount={row.balanceH}
                        className={cn(
                          'font-medium',
                          row.bucket === 'd90' ? 'text-danger-600' : 'text-ink-900',
                        )}
                      />
                    </TableCell>

                    <TableCell className="text-ink-600">
                      {row.oldestIso ? formatDate(row.oldestIso, { language }) : '—'}
                    </TableCell>

                    <TableCell>
                      <Badge tone={BUCKET_TONES[row.bucket]} dot={row.bucket !== 'current'}>
                        {t('aging.days', { days: row.ageDays })}
                      </Badge>
                    </TableCell>

                    <TableCell align="end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/finance/receivables/${row.id}/collect`)}
                      >
                        {t('receivables.collect')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
