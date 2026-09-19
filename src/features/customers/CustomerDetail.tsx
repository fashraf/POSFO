import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, HandCoins, RotateCcw, Wallet } from 'lucide-react';
import {
  Alert,
  Button,
  CurrencyDisplay,
  Drawer,
  FormField,
  InfoHint,
  LoadingState,
  Modal,
  PriceInput,
  Select,
  Textarea,
  Tooltip,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate, formatPercent, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { availableCreditH, creditUtilisation } from '@/types/sales';
import type { Customer, StatementEntry, StatementEntryKind } from '@/types/sales';

const ENTRY_ICONS: Record<StatementEntryKind, typeof ArrowUpRight> = {
  credit_sale: ArrowUpRight,
  payment: ArrowDownLeft,
  credit_note: RotateCcw,
};

/** Utilisation drives the bar colour: green, amber near the ceiling, red past it. */
function utilisationTone(ratio: number, overLimit: boolean) {
  if (overLimit) return 'bg-danger-500';
  if (ratio >= 0.9) return 'bg-warning-500';
  return 'bg-brand-500';
}

export interface CustomerDetailProps {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  statement: StatementEntry[];
  loading: boolean;
  onRecordPayment: (input: {
    amountH: number;
    method: 'cash' | 'card';
    note: string;
  }) => Promise<boolean>;
}

export function CustomerDetail({
  customer,
  open,
  onClose,
  statement,
  loading,
  onRecordPayment,
}: CustomerDetailProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!paying) return;
    setAmount('');
    setMethod('cash');
    setNote('');
    setError(null);
  }, [paying]);

  if (!customer) return null;

  const name = language === 'ar' ? customer.nameAr : customer.nameEn;
  const ratio = creditUtilisation(customer);
  const available = availableCreditH(customer);
  const overLimit = customer.balanceH > customer.creditLimitH;
  const cashOnly = customer.creditLimitH === 0;

  const amountH = toMinorUnits(amount || '0');
  const afterH = customer.balanceH - amountH;
  const settlesFully = amountH > 0 && afterH === 0;
  const tooMuch = amountH > customer.balanceH;

  async function submitPayment() {
    if (amountH <= 0) {
      setError(t('customers.payment.amountHelp'));
      return;
    }
    if (tooMuch) {
      setError(t('customers.payment.amountHelp'));
      return;
    }

    setSubmitting(true);
    const succeeded = await onRecordPayment({ amountH, method, note });
    setSubmitting(false);
    if (succeeded) setPaying(false);
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        size="lg"
        title={name}
        description={customer.phone}
        footer={
          customer.balanceH > 0 ? (
            <Button leadingIcon={<HandCoins />} onClick={() => setPaying(true)}>
              {t('customers.detail.recordPayment')}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {/* Balance and credit position */}
          <div className="rounded-lg border border-ink-200 bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-ink-500">{t('customers.columns.balance')}</p>
                <CurrencyDisplay
                  amount={customer.balanceH}
                  className={cn(
                    'mt-0.5 block text-2xl font-semibold',
                    overLimit ? 'text-danger-600' : 'text-ink-900',
                  )}
                />
              </div>

              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-100 text-ink-400"
              >
                <Wallet className="h-4.5 w-4.5" />
              </span>
            </div>

            {cashOnly ? (
              <p className="mt-3 text-sm text-ink-500">{t('customers.credit.none')}</p>
            ) : (
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-ink-500">
                    {t('customers.credit.utilisation')}
                    <InfoHint content={t('customers.credit.utilisationHelp')} />
                  </span>
                  <span className="numeric font-medium text-ink-700">
                    {formatPercent(ratio, { language, maximumFractionDigits: 0 })}
                  </span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={cn('h-full rounded-full transition-all', utilisationTone(ratio, overLimit))}
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>

                <p className={cn('text-xs', overLimit ? 'text-danger-600' : 'text-ink-500')}>
                  {overLimit
                    ? t('customers.credit.overLimit', {
                        amount: fromMinorUnits(customer.balanceH - customer.creditLimitH),
                      })
                    : available === 0
                      ? t('customers.credit.atLimit')
                      : t('customers.credit.available', { amount: fromMinorUnits(available) })}
                </p>
              </div>
            )}
          </div>

          {overLimit && (
            <Alert tone="warning" title={t('customers.filters.overLimit')}>
              {t('customers.summary.overLimitHelp')}
            </Alert>
          )}

          {/* Statement */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('customers.detail.statement')}
              <InfoHint content={t('customers.detail.statementHelp')} />
            </h3>

            {loading ? (
              <LoadingState className="py-10" />
            ) : statement.length === 0 ? (
              <div className="rounded-md border border-dashed border-ink-300 px-4 py-8 text-center">
                <p className="text-base font-medium text-ink-700">
                  {t('customers.detail.noActivity')}
                </p>
                <p className="mt-0.5 text-sm text-ink-400">
                  {t('customers.detail.noActivityHint')}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-200 overflow-hidden rounded-md border border-ink-200">
                {[...statement].reverse().map((entry) => {
                  const Icon = ENTRY_ICONS[entry.kind];
                  const increases = entry.amountH > 0;

                  return (
                    <li key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <Tooltip content={t(`customers.detail.entryKind.${entry.kind}`)}>
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                            increases
                              ? 'bg-warning-50 text-warning-600'
                              : 'bg-success-50 text-success-600',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      </Tooltip>

                      <div className="min-w-0 flex-1">
                        <p className="numeric truncate text-base font-medium text-ink-900">
                          {entry.reference}
                        </p>
                        <p className="text-xs text-ink-400">
                          {formatDate(entry.date, { language, withTime: true })}
                        </p>
                      </div>

                      <div className="text-end">
                        <CurrencyDisplay
                          amount={entry.amountH}
                          signed
                          className="block text-base font-medium"
                        />
                        <span className="numeric text-xs text-ink-400">
                          {t('customers.detail.running')}: {fromMinorUnits(entry.balanceH)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </Drawer>

      {/* Record payment */}
      <Modal
        open={paying}
        onClose={() => setPaying(false)}
        title={t('customers.payment.title')}
        description={t('customers.payment.description')}
        dismissible={!submitting}
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitPayment} loading={submitting} disabled={amountH <= 0 || tooMuch}>
              {t('customers.payment.confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-ink-200 bg-ink-50/60 px-4 py-3">
            <span className="text-sm text-ink-500">{t('customers.payment.outstanding')}</span>
            <CurrencyDisplay
              amount={customer.balanceH}
              className="text-md font-semibold text-ink-900"
            />
          </div>

          <FormField
            label={t('customers.payment.amount')}
            required
            error={error ?? undefined}
            help={t('customers.payment.amountHelp')}
          >
            <PriceInput
              inputSize="lg"
              autoFocus
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              invalid={tooMuch}
              placeholder="0.00"
            />
          </FormField>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAmount(fromMinorUnits(customer.balanceH))}
          >
            {t('customers.payment.payFull')}
          </Button>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('customers.payment.method')}>
              <Select
                value={method}
                onChange={(value) => setMethod(value as 'cash' | 'card')}
                options={[
                  { value: 'cash', label: t('pos.payment.cash') },
                  { value: 'card', label: t('pos.payment.card') },
                ]}
              />
            </FormField>

            <FormField label={t('customers.payment.note')} showOptional>
              <Textarea
                rows={1}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('customers.payment.noteHint')}
              />
            </FormField>
          </div>

          {amountH > 0 && !tooMuch && (
            <Alert tone={settlesFully ? 'success' : 'tip'} compact>
              {settlesFully ? (
                t('customers.payment.settledHint')
              ) : (
                <span className="flex items-center gap-1.5">
                  {t('customers.payment.afterPayment')}:{' '}
                  <CurrencyDisplay amount={afterH} className="font-semibold" />
                </span>
              )}
            </Alert>
          )}
        </div>
      </Modal>
    </>
  );
}
