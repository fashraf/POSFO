import { useCallback, useEffect, useState } from 'react';
import { Plus, Receipt, RotateCcw } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmModal,
  CurrencyDisplay,
  EmptyState,
  FormField,
  PageHeader,
  RecordMeta,
  DataTools,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { ExpenseForm } from '@/features/finance/ExpenseForm';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate } from '@/lib/format';
import { expenseCategoryService, expenseService, safeCall } from '@/services';
import { monthsBetween } from '@/types/finance';
import type { Expense, ExpenseCategory } from '@/types/finance';

export default function ExpensesPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user, activeBranch } = useSession();
  const toast = useToast();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reversing, setReversing] = useState<Expense | null>(null);
  const [reason, setReason] = useState('');


  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    setLoading(true);
    const [expenseResult, categoryResult] = await Promise.all([
      safeCall(() => expenseService.list()),
      safeCall(() => expenseCategoryService.list()),
    ]);
    if (expenseResult.ok) setExpenses(expenseResult.data);
    if (categoryResult.ok) setCategories(categoryResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* A year selected from the start date, so the common case is one click. */
  async function reverse() {
    if (!reversing) return;
    setSaving(true);

    const result = await safeCall(() =>
      expenseService.reverse(reversing.id, reason, user ? nameOf(user) : 'System'),
    );

    setSaving(false);

    if (result.ok) {
      toast.success(t('expenses.toast.reversed'));
      setReversing(null);
      setReason('');
      await load();
    } else {
      toast.error(t('expenses.toast.failed'), result.error.message);
    }
  }

  const categoryName = (id: string) => {
    const category = categories.find((candidate) => candidate.id === id);
    return category ? nameOf(category) : '—';
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('expenses.title')}
        description={t('expenses.description')}
        actions={
          <>
            <DataTools
              rows={expenses.map((expense) => ({
                reference: expense.reference,
                category: categoryName(expense.categoryId),
                amount: (expense.amountH / 100).toFixed(2),
                vat: (expense.vatH / 100).toFixed(2),
                paidOn: expense.paidOn,
                method: expense.paymentMethod,
                status: expense.status,
              }))}
              columns={['reference', 'category', 'amount', 'vat', 'paidOn', 'method', 'status']}
              filename="expenses"
            />
            <Button leadingIcon={<Plus />} onClick={() => setCreating(true)}>
              {t('expenses.add')}
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
                <TableHeaderCell>{t('expenses.columns.reference')}</TableHeaderCell>
                <TableHeaderCell>{t('expenses.columns.category')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('expenses.columns.amount')}</TableHeaderCell>
                <TableHeaderCell>{t('expenses.columns.paidOn')}</TableHeaderCell>
                <TableHeaderCell>{t('expenses.columns.period')}</TableHeaderCell>
                <TableHeaderCell>{t('expenses.columns.status')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {expenses.length === 0 ? (
                <TableEmptyRow colSpan={7}>
                  <EmptyState
                    icon={<Receipt />}
                    title={t('expenses.empty.title')}
                    description={t('expenses.empty.description')}
                    action={
                      <Button onClick={() => setCreating(true)}>{t('expenses.add')}</Button>
                    }
                  />
                </TableEmptyRow>
              ) : (
                expenses.map((expense) => {
                  const months = monthsBetween(expense.periodStart, expense.periodEnd);
                  return (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <span className="numeric font-medium text-ink-900">
                          {expense.reference}
                        </span>
                        <RecordMeta
                          className="ms-2"
                          createdAt={expense.createdAt}
                          updatedAt={expense.updatedAt}
                          createdBy={expense.actor}
                        />
                      </TableCell>
                      <TableCell className="text-ink-700">
                        {categoryName(expense.categoryId)}
                        {expense.note && (
                          <span className="block truncate text-2xs text-ink-400">
                            {expense.note}
                          </span>
                        )}
                      </TableCell>
                      <TableCell numeric className="font-medium text-ink-900">
                        <CurrencyDisplay amount={expense.amountH} />
                      </TableCell>
                      <TableCell className="text-ink-600">
                        {formatDate(expense.paidOn, { language })}
                      </TableCell>
                      <TableCell className="text-ink-600">
                        {expense.recognition === 'one_time' ? (
                          <span className="text-ink-400">—</span>
                        ) : (
                          <span className="numeric text-xs">
                            {months.length > 1
                              ? `${months[0]} → ${months[months.length - 1]}`
                              : months[0]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge tone={expense.status === 'posted' ? 'success' : 'danger'} dot>
                          {t(`expenses.status.${expense.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell align="end">
                        {expense.status === 'posted' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            leadingIcon={<RotateCcw />}
                            onClick={() => setReversing(expense)}
                          >
                            {t('ledger.reverse')}
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

      <ExpenseForm
        open={creating}
        onClose={() => setCreating(false)}
        categories={categories}
        onSubmit={async (input) => {
          const result = await safeCall(() =>
            expenseService.create({
              ...input,
              actor: user ? nameOf(user) : 'System',
              branchId: activeBranch?.id ?? null,
            }),
          );

          if (result.ok) {
            toast.success(t('expenses.toast.created'));
            await load();
            return true;
          }

          toast.error(t('expenses.toast.failed'), result.error.message);
          return false;
        }}
      />

      <ConfirmModal
        open={Boolean(reversing)}
        title={t('expenses.reverseTitle')}
        description={t('expenses.reverseDescription')}
        confirmLabel={t('ledger.reverse')}
        variant="danger"
        loading={saving}
        onConfirm={reverse}
        onCancel={() => {
          setReversing(null);
          setReason('');
        }}
      >
        <FormField label={t('expenses.reverseReason')} required>
          <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </ConfirmModal>
    </div>
  );
}
