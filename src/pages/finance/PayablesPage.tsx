import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Wallet } from 'lucide-react';
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
import { safeCall, vendorService } from '@/services';
import { ageBucket, ageInDays, agingTotals } from '@/types/finance';
import type { AgeBucket, AgingRow } from '@/types/finance';
import type { BadgeTone } from '@/components/ui';
import { ROUTES } from '@/routes/paths';

const BUCKET_TONES: Record<AgeBucket, BadgeTone> = {
  current: 'neutral',
  d30: 'warning',
  d60: 'warning',
  d90: 'danger',
};

export default function PayablesPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const navigate = useNavigate();

  const [rows, setRows] = useState<(AgingRow & { contact: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);

    const result = await safeCall(() => vendorService.list());
    if (!result.ok) {
      setLoading(false);
      return;
    }

    const owed = result.data.filter((vendor) => vendor.balanceH > 0);

    const built = await Promise.all(
      owed.map(async (vendor) => {
        const ledger = await safeCall(() => vendorService.ledger(vendor.id));
        const firstPurchase =
          ledger.ok && ledger.data.length > 0
            ? (ledger.data.find((entry) => entry.kind === 'purchase')?.date ?? null)
            : null;

        const oldestIso = firstPurchase ?? vendor.updatedAt;

        return {
          id: vendor.id,
          nameAr: vendor.nameAr,
          nameEn: vendor.nameEn,
          balanceH: vendor.balanceH,
          oldestIso,
          bucket: ageBucket(oldestIso),
          ageDays: ageInDays(oldestIso),
          contact: vendor.contactPerson || vendor.phone,
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
      `${row.nameAr} ${row.nameEn} ${row.contact}`.toLocaleLowerCase().includes(needle),
    );
  }, [rows, debounced]);

  const totalH = rows.reduce((sum, row) => sum + row.balanceH, 0);
  const totals = agingTotals(rows);
  const staleH = totals.d60 + totals.d90;

  return (
    <div className="space-y-4">
      <PageHeader title={t('payables.title')} description={t('payables.description')} />

      <FinanceTabs />

      <ScopeBanner />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label={t('payables.outstanding')}
          value={<CurrencyDisplay amount={totalH} />}
          icon={<Wallet />}
        />
        <KpiCard
          label={t('payables.vendors')}
          value={<span className="numeric">{formatNumber(rows.length, { language })}</span>}
          icon={<Building2 />}
        />
      </div>

      {rows.length > 0 && <AgingStrip rows={rows} />}

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
                <TableHeaderCell>{t('payables.columns.vendor')}</TableHeaderCell>
                <TableHeaderCell>{t('payables.columns.contact')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('payables.columns.balance')}</TableHeaderCell>
                <TableHeaderCell>{t('payables.columns.oldest')}</TableHeaderCell>
                <TableHeaderCell>{t('payables.columns.age')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={6}>
                  <EmptyState
                    icon={<Building2 />}
                    title={t('payables.empty.title')}
                    description={t('payables.empty.description')}
                  />
                </TableEmptyRow>
              ) : (
                visible.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-ink-900">{nameOf(row)}</TableCell>
                    <TableCell className="text-ink-600">{row.contact || '—'}</TableCell>

                    <TableCell numeric>
                      <CurrencyDisplay
                        amount={row.balanceH}
                        className={cn(
                          'font-medium',
                          row.bucket === 'd90' ? 'text-danger-600' : 'text-warning-700',
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
                      <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.vendors)}>
                        {t('payables.pay')}
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
