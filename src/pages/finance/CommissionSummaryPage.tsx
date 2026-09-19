import { useCallback, useEffect, useMemo, useState } from 'react';
import { Percent, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  CurrencyDisplay,
  DataTools,
  EmptyState,
  InfoHint,
  KpiCard,
  PageHeader,
  SearchableSelect,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { CommissionBreakdown } from '@/features/finance/CommissionBreakdown';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { useI18n, useTranslation } from '@/i18n';
import { formatNumber, fromMinorUnits } from '@/lib/format';
import { commissionService, safeCall, userService } from '@/services';
import type { CommissionEntry } from '@/types/finance';
import type { User } from '@/types/permissions';

function recentPeriods(count = 12): string[] {
  const periods: string[] = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    periods.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return periods;
}

interface Row {
  userId: string;
  name: string;
  sales: number;
  earnedH: number;
  paidH: number;
  outstandingH: number;
}

/**
 * Commission by employee.
 *
 * Earned, paid, and outstanding are kept apart deliberately. Outstanding is a
 * liability the business carries until payroll settles it, and a single
 * "commission" figure would hide whether that money has actually left.
 */
export default function CommissionSummaryPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const navigate = useNavigate();

  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string | null>(new Date().toISOString().slice(0, 7));
  const [detailFor, setDetailFor] = useState<Row | null>(null);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    setLoading(true);
    const [entryResult, staffResult] = await Promise.all([
      safeCall(() => commissionService.list(undefined, period ?? undefined)),
      safeCall(() => userService.list()),
    ]);
    if (entryResult.ok) setEntries(entryResult.data);
    if (staffResult.ok) setStaff(staffResult.data);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const byUser = new Map<string, Row>();

    for (const entry of entries) {
      const member = staff.find((candidate) => candidate.id === entry.userId);

      const current =
        byUser.get(entry.userId) ??
        ({
          userId: entry.userId,
          name: member ? nameOf(member) : entry.userId,
          sales: 0,
          earnedH: 0,
          paidH: 0,
          outstandingH: 0,
        } as Row);

      current.sales += 1;
      current.earnedH += entry.amountH;

      /* Paid is decided by whether a payroll run claimed it, not by a date. */
      if (entry.payrollRunId) current.paidH += entry.amountH;
      else current.outstandingH += entry.amountH;

      byUser.set(entry.userId, current);
    }

    return Array.from(byUser.values()).sort((a, b) => b.earnedH - a.earnedH);
  }, [entries, staff, language]);

  const totals = rows.reduce(
    (sum, row) => ({
      earnedH: sum.earnedH + row.earnedH,
      paidH: sum.paidH + row.paidH,
      outstandingH: sum.outstandingH + row.outstandingH,
    }),
    { earnedH: 0, paidH: 0, outstandingH: 0 },
  );

  const exportRows = rows.map((row) => ({
    employee: row.name,
    sales: row.sales,
    earned: fromMinorUnits(row.earnedH),
    paid: fromMinorUnits(row.paidH),
    outstanding: fromMinorUnits(row.outstandingH),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('commissionPage.title')}
        description={t('commissionPage.description')}
        actions={
          <>
            <SearchableSelect
              size="sm"
              className="w-36"
              value={period}
              onChange={setPeriod}
              options={recentPeriods().map((value) => ({ value, label: value }))}
            />
            <DataTools
              rows={exportRows}
              columns={['employee', 'sales', 'earned', 'paid', 'outstanding']}
              filename="commission"
            />
            <Button
              variant="outline"
              leadingIcon={<Settings2 />}
              onClick={() => navigate('/finance/commission-rules')}
            >
              {t('commissionRules.title')}
            </Button>
          </>
        }
      />

      <FinanceTabs />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('commissionPage.earned')}
              <InfoHint content={t('commissionPage.earnedHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={totals.earnedH} />}
          icon={<Percent />}
        />
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('commissionPage.paid')}
              <InfoHint content={t('commissionPage.paidHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={totals.paidH} className="text-success-600" />}
        />
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('commissionPage.outstanding')}
              <InfoHint content={t('commissionPage.outstandingHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={totals.outstandingH} className="text-warning-700" />}
        />
      </div>

      {totals.outstandingH > 0 && (
        <Alert tone="tip" compact>
          {t('commissionPage.settleHint')}
        </Alert>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={4} columns={5} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('commissionPage.columns.employee')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('commissionPage.columns.sales')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('commissionPage.columns.earned')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('commissionPage.columns.paid')}</TableHeaderCell>
                <TableHeaderCell numeric>
                  {t('commissionPage.columns.outstanding')}
                </TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.length === 0 ? (
                <TableEmptyRow colSpan={6}>
                  <EmptyState
                    icon={<Percent />}
                    title={t('commissionPage.empty.title')}
                    description={t('commissionPage.empty.description')}
                  />
                </TableEmptyRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium text-ink-900">{row.name}</TableCell>

                    <TableCell numeric className="text-ink-600">
                      {formatNumber(row.sales, { language })}
                    </TableCell>

                    <TableCell numeric>
                      <CurrencyDisplay amount={row.earnedH} className="font-medium text-ink-900" />
                    </TableCell>

                    <TableCell numeric>
                      <CurrencyDisplay amount={row.paidH} className="text-success-600" />
                    </TableCell>

                    <TableCell numeric>
                      <CurrencyDisplay
                        amount={row.outstandingH}
                        className="font-semibold text-warning-700"
                      />
                    </TableCell>

                    <TableCell align="end">
                      <Button size="sm" variant="ghost" onClick={() => setDetailFor(row)}>
                        {t('commissionPage.viewDetail')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CommissionBreakdown
        open={Boolean(detailFor)}
        onClose={() => setDetailFor(null)}
        employeeName={detailFor?.name ?? ''}
        period={period ?? ''}
        entries={entries.filter((entry) => entry.userId === detailFor?.userId)}
      />
    </div>
  );
}
