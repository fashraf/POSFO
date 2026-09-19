import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Badge,
  Button,
  ConfirmModal,
  CurrencyDisplay,
  EmptyState,
  FormField,
  PageHeader,
  PriceInput,
  SearchableSelect,
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
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { commissionService, payrollService, safeCall, userService } from '@/services';
import { netPayH } from '@/types/finance';
import type { CommissionEntry, PayrollLine, PayrollRun } from '@/types/finance';
import { CommissionBreakdown } from '@/features/finance/CommissionBreakdown';

function recentMonths(count = 6): string[] {
  const months: string[] = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

export default function PayrollPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user } = useSession();
  const toast = useToast();
  const [params] = useSearchParams();

  /* Arriving from the period list pre-selects the month that was clicked. */
  useEffect(() => {
    const requested = params.get('period');
    if (requested) setPeriod(requested);
  }, [params]);

  const [period, setPeriod] = useState<string | null>(new Date().toISOString().slice(0, 7));
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [confirming, setConfirming] = useState(false);
  const [breakdownFor, setBreakdownFor] = useState<PayrollLine | null>(null);
  const [breakdown, setBreakdown] = useState<CommissionEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const actor = user ? (language === 'ar' ? user.nameAr : user.nameEn) : 'System';

  const load = useCallback(async () => {
    const result = await safeCall(() => payrollService.list());
    if (result.ok) setRuns(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function buildDraft() {
    if (!period) return;
    setBusy(true);

    const staffResult = await safeCall(() => userService.list());
    if (!staffResult.ok) {
      setBusy(false);
      return;
    }

    /* A default base salary stands in for an HR field the system does not yet
       hold; the figure is editable before paying. */
    const staff = staffResult.data
      .filter((member) => member.status === 'active')
      .map((member) => ({
        userId: member.id,
        nameAr: member.nameAr,
        nameEn: member.nameEn,
        baseSalaryH: 400000,
      }));

    const draft = await safeCall(() => payrollService.draft({ period, staff }));
    if (draft.ok) setLines(draft.data);
    setBusy(false);
  }

  /* Opening the breakdown is how a commission figure stops being something an
     employee has to take on trust. */
  async function openBreakdown(line: PayrollLine) {
    setBreakdownFor(line);
    const result = await safeCall(() => commissionService.list(line.userId, period ?? undefined));
    setBreakdown(result.ok ? result.data : []);
  }

  function updateLine(userId: string, patch: Partial<PayrollLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.userId !== userId) return line;
        const merged = { ...line, ...patch };
        return { ...merged, netPayH: netPayH(merged) };
      }),
    );
  }

  async function pay() {
    if (!period) return;
    setBusy(true);

    const result = await safeCall(() =>
      payrollService.pay({ period, lines, paidOn, actor }),
    );

    setBusy(false);
    setConfirming(false);

    if (result.ok) {
      toast.success(t('payroll.toast.paid'));
      setLines([]);
      await load();
    } else {
      toast.error(t('payroll.toast.failed'), result.error.message);
    }
  }

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const totals = lines.reduce(
    (sum, line) => ({
      salaries: sum.salaries + line.baseSalaryH,
      commission: sum.commission + line.commissionH,
      net: sum.net + line.netPayH,
    }),
    { salaries: 0, commission: 0, net: 0 },
  );

  const alreadyPaid = runs.some((run) => run.period === period && run.status === 'paid');

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('payroll.title')}
        description={t('payroll.description')}
        actions={
          <>
            <SearchableSelect
              size="sm"
              className="w-36"
              value={period}
              onChange={setPeriod}
              options={recentMonths().map((value) => ({ value, label: value }))}
            />
            <Button variant="outline" onClick={buildDraft} loading={busy} disabled={alreadyPaid}>
              {t('payroll.generate')}
            </Button>
            {lines.length > 0 && (
              <Button onClick={() => setConfirming(true)} disabled={totals.net <= 0}>
                {t('payroll.pay')}
              </Button>
            )}
          </>
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      {alreadyPaid && (
        <Alert tone="success" compact>
          {t('payroll.alreadyPaid')} · {period}
        </Alert>
      )}

      {lines.length > 0 && (
        <>
          <Alert tone="tip" compact>
            {t('payroll.commissionFrozen')}
          </Alert>

          <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t('payroll.columns.employee')}</TableHeaderCell>
                  <TableHeaderCell numeric>{t('payroll.columns.base')}</TableHeaderCell>
                  <TableHeaderCell numeric>{t('payroll.columns.commission')}</TableHeaderCell>
                  <TableHeaderCell numeric>{t('payroll.columns.deductions')}</TableHeaderCell>
                  <TableHeaderCell numeric>{t('payroll.columns.net')}</TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.userId}>
                    <TableCell className="font-medium text-ink-900">{nameOf(line)}</TableCell>

                    <TableCell numeric>
                      <PriceInput
                        inputSize="sm"
                        className="w-28"
                        value={fromMinorUnits(line.baseSalaryH)}
                        onChange={(event) =>
                          updateLine(line.userId, {
                            baseSalaryH: toMinorUnits(event.target.value || '0'),
                          })
                        }
                      />
                    </TableCell>

                    {/* Not editable — it is a record of what was earned. Click
                        through to see exactly which sales produced it. */}
                    <TableCell numeric>
                      <button
                        type="button"
                        onClick={() => void openBreakdown(line)}
                        className="rounded px-1.5 py-0.5 transition-colors hover:bg-ink-100"
                        title={t('commissionDetail.view')}
                      >
                        <CurrencyDisplay
                          amount={line.commissionH}
                          className="font-medium text-success-600 underline decoration-dotted underline-offset-2"
                        />
                      </button>
                    </TableCell>

                    <TableCell numeric>
                      <PriceInput
                        inputSize="sm"
                        className="w-24"
                        value={line.deductionsH === 0 ? '' : fromMinorUnits(line.deductionsH)}
                        onChange={(event) =>
                          updateLine(line.userId, {
                            deductionsH: toMinorUnits(event.target.value || '0'),
                          })
                        }
                        placeholder="0.00"
                      />
                    </TableCell>

                    <TableCell numeric>
                      <CurrencyDisplay
                        amount={line.netPayH}
                        className="text-base font-semibold text-ink-900"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-wrap items-center justify-end gap-5 border-t border-ink-200 bg-ink-50/60 px-4 py-2.5 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="text-ink-500">{t('payroll.totals.salaries')}</span>
                <CurrencyDisplay amount={totals.salaries} className="font-medium text-ink-800" />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-ink-500">{t('payroll.totals.commission')}</span>
                <CurrencyDisplay amount={totals.commission} className="font-medium text-ink-800" />
              </span>
              <span className="flex items-center gap-2 rounded-md bg-ink-100 px-3 py-1.5">
                <span className="font-semibold text-ink-900">{t('payroll.totals.net')}</span>
                <CurrencyDisplay amount={totals.net} className="text-lg font-semibold text-ink-900" />
              </span>
            </div>
          </div>
        </>
      )}

      {/* History */}
      <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t('payroll.period')}</TableHeaderCell>
              <TableHeaderCell>{t('payroll.paidOn')}</TableHeaderCell>
              <TableHeaderCell numeric>{t('payroll.totals.net')}</TableHeaderCell>
              <TableHeaderCell>{t('expenses.columns.status')}</TableHeaderCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {runs.length === 0 ? (
              <TableEmptyRow colSpan={4}>
                <EmptyState
                  icon={<Users />}
                  title={t('payroll.empty.title')}
                  description={t('payroll.empty.description')}
                />
              </TableEmptyRow>
            ) : (
              runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="numeric font-medium text-ink-900">{run.period}</TableCell>
                  <TableCell className="text-ink-600">
                    {run.paidOn ? formatDate(run.paidOn, { language }) : '—'}
                  </TableCell>
                  <TableCell numeric>
                    <CurrencyDisplay amount={run.totalH} className="font-medium text-ink-900" />
                  </TableCell>
                  <TableCell>
                    <Badge tone="success" dot>
                      {t('payroll.alreadyPaid')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CommissionBreakdown
        open={Boolean(breakdownFor)}
        onClose={() => setBreakdownFor(null)}
        employeeName={breakdownFor ? nameOf(breakdownFor) : ''}
        period={period ?? ''}
        entries={breakdown}
      />

      <ConfirmModal
        open={confirming}
        title={t('payroll.confirmTitle')}
        description={t('payroll.confirmDescription')}
        confirmLabel={t('payroll.pay')}
        variant="primary"
        loading={busy}
        onConfirm={pay}
        onCancel={() => setConfirming(false)}
      >
        <div className="space-y-2.5">
          <div className="flex items-center justify-between rounded-md bg-ink-50 px-3 py-2 text-sm">
            <span className="text-ink-600">{t('payroll.totals.net')}</span>
            <CurrencyDisplay amount={totals.net} className="font-semibold text-ink-900" />
          </div>

          <FormField label={t('payroll.paidOn')} required>
            <DatePicker
                size="sm"
                value={paidOn}
                onChange={(value) => setPaidOn(value)}
                />
          </FormField>
        </div>
      </ConfirmModal>
    </div>
  );
}
