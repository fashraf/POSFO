import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, HandCoins } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Button,
  Card,
  CardBody,
  CurrencyDisplay,
  FormField,
  ImpactConfirm,
  Input,
  LoadingState,
  PageHeader,
  PriceInput,
  SearchableSelect,
  Textarea,
} from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { customerService, safeCall } from '@/services';
import { ageInDays } from '@/types/finance';
import type { Customer, StatementEntry } from '@/types/sales';

interface OpenInvoice {
  id: string;
  reference: string;
  date: string;
  amountH: number;
}

/**
 * Collect a payment from a customer.
 *
 * Three columns because the cashier needs all three answers at once: who is
 * paying, what they owe, and how much is arriving. Allocation defaults to
 * oldest-first, which is what a shop does unless told otherwise.
 */
export default function CollectionPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { user } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<StatementEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const actor = user ? (language === 'ar' ? user.nameAr : user.nameEn) : 'System';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [customerResult, statementResult] = await Promise.all([
      safeCall(() => customerService.get(id)),
      safeCall(() => customerService.statement(id)),
    ]);

    if (customerResult.ok) setCustomer(customerResult.data);
    if (statementResult.ok) setStatement(statementResult.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Credit sales that have not been settled, oldest first. */
  const openInvoices = useMemo<OpenInvoice[]>(
    () =>
      statement
        .filter((entry) => entry.kind === 'credit_sale')
        .map((entry) => ({
          id: entry.id,
          reference: entry.reference,
          date: entry.date,
          amountH: entry.amountH,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [statement],
  );

  const amountH = toMinorUnits(amount || '0');

  const allocatedH = Object.values(allocations).reduce(
    (sum, value) => sum + toMinorUnits(value || '0'),
    0,
  );
  const unallocatedH = amountH - allocatedH;

  /** Spread the received amount across invoices, oldest first. */
  function autoAllocate() {
    let remaining = amountH;
    const next: Record<string, string> = {};

    for (const invoice of openInvoices) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, invoice.amountH);
      next[invoice.id] = fromMinorUnits(applied);
      remaining -= applied;
    }

    setAllocations(next);
  }

  /* Re-spread whenever the amount changes, unless the person has been
     adjusting allocations by hand. */
  useEffect(() => {
    if (amountH <= 0) {
      setAllocations({});
      return;
    }
    autoAllocate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountH, openInvoices.length]);

  const overAllocated = allocatedH > amountH;
  const tooMuch = customer ? amountH > customer.balanceH : false;
  const valid = amountH > 0 && !tooMuch && !overAllocated;

  async function submit() {
    if (!customer) return;
    setBusy(true);

    const result = await safeCall(() =>
      customerService.recordPayment({
        customerId: customer.id,
        amountH,
        method,
        note: [reference.trim(), note.trim()].filter(Boolean).join(' — '),
        receivedBy: actor,
      }),
    );

    setBusy(false);
    setConfirming(false);

    if (result.ok) {
      toast.success(t('collection.toast.recorded'));
      navigate('/finance/receivables');
    } else {
      toast.error(t('collection.toast.failed'), result.error.message);
    }
  }

  if (loading || !customer) return <LoadingState className="py-20" />;

  const name = language === 'ar' ? customer.nameAr : customer.nameEn;
  const afterH = customer.balanceH - amountH;

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeft className="flip-rtl" />}
          onClick={() => navigate('/finance/receivables')}
        >
          {t('receivables.title')}
        </Button>
      </div>

      <PageHeader
        title={t('collection.title')}
        description={t('collection.description', { name })}
        actions={
          <Button
            leadingIcon={<HandCoins />}
            onClick={() => setConfirming(true)}
            disabled={!valid}
          >
            {t('collection.submit')}
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Customer */}
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('collection.sections.customer')}
            </h2>

            <div>
              <p className="text-sm font-semibold text-ink-900">{name}</p>
              <p className="text-xs text-ink-400" dir="ltr">
                {customer.phone || '—'}
              </p>
            </div>

            <dl className="space-y-1.5 border-t border-dashed border-ink-200 pt-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-500">{t('collection.outstanding')}</dt>
                <dd>
                  <CurrencyDisplay
                    amount={customer.balanceH}
                    className="text-base font-semibold text-warning-700"
                  />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">{t('collection.creditLimit')}</dt>
                <dd className="text-ink-700">
                  <CurrencyDisplay amount={customer.creditLimitH} />
                </dd>
              </div>
              {openInvoices.length > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">{t('collection.oldest')}</dt>
                  <dd className="text-ink-700">
                    {t('aging.days', { days: ageInDays(openInvoices[0].date) })}
                  </dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>

        {/* Invoices */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('collection.sections.invoices')}
              </h2>
              {openInvoices.length > 0 && (
                <Button variant="ghost" size="sm" onClick={autoAllocate}>
                  {t('collection.autoAllocate')}
                </Button>
              )}
            </div>

            {openInvoices.length === 0 ? (
              <div className="rounded-md border border-dashed border-ink-300 px-3 py-6 text-center">
                <p className="text-sm font-medium text-ink-700">{t('collection.noInvoices')}</p>
                <p className="mt-0.5 text-2xs text-ink-400">{t('collection.noInvoicesHint')}</p>
              </div>
            ) : (
              <>
                <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                  {openInvoices.map((invoice) => (
                    <li
                      key={invoice.id}
                      className="rounded-md border border-ink-200 px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="numeric block truncate text-xs font-medium text-ink-900">
                            {invoice.reference}
                          </span>
                          <span className="block text-2xs text-ink-400">
                            {formatDate(invoice.date, { language })}
                          </span>
                        </span>
                        <CurrencyDisplay
                          amount={invoice.amountH}
                          className="shrink-0 text-xs text-ink-600"
                        />
                      </div>

                      <PriceInput
                        inputSize="sm"
                        className="mt-1.5"
                        value={allocations[invoice.id] ?? ''}
                        onChange={(event) =>
                          setAllocations((current) => ({
                            ...current,
                            [invoice.id]: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                      />
                    </li>
                  ))}
                </ul>

                <dl className="space-y-1 border-t border-dashed border-ink-200 pt-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('collection.allocated')}</dt>
                    <dd>
                      <CurrencyDisplay amount={allocatedH} className="font-medium text-ink-800" />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('collection.unallocated')}</dt>
                    <dd>
                      <CurrencyDisplay
                        amount={unallocatedH}
                        className={cn(
                          'font-medium',
                          unallocatedH < 0 ? 'text-danger-600' : 'text-ink-800',
                        )}
                      />
                    </dd>
                  </div>
                </dl>

                {overAllocated && (
                  <Alert tone="danger" compact>
                    {t('collection.overAllocated')}
                  </Alert>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* Payment */}
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('collection.sections.payment')}
            </h2>

            <FormField label={t('collection.amountReceived')} required>
              <PriceInput
                inputSize="lg"
                autoFocus
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                invalid={tooMuch}
                placeholder="0.00"
              />
            </FormField>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAmount(fromMinorUnits(customer.balanceH))}
            >
              {t('collection.payFull')}
            </Button>

            <FormField label={t('collection.method')}>
              <SearchableSelect
                size="sm"
                value={method}
                onChange={(value) => setMethod((value ?? 'cash') as 'cash' | 'card')}
                options={[
                  { value: 'cash', label: t('pos.payment.cash') },
                  { value: 'card', label: t('pos.payment.card') },
                ]}
              />
            </FormField>

            <FormField label={t('collection.receivedOn')}>
              <DatePicker
                size="sm"
                value={receivedOn}
                onChange={(value) => setReceivedOn(value)}
                />
            </FormField>

            <FormField label={t('collection.reference')} showOptional>
              <Input
                inputSize="sm"
                dir="ltr"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder={t('collection.referencePlaceholder')}
              />
            </FormField>

            <FormField label={t('collection.note')} showOptional>
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
            </FormField>

            {amountH > 0 && !tooMuch && (
              <div
                className={cn(
                  'rounded-md px-3 py-2 text-xs',
                  afterH === 0 ? 'bg-success-50 text-success-700' : 'bg-ink-100 text-ink-700',
                )}
              >
                {afterH === 0 ? (
                  t('collection.settles')
                ) : (
                  <span className="flex items-center justify-between">
                    {t('collection.balanceAfter')}
                    <CurrencyDisplay amount={afterH} className="font-semibold" />
                  </span>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <ImpactConfirm
        open={confirming}
        title={t('collection.title')}
        description={t('collection.description', { name })}
        variant="primary"
        confirmLabel={t('collection.submit')}
        loading={busy}
        facts={[
          { label: t('collection.amountReceived'), amountH, emphasis: true },
          { label: t('collection.method'), value: t(`pos.payment.${method}` as never) },
        ]}
        changes={[
          {
            label: t('collection.outstanding'),
            beforeH: customer.balanceH,
            afterH,
            inverted: true,
          },
        ]}
        effects={[
          t('impact.reduceBalance', {
            amount: fromMinorUnits(amountH),
          }),
          t('impact.createEntry'),
        ]}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
