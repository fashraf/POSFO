import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Pause, Play, Plus } from 'lucide-react';
import {
  DatePicker,
  Badge,
  Button,
  ConfirmModal,
  CurrencyDisplay,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  PriceInput,
  SearchableSelect,
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
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate, toMinorUnits } from '@/lib/format';
import { expenseCategoryService, recurringService, safeCall } from '@/services';
import { advanceDueDate, daysUntil, dueUrgency } from '@/types/finance';
import type {
  DueUrgency,
  ExpenseCategory,
  Frequency,
  RecurringPayment,
} from '@/types/finance';
import type { BadgeTone } from '@/components/ui';

/* Subtle by design: a tinted badge, never a red card or an animation. */
const URGENCY_TONES: Record<DueUrgency, BadgeTone> = {
  normal: 'neutral',
  soon: 'warning',
  today: 'danger',
  overdue: 'danger',
};

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

export default function RecurringPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user, activeBranch } = useSession();
  const toast = useToast();

  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState<RecurringPayment | null>(null);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));

  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextDueOn, setNextDueOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<RecurringPayment['paymentMethod']>('bank');
  const [note, setNote] = useState('');

  const actor = user ? (language === 'ar' ? user.nameAr : user.nameEn) : 'System';

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    setLoading(true);
    const [paymentResult, categoryResult] = await Promise.all([
      safeCall(() => recurringService.list()),
      safeCall(() => expenseCategoryService.list()),
    ]);
    if (paymentResult.ok) setPayments(paymentResult.data);
    if (categoryResult.ok) setCategories(categoryResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!creating) return;
    setDescription('');
    setCategoryId(null);
    setAmount('');
    setFrequency('monthly');
    setNextDueOn(new Date().toISOString().slice(0, 10));
    setMethod('bank');
    setNote('');
  }, [creating]);

  function dueLabel(payment: RecurringPayment) {
    const urgency = dueUrgency(payment.nextDueOn);
    const days = daysUntil(payment.nextDueOn);

    if (urgency === 'overdue') return t('recurring.due.overdue', { days: Math.abs(days) });
    if (urgency === 'today') return t('recurring.due.today');
    return t('recurring.due.soon', { days });
  }

  async function create() {
    setBusy(true);
    const result = await safeCall(() =>
      recurringService.create({
        description,
        categoryId: categoryId ?? '',
        amountH: toMinorUnits(amount || '0'),
        frequency,
        nextDueOn,
        paymentMethod: method,
        note,
        branchId: activeBranch?.id ?? null,
      }),
    );
    setBusy(false);

    if (result.ok) {
      toast.success(t('recurring.toast.created'));
      setCreating(false);
      await load();
    } else {
      toast.error(t('recurring.toast.failed'), result.error.message);
    }
  }

  async function record() {
    if (!recording) return;
    setBusy(true);

    const result = await safeCall(() =>
      recurringService.recordInstalment({ id: recording.id, paidOn, actor }),
    );
    setBusy(false);

    if (result.ok) {
      toast.success(t('recurring.toast.recorded'));
      setRecording(null);
      await load();
    } else {
      toast.error(t('recurring.toast.failed'), result.error.message);
    }
  }

  async function toggle(payment: RecurringPayment) {
    const result = await safeCall(() =>
      recurringService.setStatus(payment.id, payment.status === 'active' ? 'paused' : 'active'),
    );
    if (result.ok) await load();
    else toast.error(t('recurring.toast.failed'), result.error.message);
  }

  const categoryName = (id: string) => {
    const category = categories.find((candidate) => candidate.id === id);
    return category ? nameOf(category) : '—';
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('recurring.title')}
        description={t('recurring.description')}
        actions={
          <Button leadingIcon={<Plus />} onClick={() => setCreating(true)}>
            {t('recurring.add')}
          </Button>
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
                <TableHeaderCell>{t('recurring.columns.description')}</TableHeaderCell>
                <TableHeaderCell>{t('recurring.columns.category')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('recurring.columns.amount')}</TableHeaderCell>
                <TableHeaderCell>{t('recurring.columns.frequency')}</TableHeaderCell>
                <TableHeaderCell>{t('recurring.columns.nextDue')}</TableHeaderCell>
                <TableHeaderCell>{t('recurring.columns.lastPaid')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {payments.length === 0 ? (
                <TableEmptyRow colSpan={7}>
                  <EmptyState
                    icon={<CalendarClock />}
                    title={t('recurring.empty.title')}
                    description={t('recurring.empty.description')}
                    action={<Button onClick={() => setCreating(true)}>{t('recurring.add')}</Button>}
                  />
                </TableEmptyRow>
              ) : (
                payments.map((payment) => {
                  const urgency = dueUrgency(payment.nextDueOn);
                  const paused = payment.status === 'paused';

                  return (
                    <TableRow key={payment.id} className={cn(paused && 'opacity-60')}>
                      <TableCell className="font-medium text-ink-900">
                        {payment.description}
                        {paused && (
                          <Badge tone="neutral" className="ms-1.5">
                            {t('recurring.status.paused')}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-ink-600">
                        {categoryName(payment.categoryId)}
                      </TableCell>

                      <TableCell numeric className="font-medium text-ink-900">
                        <CurrencyDisplay amount={payment.amountH} />
                      </TableCell>

                      <TableCell className="text-ink-600">
                        {t(`recurring.frequency.${payment.frequency}`)}
                      </TableCell>

                      <TableCell>
                        <span className="flex flex-col gap-1">
                          <span className="numeric text-xs text-ink-700">
                            {formatDate(payment.nextDueOn, { language })}
                          </span>
                          {!paused && (
                            <Badge tone={URGENCY_TONES[urgency]} dot={urgency !== 'normal'}>
                              {dueLabel(payment)}
                            </Badge>
                          )}
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-500">
                        {payment.lastPaidOn
                          ? formatDate(payment.lastPaidOn, { language })
                          : '—'}
                      </TableCell>

                      <TableCell align="end">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant={urgency === 'normal' ? 'outline' : 'primary'}
                            disabled={paused}
                            onClick={() => {
                              setRecording(payment);
                              setPaidOn(new Date().toISOString().slice(0, 10));
                            }}
                          >
                            {t('recurring.record')}
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={paused ? t('recurring.resume') : t('recurring.pause')}
                            onClick={() => void toggle(payment)}
                          >
                            {paused ? (
                              <Play className="h-3.5 w-3.5" />
                            ) : (
                              <Pause className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size="md"
        title={t('recurring.add')}
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={create}
              loading={busy}
              disabled={!description.trim() || !categoryId || toMinorUnits(amount || '0') <= 0}
            >
              {t('recurring.add')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label={t('recurring.fields.description')} required>
            <Input
              inputSize="sm"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Shop rent"
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('recurring.fields.category')} required>
              <SearchableSelect
                size="sm"
                value={categoryId}
                onChange={setCategoryId}
                options={categories
                  .filter((category) => category.status === 'active')
                  .map((category) => ({ value: category.id, label: nameOf(category) }))}
              />
            </FormField>

            <FormField label={t('recurring.fields.amount')} required>
              <PriceInput
                inputSize="sm"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </FormField>

            <FormField label={t('recurring.fields.frequency')}>
              <SearchableSelect
                size="sm"
                value={frequency}
                onChange={(value) => setFrequency((value ?? 'monthly') as Frequency)}
                options={FREQUENCIES.map((value) => ({
                  value,
                  label: t(`recurring.frequency.${value}`),
                }))}
              />
            </FormField>

            <FormField label={t('recurring.fields.nextDue')} required>
              <DatePicker
                size="sm"
                value={nextDueOn}
                onChange={(value) => setNextDueOn(value)}
                />
            </FormField>

            <FormField label={t('recurring.fields.method')}>
              <SearchableSelect
                size="sm"
                value={method}
                onChange={(value) =>
                  setMethod((value ?? 'bank') as RecurringPayment['paymentMethod'])
                }
                options={[
                  { value: 'bank', label: t('vendors.payment.bank') },
                  { value: 'cash', label: t('pos.payment.cash') },
                  { value: 'card', label: t('pos.payment.card') },
                ]}
              />
            </FormField>
          </div>

          <FormField label={t('recurring.fields.note')} showOptional>
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </div>
      </Modal>

      {/* Record instalment */}
      <ConfirmModal
        open={Boolean(recording)}
        title={t('recurring.recordTitle')}
        description={t('recurring.recordDescription')}
        confirmLabel={t('recurring.record')}
        variant="primary"
        loading={busy}
        onConfirm={record}
        onCancel={() => setRecording(null)}
      >
        {recording && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-md bg-ink-50 px-3 py-2 text-sm">
              <span className="text-ink-600">{recording.description}</span>
              <CurrencyDisplay amount={recording.amountH} className="font-semibold text-ink-900" />
            </div>

            <FormField label={t('recurring.paidOn')} required>
              <DatePicker
                size="sm"
                value={paidOn}
                onChange={(value) => setPaidOn(value)}
                />
            </FormField>

            {/* The schedule rolls from the due date, not from today, so paying
                late does not drag every future instalment with it. */}
            <p className="text-2xs text-ink-500">
              {t('recurring.nextAfter', {
                date: advanceDueDate(recording.nextDueOn, recording.frequency),
              })}
            </p>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
