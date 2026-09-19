import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import {
  Badge,
  Button,
  CurrencyDisplay,
  DataTools,
  EmptyState,
  InfoHint,
  PageHeader,
  RecordMeta,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate, formatNumber, fromMinorUnits } from '@/lib/format';
import { payrollService, safeCall } from '@/services';
import type { PayrollRun } from '@/types/finance';
import type { BadgeTone } from '@/components/ui';

type PeriodStatus = 'paid' | 'draft' | 'due' | 'upcoming';

const STATUS_TONES: Record<PeriodStatus, BadgeTone> = {
  paid: 'success',
  draft: 'info',
  due: 'danger',
  upcoming: 'neutral',
};

interface PeriodRow {
  period: string;
  run: PayrollRun | null;
  status: PeriodStatus;
}

/** The last twelve periods, newest first. */
function recentPeriods(count = 12): string[] {
  const periods: string[] = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    periods.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return periods;
}

/**
 * Payroll by period.
 *
 * Every recent month is listed whether or not a run exists, because the useful
 * thing is spotting the month that was never paid — a list of completed runs
 * cannot show you what is missing.
 */
export default function PayrollListPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const navigate = useNavigate();

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await safeCall(() => payrollService.list());
    if (result.ok) setRuns(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<PeriodRow[]>(() => {
    const thisPeriod = new Date().toISOString().slice(0, 7);

    return recentPeriods().map((period) => {
      const run = runs.find((candidate) => candidate.period === period) ?? null;

      const status: PeriodStatus =
        run?.status === 'paid'
          ? 'paid'
          : run
            ? 'draft'
            : period === thisPeriod
              ? 'upcoming'
              : 'due';

      return { period, run, status };
    });
  }, [runs]);

  const exportRows = rows.map((row) => ({
    period: row.period,
    status: t(`payrollPage.status.${row.status}`),
    employees: row.run?.lines.length ?? 0,
    salaries: row.run ? fromMinorUnits(row.run.lines.reduce((s, l) => s + l.baseSalaryH, 0)) : '',
    commission: row.run ? fromMinorUnits(row.run.lines.reduce((s, l) => s + l.commissionH, 0)) : '',
    net: row.run ? fromMinorUnits(row.run.totalH) : '',
    paidOn: row.run?.paidOn ?? '',
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('payrollPage.title')}
        description={t('payrollPage.description')}
        actions={
          <>
            <DataTools
              rows={exportRows}
              columns={['period', 'status', 'employees', 'salaries', 'commission', 'net', 'paidOn']}
              filename="payroll"
            />
            <Button leadingIcon={<Plus />} onClick={() => navigate('/finance/payroll/run')}>
              {t('payrollPage.newRun')}
            </Button>
          </>
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={5} columns={6} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('payrollPage.columns.period')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('payrollPage.columns.employees')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('payrollPage.columns.salaries')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('payrollPage.columns.commission')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('payrollPage.columns.net')}</TableHeaderCell>
                <TableHeaderCell>{t('payrollPage.columns.status')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.length === 0 ? (
                <TableEmptyRow colSpan={7}>
                  <EmptyState
                    icon={<Users />}
                    title={t('payrollPage.empty.title')}
                    description={t('payrollPage.empty.description')}
                  />
                </TableEmptyRow>
              ) : (
                rows.map((row) => {
                  const salariesH =
                    row.run?.lines.reduce((sum, line) => sum + line.baseSalaryH, 0) ?? 0;
                  const commissionH =
                    row.run?.lines.reduce((sum, line) => sum + line.commissionH, 0) ?? 0;

                  return (
                    <TableRow key={row.period}>
                      <TableCell>
                        <span className="numeric font-medium text-ink-900">{row.period}</span>
                        {row.run && (
                          <RecordMeta
                            className="ms-2"
                            createdAt={row.run.createdAt}
                            updatedAt={row.run.updatedAt}
                            createdBy={row.run.actor}
                          />
                        )}
                      </TableCell>

                      <TableCell numeric className="text-ink-600">
                        {row.run ? formatNumber(row.run.lines.length, { language }) : '—'}
                      </TableCell>

                      <TableCell numeric className="text-ink-600">
                        {row.run ? <CurrencyDisplay amount={salariesH} /> : '—'}
                      </TableCell>

                      <TableCell numeric className="text-success-600">
                        {row.run ? <CurrencyDisplay amount={commissionH} /> : '—'}
                      </TableCell>

                      <TableCell numeric>
                        {row.run ? (
                          <CurrencyDisplay
                            amount={row.run.totalH}
                            className="font-semibold text-ink-900"
                          />
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <Badge tone={STATUS_TONES[row.status]} dot>
                            {t(`payrollPage.status.${row.status}`)}
                          </Badge>
                          <InfoHint content={t(`payrollPage.statusHelp.${row.status}`)} />
                        </span>

                        {row.run?.paidOn && (
                          <span className="block text-2xs text-ink-400">
                            {formatDate(row.run.paidOn, { language })}
                          </span>
                        )}
                      </TableCell>

                      <TableCell align="end">
                        {row.status !== 'paid' && (
                          <Button
                            size="sm"
                            variant={row.status === 'due' ? 'primary' : 'outline'}
                            onClick={() => navigate(`/finance/payroll/run?period=${row.period}`)}
                          >
                            {t('payrollPage.viewRun')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
