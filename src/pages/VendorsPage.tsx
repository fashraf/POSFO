import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  HandCoins,
  Plus,
  ShoppingBasket,
  Wallet,
} from 'lucide-react';
import {
  Alert,
  Button,
  CurrencyDisplay,
  Drawer,
  EmptyState,
  FormField,
  ImpactConfirm,
  InfoHint,
  Input,
  KpiCard,
  LoadingState,
  Modal,
  PageHeader,
  PriceInput,
  ReviewRow,
  SearchInput,
  SkeletonTable,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
  Wizard,
  type WizardStep,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { safeCall, vendorService, type VendorInput } from '@/services';
import type { Vendor } from '@/types/catalog';
import type { VendorLedgerEntry } from '@/types/inventory';

type VendorRow = Vendor & { balanceH: number };

const EMPTY_FORM = {
  nameAr: '',
  nameEn: '',
  contactPerson: '',
  phone: '',
  email: '',
  vatNumber: '',
  city: '',
};

export default function VendorsPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();

  const wizard = useDisclosure();
  const detail = useDisclosure();

  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [summary, setSummary] = useState({
    payableH: 0,
    activeVendors: 0,
    withBalance: 0,
    purchasedH: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selected, setSelected] = useState<VendorRow | null>(null);
  const [ledger, setLedger] = useState<VendorLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  /* Wizard state */
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  /* Payment state */
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'bank'>('bank');
  const [payNote, setPayNote] = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [listResult, summaryResult] = await Promise.all([
      safeCall(() => vendorService.list()),
      safeCall(() => vendorService.summary()),
    ]);
    if (listResult.ok) setVendors(listResult.data);
    if (summaryResult.ok) setSummary(summaryResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!wizard.isOpen) return;
    setStep(0);
    setForm(EMPTY_FORM);
    setErrors({});
  }, [wizard.isOpen]);

  useEffect(() => {
    if (!paying) return;
    setAmount('');
    setMethod('bank');
    setPayNote('');
  }, [paying]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const visible = useMemo(() => {
    const needle = debouncedSearch.trim().toLocaleLowerCase();
    if (!needle) return vendors;
    return vendors.filter((vendor) =>
      `${vendor.nameAr} ${vendor.nameEn} ${vendor.phone} ${vendor.city} ${vendor.contactPerson}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [vendors, debouncedSearch]);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function openVendor(vendor: VendorRow) {
    setSelected(vendor);
    detail.open();
    setLedgerLoading(true);
    const result = await safeCall(() => vendorService.ledger(vendor.id));
    setLedger(result.ok ? result.data : []);
    setLedgerLoading(false);
  }

  async function createVendor() {
    setSubmitting(true);
    setErrors({});

    try {
      await vendorService.create(form as VendorInput);
      toast.success(t('vendors.toast.created'));
      await load();
      wizard.close();
    } catch (caught) {
      const failure = caught as { fieldErrors?: Record<string, string[]>; message?: string };
      if (failure.fieldErrors) {
        const mapped = Object.fromEntries(
          Object.entries(failure.fieldErrors)
            .filter(([, messages]) => messages.length > 0)
            .map(([field, messages]) => [field, messages[0]]),
        );
        setErrors(mapped);
        const identity = ['nameAr', 'nameEn'];
        setStep(Object.keys(mapped).some((key) => identity.includes(key)) ? 0 : 1);
      } else {
        toast.error(t('vendors.toast.failed'), failure.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPayment() {
    if (!selected) return;
    setSubmitting(true);

    const result = await safeCall(() =>
      vendorService.recordPayment({
        vendorId: selected.id,
        amountH: toMinorUnits(amount || '0'),
        method,
        note: payNote,
      }),
    );

    setConfirmingPayment(false);

    if (result.ok) {
      toast.success(t('vendors.toast.paid', { reference: result.data.reference }));
      await load();

      const [refreshed, ledgerResult] = await Promise.all([
        safeCall(() => vendorService.get(selected.id)),
        safeCall(() => vendorService.ledger(selected.id)),
      ]);
      if (refreshed.ok) setSelected(refreshed.data);
      if (ledgerResult.ok) setLedger(ledgerResult.data);

      setPaying(false);
    } else {
      toast.error(t('vendors.toast.failed'), result.error.message);
    }

    setSubmitting(false);
  }

  const steps: WizardStep[] = useMemo(
    () => [
      {
        id: 'identity',
        title: t('vendors.wizard.steps.identity'),
        description: t('vendors.wizard.steps.identityHint'),
        validate: () =>
          !form.nameAr.trim() || !form.nameEn.trim() ? t('vendors.wizard.needName') : null,
        content: (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('users.fields.nameAr')} required error={errors.nameAr}>
                <Input
                  dir="rtl"
                  value={form.nameAr}
                  onChange={(e) => set('nameAr', e.target.value)}
                  placeholder="الرياض للتجارة"
                />
              </FormField>
              <FormField label={t('users.fields.nameEn')} required error={errors.nameEn}>
                <Input
                  dir="ltr"
                  value={form.nameEn}
                  onChange={(e) => set('nameEn', e.target.value)}
                  placeholder="Al Riyadh Trading"
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('vendors.columns.vat')}
                showOptional
                error={errors.vatNumber}
                help={t('vendors.wizard.vatFormat')}
              >
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  value={form.vatNumber}
                  onChange={(e) => set('vatNumber', e.target.value)}
                  placeholder="300012345600003"
                />
              </FormField>
              <FormField label={t('vendors.columns.city')} showOptional>
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
              </FormField>
            </div>
          </div>
        ),
      },
      {
        id: 'contact',
        title: t('vendors.wizard.steps.contact'),
        description: t('vendors.wizard.steps.contactHint'),
        validate: () => (!form.phone.trim() ? t('vendors.wizard.needPhone') : null),
        content: (
          <div className="space-y-4">
            <FormField label={t('vendors.columns.contact')} showOptional>
              <Input
                value={form.contactPerson}
                onChange={(e) => set('contactPerson', e.target.value)}
                placeholder="Khalid Al Otaibi"
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('users.fields.phone')} required error={errors.phone}>
                <Input
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+966 11 456 7890"
                />
              </FormField>
              <FormField label={t('users.fields.email')} showOptional error={errors.email}>
                <Input
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </FormField>
            </div>
          </div>
        ),
      },
      {
        id: 'review',
        title: t('vendors.wizard.steps.review'),
        content: (
          <div className="space-y-4">
            <dl className="divide-dotted-y rounded-md border border-ink-200 bg-surface px-4">
              <ReviewRow label={t('users.fields.nameEn')} value={form.nameEn.trim() || '—'} />
              <ReviewRow label={t('users.fields.nameAr')} value={form.nameAr.trim() || '—'} />
              <ReviewRow
                label={t('vendors.columns.contact')}
                value={form.contactPerson.trim() || '—'}
                muted={!form.contactPerson.trim()}
              />
              <ReviewRow
                label={t('users.fields.phone')}
                value={<span dir="ltr">{form.phone.trim() || '—'}</span>}
              />
              <ReviewRow
                label={t('vendors.columns.vat')}
                value={<span dir="ltr">{form.vatNumber.trim() || '—'}</span>}
                muted={!form.vatNumber.trim()}
              />
              <ReviewRow
                label={t('vendors.columns.city')}
                value={form.city.trim() || '—'}
                muted={!form.city.trim()}
              />
            </dl>

            <Alert tone="tip" compact>
              {t('vendors.wizard.next')}
            </Alert>
          </div>
        ),
      },
    ],
    [t, form, errors],
  );

  const payAmountH = toMinorUnits(amount || '0');
  const tooMuch = selected ? payAmountH > selected.balanceH : false;
  const settles = selected ? payAmountH > 0 && payAmountH === selected.balanceH : false;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('vendors.title')}
        description={t('vendors.description')}
        actions={
          <Button leadingIcon={<Plus />} onClick={wizard.open}>
            {t('vendors.add')}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('vendors.summary.payable')}
              <InfoHint content={t('vendors.summary.payableHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={summary.payableH} />}
          icon={<Wallet />}
        />
        <KpiCard
          label={t('vendors.summary.active')}
          value={<span className="numeric">{formatNumber(summary.activeVendors, { language })}</span>}
          icon={<Building2 />}
        />
        <KpiCard
          label={t('vendors.summary.withBalance')}
          value={<span className="numeric">{formatNumber(summary.withBalance, { language })}</span>}
          icon={<HandCoins />}
        />
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('vendors.summary.purchased')}
              <InfoHint content={t('vendors.summary.purchasedHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={summary.purchasedH} />}
          icon={<ShoppingBasket />}
        />
      </div>

      <SearchInput
        className="sm:max-w-xs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
      />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={4} columns={5} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('vendors.columns.vendor')}</TableHeaderCell>
                <TableHeaderCell>{t('vendors.columns.contact')}</TableHeaderCell>
                <TableHeaderCell>{t('vendors.columns.city')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('vendors.columns.balance')}</TableHeaderCell>
                <TableHeaderCell>{t('vendors.columns.status')}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={5}>
                  <EmptyState
                    icon={<Building2 />}
                    title={t('vendors.empty.title')}
                    description={t('vendors.empty.description')}
                    action={<Button onClick={wizard.open}>{t('vendors.add')}</Button>}
                  />
                </TableEmptyRow>
              ) : (
                visible.map((vendor) => (
                  <TableRow key={vendor.id} interactive onClick={() => void openVendor(vendor)}>
                    <TableCell>
                      <p className="font-medium text-ink-900">{nameOf(vendor)}</p>
                      <p className="numeric text-xs text-ink-400" dir="ltr">
                        {vendor.vatNumber || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="text-ink-600">
                      <p>{vendor.contactPerson || '—'}</p>
                      <p className="text-xs text-ink-400" dir="ltr">
                        {vendor.phone}
                      </p>
                    </TableCell>
                    <TableCell className="text-ink-600">{vendor.city || '—'}</TableCell>
                    <TableCell numeric>
                      {vendor.balanceH > 0 ? (
                        <CurrencyDisplay
                          amount={vendor.balanceH}
                          className="font-medium text-warning-700"
                        />
                      ) : (
                        <span className="text-sm text-ink-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={vendor.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Wizard */}
      <Modal
        open={wizard.isOpen}
        onClose={wizard.close}
        size="lg"
        dismissible={!submitting}
        title={t('vendors.wizard.title')}
      >
        <div className="min-h-[22rem]">
          <Wizard
            steps={steps}
            currentIndex={step}
            onStepChange={setStep}
            onComplete={createVendor}
            onCancel={wizard.close}
            submitting={submitting}
            completeLabel={t('vendors.add')}
          />
        </div>
      </Modal>

      {/* Detail */}
      <Drawer
        open={detail.isOpen}
        onClose={detail.close}
        size="lg"
        title={selected ? nameOf(selected) : ''}
        description={selected?.contactPerson || selected?.phone}
        footer={
          selected && selected.balanceH > 0 ? (
            <Button leadingIcon={<HandCoins />} onClick={() => setPaying(true)}>
              {t('vendors.detail.recordPayment')}
            </Button>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="rounded-lg border border-ink-200 bg-surface p-4">
              <p className="text-sm text-ink-500">{t('vendors.columns.balance')}</p>
              <CurrencyDisplay
                amount={selected.balanceH}
                className={cn(
                  'mt-0.5 block text-2xl font-semibold',
                  selected.balanceH > 0 ? 'text-warning-700' : 'text-ink-900',
                )}
              />
              {selected.balanceH === 0 && (
                <p className="mt-1 text-sm text-ink-400">{t('vendors.detail.settled')}</p>
              )}
            </div>

            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('vendors.detail.ledger')}
                <InfoHint content={t('vendors.detail.ledgerHelp')} />
              </h3>

              {ledgerLoading ? (
                <LoadingState className="py-10" />
              ) : ledger.length === 0 ? (
                <div className="rounded-md border border-dashed border-ink-300 px-4 py-8 text-center">
                  <p className="text-base font-medium text-ink-700">
                    {t('vendors.detail.noActivity')}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-400">
                    {t('vendors.detail.noActivityHint')}
                  </p>
                </div>
              ) : (
                <ul className="divide-dotted-y overflow-hidden rounded-md border border-ink-200">
                  {[...ledger].reverse().map((entry) => {
                    const Icon = entry.amountH > 0 ? ArrowUpRight : ArrowDownLeft;
                    return (
                      <li key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                            entry.amountH > 0
                              ? 'bg-warning-50 text-warning-600'
                              : 'bg-success-50 text-success-600',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="numeric truncate text-base font-medium text-ink-900">
                            {entry.reference}
                          </p>
                          <p className="text-xs text-ink-400">
                            {t(`vendors.detail.kind.${entry.kind}`)} ·{' '}
                            {formatDate(entry.date, { language })}
                          </p>
                        </div>

                        <div className="text-end">
                          <CurrencyDisplay
                            amount={entry.amountH}
                            signed
                            className="block text-base font-medium"
                          />
                          <span className="numeric text-xs text-ink-400">
                            {fromMinorUnits(entry.balanceH)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* Vendor payment */}
      <Modal
        open={paying}
        onClose={() => setPaying(false)}
        title={t('vendors.payment.title')}
        description={t('vendors.payment.description')}
        dismissible={!submitting}
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => setConfirmingPayment(true)}
              disabled={payAmountH <= 0 || tooMuch}
            >
              {t('vendors.payment.confirm')}
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-ink-200 bg-ink-50/60 px-4 py-3">
              <span className="text-sm text-ink-500">{t('vendors.payment.outstanding')}</span>
              <CurrencyDisplay
                amount={selected.balanceH}
                className="text-md font-semibold text-ink-900"
              />
            </div>

            <FormField
              label={t('vendors.payment.amount')}
              required
              help={t('vendors.payment.amountHelp')}
            >
              <PriceInput
                inputSize="lg"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                invalid={tooMuch}
                placeholder="0.00"
              />
            </FormField>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAmount(fromMinorUnits(selected.balanceH))}
            >
              {t('vendors.payment.payFull')}
            </Button>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('vendors.payment.method')}>
                <Select
                  value={method}
                  onChange={(value) => setMethod(value as 'cash' | 'card' | 'bank')}
                  options={[
                    { value: 'bank', label: t('vendors.payment.bank') },
                    { value: 'cash', label: t('pos.payment.cash') },
                    { value: 'card', label: t('pos.payment.card') },
                  ]}
                />
              </FormField>

              <FormField label={t('customers.payment.note')} showOptional>
                <Textarea rows={1} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              </FormField>
            </div>

            {payAmountH > 0 && !tooMuch && (
              <Alert tone={settles ? 'success' : 'tip'} compact>
                {settles ? (
                  t('vendors.payment.settles')
                ) : (
                  <span className="flex items-center gap-1.5">
                    {t('vendors.payment.after')}:{' '}
                    <CurrencyDisplay
                      amount={selected.balanceH - payAmountH}
                      className="font-semibold"
                    />
                  </span>
                )}
              </Alert>
            )}
          </div>
        )}
      </Modal>

      {selected && (
        <ImpactConfirm
          open={confirmingPayment}
          title={t('vendors.payment.title')}
          description={nameOf(selected)}
          variant="primary"
          confirmLabel={t('vendors.payment.confirm')}
          loading={submitting}
          facts={[
            { label: t('vendors.payment.amount'), amountH: payAmountH, emphasis: true },
            {
              label: t('vendors.payment.method'),
              value:
                method === 'bank' ? t('vendors.payment.bank') : t(`pos.payment.${method}` as never),
            },
          ]}
          changes={[
            {
              label: t('vendors.columns.balance'),
              beforeH: selected.balanceH,
              afterH: selected.balanceH - payAmountH,
              inverted: true,
            },
          ]}
          effects={[t('impact.createEntry')]}
          onConfirm={submitPayment}
          onCancel={() => setConfirmingPayment(false)}
        />
      )}
    </div>
  );
}
