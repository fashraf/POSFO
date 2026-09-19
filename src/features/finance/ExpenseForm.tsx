import { useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Button,
  CurrencyDisplay,
  FormField,
  ImpactConfirm,
  Input,
  Modal,
  PriceInput,
  SearchableSelect,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useI18n, useTranslation } from '@/i18n';
import { formatCurrency, toMinorUnits } from '@/lib/format';
import { monthsBetween } from '@/types/finance';
import type { Expense, ExpenseCategory, RecognitionMode } from '@/types/finance';
import type { ExpenseInput } from '@/services';

const VAT_RATE = 0.15;
const today = () => new Date().toISOString().slice(0, 10);

export interface ExpenseFormProps {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  onSubmit: (input: Omit<ExpenseInput, 'actor' | 'branchId'> & { reference: string }) => Promise<boolean>;
}

/**
 * Record an expense.
 *
 * Two things this form refuses to make the user do: work out VAT by hand, and
 * work out what a year of rent costs per month. Both are shown as they type.
 */
export function ExpenseForm({ open, onClose, categories, onSubmit }: ExpenseFormProps) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [hasVat, setHasVat] = useState(true);
  const [method, setMethod] = useState<Expense['paymentMethod']>('bank');
  const [paidOn, setPaidOn] = useState(today());
  const [spreads, setSpreads] = useState(false);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [reference, setReference] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [touchedTo, setTouchedTo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setCategoryId(null);
    setAmount('');
    setHasVat(true);
    setMethod('bank');
    setPaidOn(today());
    setSpreads(false);
    setFrom(today());
    setTo(today());
    setReference('');
    setAttachment(null);
    setNotes('');
    setTouchedTo(false);
    setConfirming(false);
  }, [open]);

  const totalH = toMinorUnits(amount || '0');

  /* VAT is extracted from the gross, the Saudi retail convention — the price
     quoted already includes it. */
  const vatH = hasVat ? Math.round((totalH * VAT_RATE) / (1 + VAT_RATE)) : 0;
  const netH = totalH - vatH;

  const dateError = spreads && new Date(to) < new Date(from) ? t('expenseForm.toBeforeFrom') : null;

  const months = useMemo(
    () => (spreads ? monthsBetween(from, to) : []),
    [spreads, from, to],
  );

  const perMonthH = months.length > 0 ? Math.floor(netH / months.length) : netH;

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const valid =
    description.trim() !== '' && categoryId !== null && totalH > 0 && dateError === null;

  async function submit() {
    setBusy(true);

    const succeeded = await onSubmit({
      categoryId: categoryId ?? '',
      amountH: totalH,
      vatH,
      paymentMethod: method,
      paidOn,
      recognition: (spreads ? 'custom' : 'one_time') as RecognitionMode,
      periodStart: from,
      periodEnd: to,
      note: [description.trim(), notes.trim()].filter(Boolean).join(' — '),
      attachmentName: attachment,
      reference: reference.trim(),
    });

    setBusy(false);
    setConfirming(false);
    if (succeeded) onClose();
  }

  return (
    <>
      <Modal
        open={open && !confirming}
        onClose={onClose}
        size="lg"
        title={t('expenseForm.title')}
        description={t('expenseForm.description')}
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!valid}>
              {t('expenseForm.submit')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label={t('expenseForm.descriptionField')} required>
            <Input
              inputSize="sm"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('expenseForm.descriptionPlaceholder')}
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('expenses.fields.category')} required>
              <SearchableSelect
                size="sm"
                value={categoryId}
                onChange={setCategoryId}
                options={categories
                  .filter((category) => category.status === 'active')
                  .map((category) => ({ value: category.id, label: nameOf(category) }))}
              />
            </FormField>

            <FormField label={t('expenses.fields.method')}>
              <SearchableSelect
                size="sm"
                value={method}
                onChange={(value) => setMethod((value ?? 'bank') as Expense['paymentMethod'])}
                options={[
                  { value: 'bank', label: t('vendors.payment.bank') },
                  { value: 'cash', label: t('pos.payment.cash') },
                  { value: 'card', label: t('pos.payment.card') },
                  { value: 'credit', label: t('pos.payment.credit') },
                ]}
              />
            </FormField>
          </div>

          {/* VAT: asked as a question, answered with a radio, computed by us. */}
          <div className="space-y-2 rounded-md border border-ink-200 p-3">
            <span className="block text-sm font-medium text-ink-700">
              {t('expenseForm.vatIncluded')}
            </span>

            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: t('expenseForm.vatYes') },
                { value: false, label: t('expenseForm.vatNo') },
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => setHasVat(option.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-2 text-start text-xs font-medium transition-colors',
                    hasVat === option.value
                      ? 'border-brand-500 bg-brand-50/60 text-brand-800 ring-1 ring-brand-500/30'
                      : 'border-ink-200 text-ink-600 hover:border-ink-300',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'h-3 w-3 shrink-0 rounded-full border-2',
                      hasVat === option.value
                        ? 'border-brand-600 bg-brand-600 ring-2 ring-inset ring-white'
                        : 'border-ink-300',
                    )}
                  />
                  {option.label}
                </button>
              ))}
            </div>

            <FormField
              label={t('expenseForm.totalAmount')}
              required
              help={t('expenseForm.totalAmountHelp')}
            >
              <PriceInput
                inputSize="lg"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </FormField>

            {totalH > 0 && hasVat && (
              <dl className="space-y-1 rounded-md bg-ink-50 px-3 py-2 text-xs">
                <p className="text-2xs font-medium text-ink-400">{t('expenseForm.computed')}</p>
                <div className="flex justify-between">
                  <dt className="text-ink-500">{t('expenseForm.beforeVat')}</dt>
                  <dd>
                    <CurrencyDisplay amount={netH} className="font-medium text-ink-800" />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">
                    {t('expenseForm.vatAmount')} ({Math.round(VAT_RATE * 100)}%)
                  </dt>
                  <dd>
                    <CurrencyDisplay amount={vatH} className="font-medium text-ink-800" />
                  </dd>
                </div>
                <div className="flex justify-between border-t border-dashed border-ink-200 pt-1">
                  <dt className="font-medium text-ink-700">{t('expenseForm.totalAmount')}</dt>
                  <dd>
                    <CurrencyDisplay amount={totalH} className="font-semibold text-ink-900" />
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('expenses.fields.paidOn')} required>
              <DatePicker
                size="sm"
                value={paidOn}
                onChange={(value) => setPaidOn(value)}
                />
            </FormField>

            <FormField label={t('expenseForm.reference')} showOptional help={t('expenseForm.referenceHelp')}>
              <Input
                inputSize="sm"
                dir="ltr"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="INV-88213"
              />
            </FormField>
          </div>

          {/* Coverage period */}
          <div className="space-y-2 rounded-md border border-ink-200 p-3">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={spreads}
                onChange={(event) => setSpreads(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600"
              />
              <span>
                <span className="block text-sm font-medium text-ink-700">
                  {t('expenseForm.coverage')}
                </span>
                <span className="block text-xs text-ink-500">{t('expenseForm.coverageHelp')}</span>
              </span>
            </label>

            {spreads && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label={t('expenseForm.from')} required>
                    <DatePicker
                size="sm"
                value={from}
                onChange={(value) => setFrom(value)}
                />
                  </FormField>

                  <FormField
                    label={t('expenseForm.to')}
                    required
                    error={touchedTo ? (dateError ?? undefined) : undefined}
                  >
                    <DatePicker
                size="sm"
                value={to}
                onChange={(value) => setTo(value)}
                invalid={touchedTo && Boolean(dateError)}
                />
                  </FormField>
                </div>

                {months.length > 0 && totalH > 0 && !dateError && (
                  <p className="rounded-md bg-info-50/60 px-3 py-2 text-xs text-info-700">
                    {months.length} × {formatCurrency(perMonthH, { language })}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Attachment */}
          <FormField label={t('expenseForm.attachment')} showOptional help={t('expenseForm.attachmentHelp')}>
            {attachment ? (
              <span className="flex items-center justify-between rounded-md border border-ink-200 px-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-ink-700">
                  <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                  <span className="truncate">{attachment}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label={t('expenseForm.remove')}
                  className="rounded p-0.5 text-ink-400 transition-colors hover:text-danger-600"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(event) => setAttachment(event.target.files?.[0]?.name ?? null)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  leadingIcon={<Paperclip />}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('expenseForm.attachment')}
                </Button>
              </>
            )}
          </FormField>

          <FormField label={t('expenseForm.notes')} showOptional>
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>

          {dateError && touchedTo && (
            <Alert tone="danger" compact>
              {dateError}
            </Alert>
          )}
        </div>
      </Modal>

      <ImpactConfirm
        open={confirming}
        title={t('expenseForm.title')}
        description={description || t('expenseForm.description')}
        variant="primary"
        confirmLabel={t('expenseForm.submit')}
        loading={busy}
        facts={[
          ...(hasVat
            ? [
                { label: t('expenseForm.beforeVat'), amountH: netH },
                { label: t('expenseForm.vatAmount'), amountH: vatH },
              ]
            : []),
          { label: t('expenseForm.totalAmount'), amountH: totalH, emphasis: true },
          {
            label: t('expenses.fields.method'),
            value:
              method === 'bank'
                ? t('vendors.payment.bank')
                : t(`pos.payment.${method}` as never),
          },
          ...(months.length > 1
            ? [
                {
                  label: t('expenses.preview.perMonth', {
                    amount: formatCurrency(perMonthH, { language }),
                  }),
                  value: `${months.length}`,
                },
              ]
            : []),
        ]}
        effects={[
          t('impact.postExpense'),
          t('impact.createEntry'),
          ...(months.length > 1 ? [t('expenses.preview.hint')] : []),
        ]}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
