import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  Layers,
  UserCheck,
  UserRound,
} from 'lucide-react';
import {
  Alert,
  Button,
  CurrencyDisplay,
  Modal,
  PriceInput,
  SearchableSelect,
  Switch,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { lineGrossH, type CartTotals, type Customer, type SaleLine } from '@/types/sales';
import type { Discount } from '@/types/discounts';
import type { BranchSettings } from '@/types/settings';
import type { BranchStaff } from '@/services';
import type { OrderType } from '@/types/kitchen';

export type PaymentMode = 'cash' | 'card' | 'mixed' | 'credit';

export interface CheckoutResult {
  mode: PaymentMode;
  /** Who performed the work, when the branch records it. */
  servedByUserId: string | null;
  cashH: number;
  cardH: number;
  creditH: number;
  tenderedH: number | null;
  changeH: number;
  /** Extra collected against the customer's existing balance. */
  settleH: number;
  /** How the order is served, when asked; null when not said. */
  orderType: OrderType | null;
}

export interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  lines: SaleLine[];
  totals: CartTotals;
  customers: Customer[];
  customerId: string | null;
  onCustomerChange: (customerId: string | null) => void;
  /** The discount currently applied, so the modal can name it. */
  appliedDiscount: Discount | null;
  /** Branch rules: which tab opens first, and whether "served by" is asked. */
  settings: BranchSettings | null;
  /** People who can be credited with the work. */
  staff: BranchStaff[];
  /** Ask how the order is served — when something in it goes to the kitchen. */
  askOrderType?: boolean;
  onConfirm: (result: CheckoutResult) => Promise<boolean>;
}

const MODES: { value: PaymentMode; icon: typeof Banknote }[] = [
  { value: 'cash', icon: Banknote },
  { value: 'card', icon: CreditCard },
  { value: 'mixed', icon: Layers },
  { value: 'credit', icon: UserCheck },
];

/** Days since a date, or null when there is none. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * The checkout workspace.
 *
 * Three columns because the cashier is answering three separate questions at
 * once — what is being bought, who is buying it, and how they are paying — and
 * a wizard would hide two of them at every step.
 */
export function CheckoutModal({
  open,
  onClose,
  lines,
  totals,
  customers,
  customerId,
  onCustomerChange,
  appliedDiscount,
  settings,
  staff,
  askOrderType = false,
  onConfirm,
}: CheckoutModalProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const [mode, setMode] = useState<PaymentMode>('cash');
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [settle, setSettle] = useState(false);
  const [customerTab, setCustomerTab] = useState<'walkin' | 'customer'>('walkin');
  const [servedById, setServedById] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('cash');
    setCash('');
    setCard('');
    setSettle(false);
    setOrderType(null);
    setConfirming(false);
    setServedById(null);

    /* Open on whichever tab this branch uses more, but never drop a customer
       that is already on the order. */
    setCustomerTab(customerId ? 'customer' : (settings?.defaultCustomerMode ?? 'walkin'));
  }, [open, customerId, settings?.defaultCustomerMode]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const customer = customers.find((candidate) => candidate.id === customerId) ?? null;

  const dueH = totals.totalH;
  const settleH = settle && customer ? customer.balanceH : 0;
  const targetH = dueH + settleH;

  const cashH = toMinorUnits(cash || '0');
  const cardH = toMinorUnits(card || '0');

  /**
   * What counts as paid depends on the mode, so this is computed once here
   * rather than being re-derived by each control that needs it.
   */
  const paidH = useMemo(() => {
    switch (mode) {
      case 'cash':
        return cashH;
      case 'card':
        return cardH || targetH;
      case 'mixed':
        return cashH + cardH;
      case 'credit':
        return targetH;
      default:
        return 0;
    }
  }, [mode, cashH, cardH, targetH]);

  const shortfallH = Math.max(0, targetH - paidH);

  /* Change only ever comes out of the cash: a card is charged exactly what it
     covers. So in a split payment the card may not exceed the total, and the
     change is the cash beyond what the card leaves to pay. Working it out as
     cash + card − total told the cashier to hand back the card's excess too,
     which the server (rightly) did not count — the drawer came up short. */
  const cardBlocker =
    mode === 'mixed' && cardH > targetH
      ? t('checkout.payment.cardOverTotal', { amount: fromMinorUnits(targetH) })
      : null;
  const changeH =
    mode === 'mixed'
      ? Math.max(0, cashH - Math.max(0, targetH - cardH))
      : Math.max(0, paidH - targetH);

  /* Credit is the only mode that needs a customer, and it must fit their
     remaining limit. Both are checked again in the service. */
  const creditBlocker = useMemo(() => {
    if (mode !== 'credit') return null;
    if (!customer) return t('checkout.payment.creditNeedsCustomer');
    if (customer.balanceH + dueH > customer.creditLimitH) {
      return t('checkout.payment.creditOverLimit', { name: nameOf(customer) });
    }
    return null;
  }, [mode, customer, dueH, t, language]);

  const servedByBlocker =
    settings?.servedBy === 'required' && !servedById
      ? t('checkout.customer.servedByRequired')
      : null;

  const canComplete =
    lines.length > 0 &&
    !creditBlocker &&
    !cardBlocker &&
    !servedByBlocker &&
    (mode === 'credit' || shortfallH === 0) &&
    !submitting;

  function buildResult(): CheckoutResult {
    const base = {
      settleH,
      servedByUserId: servedById,
      orderType: askOrderType ? orderType : null,
      tenderedH: null as number | null,
      changeH: 0,
    };

    switch (mode) {
      case 'cash':
        return { ...base, mode, cashH: targetH, cardH: 0, creditH: 0, tenderedH: cashH, changeH };
      case 'card':
        return { ...base, mode, cashH: 0, cardH: targetH, creditH: 0 };
      case 'mixed':
        return {
          ...base,
          mode,
          /* Change always comes out of the cash side — you cannot hand back
             change on a card. */
          cashH: Math.max(0, targetH - cardH),
          cardH,
          creditH: 0,
          tenderedH: cashH,
          changeH,
        };
      case 'credit':
      default:
        return { ...base, mode, cashH: 0, cardH: 0, creditH: dueH };
    }
  }

  async function place() {
    setSubmitting(true);
    const succeeded = await onConfirm(buildResult());
    setSubmitting(false);
    if (succeeded) setConfirming(false);
  }

  const modeLabel = t(`checkout.payment.${mode}`);

  return (
    <>
      <Modal
        open={open && !confirming}
        onClose={onClose}
        size="xl"
        title={t('checkout.title')}
        dismissible={!submitting}
        className="h-[80vh] max-h-[80vh] w-[80vw] max-w-[80vw] sm:max-w-[80vw]"
        footer={
          /* Totals live along the bottom, spanning all three columns, so the
             number the cashier says out loud sits next to the button that
             commits it. */
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <div className="flex items-center gap-1.5">
                <dt className="text-ink-500">{t('checkout.items.subtotal')}</dt>
                <dd>
                  <CurrencyDisplay amount={totals.subtotalH} className="text-ink-700" />
                </dd>
              </div>

              {totals.discountH > 0 && (
                <div className="flex items-center gap-1.5">
                  <dt className="text-ink-500">
                    {t('checkout.items.discount')}
                    {appliedDiscount && (
                      <span className="ms-1 text-brand-600">{nameOf(appliedDiscount)}</span>
                    )}
                  </dt>
                  <dd>
                    <CurrencyDisplay amount={-totals.discountH} className="text-danger-600" />
                  </dd>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <dt className="text-ink-500">{t('checkout.items.vat')}</dt>
                <dd>
                  <CurrencyDisplay amount={totals.taxH} className="text-ink-700" />
                </dd>
              </div>

              <div className="flex items-center gap-2 rounded-md bg-ink-100 px-3 py-1.5">
                <dt className="text-sm font-semibold text-ink-900">{t('checkout.items.total')}</dt>
                <dd>
                  <CurrencyDisplay
                    amount={targetH}
                    className="text-lg font-semibold text-ink-900"
                  />
                </dd>
              </div>
            </dl>

            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                {t('common.cancel')}
              </Button>
              <Button size="lg" onClick={() => setConfirming(true)} disabled={!canComplete}>
                {t('checkout.complete')}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid h-full min-h-0 gap-4 lg:grid-cols-3">
          {/* Items */}
          <section className="flex min-h-0 flex-col gap-2">
            <h3 className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('checkout.columns.items')}
            </h3>

            <ul className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto rounded-md border border-ink-200">
              {lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-ink-900">
                      {nameOf(line)}
                    </span>
                    <span className="numeric text-2xs text-ink-400">
                      {line.quantity} × {formatCurrency(line.unitPriceH, { language })}
                    </span>
                  </span>
                  <CurrencyDisplay
                    amount={lineGrossH(line)}
                    className="shrink-0 text-xs font-semibold text-ink-900"
                  />
                </li>
              ))}
            </ul>

          </section>

          {/* Customer */}
          <section className="flex min-h-0 flex-col gap-2 overflow-y-auto">
            <h3 className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('checkout.columns.customer')}
            </h3>

            {/* Two tabs rather than a dropdown with a blank option: a walk-in
                sale is a deliberate choice, not the absence of one. */}
            <div className="grid shrink-0 grid-cols-2 gap-1 rounded-md bg-ink-100 p-1">
              {(['walkin', 'customer'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setCustomerTab(tab);
                    if (tab === 'walkin') onCustomerChange(null);
                  }}
                  className={cn(
                    'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    customerTab === tab
                      ? 'bg-surface text-ink-900 shadow-xs'
                      : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  {t(`checkout.customer.${tab === 'walkin' ? 'tabWalkin' : 'tabCustomer'}`)}
                </button>
              ))}
            </div>

            {customerTab === 'walkin' ? (
              <div className="rounded-md border border-dashed border-ink-300 px-3 py-6 text-center">
                <UserRound aria-hidden className="mx-auto h-5 w-5 text-ink-300" />
                <p className="mt-1.5 text-sm font-medium text-ink-700">
                  {t('checkout.customer.walking')}
                </p>
                <p className="mt-0.5 text-2xs text-ink-400">
                  {t('checkout.customer.walkingHint')}
                </p>
              </div>
            ) : (
              <>
                <SearchableSelect
                  size="sm"
                  options={customers.map((entry) => ({
                    value: entry.id,
                    label: nameOf(entry),
                    description: entry.phone,
                  }))}
                  value={customerId}
                  onChange={onCustomerChange}
                  placeholder={t('checkout.customer.select')}
                  isClearable
                />

                {customer && (
                  <div className="space-y-2 rounded-md border border-ink-200 p-3">
                    <p className="text-sm font-semibold text-ink-900">{nameOf(customer)}</p>

                    <dl className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-ink-500">{t('checkout.customer.phone')}</dt>
                        <dd className="text-ink-700" dir="ltr">
                          {customer.phone || '—'}
                        </dd>
                      </div>

                      <div className="flex justify-between">
                        <dt className="text-ink-500">{t('checkout.customer.outstanding')}</dt>
                        <dd>
                          <CurrencyDisplay
                            amount={customer.balanceH}
                            className={cn(
                              'font-medium',
                              customer.balanceH > 0 ? 'text-warning-700' : 'text-ink-700',
                            )}
                          />
                        </dd>
                      </div>

                      <div className="flex justify-between">
                        <dt className="text-ink-500">{t('checkout.customer.lastVisit')}</dt>
                        <dd className="text-ink-700">
                          {(() => {
                            const days = daysSince(customer.updatedAt);
                            if (days === null) return t('checkout.customer.never');
                            if (days === 0) return t('checkout.customer.today');
                            return t('checkout.customer.daysAgo', { days });
                          })()}
                        </dd>
                      </div>
                    </dl>

                    {customer.balanceH > 0 && (
                      <div className="border-t border-dashed border-ink-200 pt-2">
                        <Switch
                          checked={settle}
                          onCheckedChange={setSettle}
                          label={t('checkout.payment.settle')}
                          description={t('checkout.payment.settleHint')}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Served by sits under the customer, because it answers the same
                kind of question: who is this sale attached to? */}
            {settings?.servedBy !== 'off' && (
              <div className="shrink-0 space-y-1 border-t border-dashed border-ink-200 pt-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
                  {t('checkout.customer.servedBy')}
                  {settings?.servedBy === 'required' && (
                    <span aria-hidden className="text-danger-500">
                      *
                    </span>
                  )}
                </span>

                <SearchableSelect
                  size="sm"
                  options={staff.map((member) => ({
                    value: member.id,
                    label: language === 'ar' ? member.nameAr : member.nameEn,
                    description: language === 'ar' ? member.roleNameAr : member.roleNameEn,
                  }))}
                  value={servedById}
                  onChange={setServedById}
                  placeholder={t('checkout.customer.servedByPlaceholder')}
                  isClearable
                  error={Boolean(servedByBlocker)}
                />

                {servedByBlocker && <p className="text-2xs text-danger-600">{servedByBlocker}</p>}
              </div>
            )}

            {askOrderType && (
              <div className="shrink-0 space-y-1 border-t border-dashed border-ink-200 pt-2">
                <span className="text-xs font-medium text-ink-600">
                  {t('checkout.customer.orderType')}
                </span>
                <SearchableSelect
                  size="sm"
                  options={(['dine_in', 'takeaway', 'delivery'] as const).map((value) => ({
                    value,
                    label: t(`kitchen.orderType.${value}`),
                  }))}
                  value={orderType}
                  onChange={(value) => setOrderType((value as OrderType | null) ?? null)}
                  placeholder={t('checkout.customer.orderTypePlaceholder')}
                  isClearable
                />
              </div>
            )}
          </section>

          {/* Payment */}
          <section className="flex min-h-0 flex-col gap-2 overflow-y-auto">
            <h3 className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('checkout.columns.payment')}
            </h3>

            <div className="grid grid-cols-2 gap-1.5">
              {MODES.map((entry) => {
                const Icon = entry.icon;
                const selected = mode === entry.value;
                return (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setMode(entry.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors',
                      selected
                        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30'
                        : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn('h-4 w-4 shrink-0', selected ? 'text-brand-600' : 'text-ink-400')}
                    />
                    <span className="truncate text-xs font-medium text-ink-800">
                      {t(`checkout.payment.${entry.value}`)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Amount due is the anchor for everything in this column. */}
            <div className="rounded-md border border-brand-200 bg-brand-50/60 px-3 py-2.5 text-center">
              <p className="text-2xs font-medium uppercase tracking-wide text-brand-700">
                {t('checkout.payment.due')}
              </p>
              <CurrencyDisplay
                amount={targetH}
                className="mt-0.5 block text-2xl font-semibold text-ink-900"
              />
            </div>

            {(mode === 'cash' || mode === 'mixed') && (
              <div className="space-y-2">
                {mode === 'mixed' && (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-ink-600">
                      {t('checkout.payment.cardAmount')}
                    </span>
                    <PriceInput
                      inputSize="sm"
                      value={card}
                      onChange={(event) => setCard(event.target.value)}
                      invalid={Boolean(cardBlocker)}
                      placeholder="0.00"
                    />
                  </label>
                )}

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-ink-600">
                    {mode === 'mixed'
                      ? t('checkout.payment.cashAmount')
                      : t('checkout.payment.received')}
                  </span>
                  <PriceInput
                    inputSize="lg"
                    autoFocus
                    value={cash}
                    onChange={(event) => setCash(event.target.value)}
                    invalid={shortfallH > 0 && cash !== ''}
                    placeholder={fromMinorUnits(Math.max(0, targetH - cardH))}
                  />
                </label>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCash(fromMinorUnits(Math.max(0, targetH - cardH)))}
                    className="rounded border border-ink-200 px-2 py-1 text-2xs font-medium text-ink-600 transition-colors hover:bg-ink-100"
                  >
                    {t('checkout.payment.exact')}
                  </button>
                  {[5000, 10000, 20000].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCash(fromMinorUnits(amount))}
                      className="numeric rounded border border-ink-200 px-2 py-1 text-2xs font-medium text-ink-600 transition-colors hover:bg-ink-100"
                    >
                      {amount / 100}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'credit' && customer && !creditBlocker && (
              <dl className="space-y-1 rounded-md border border-ink-200 p-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-ink-500">{t('checkout.payment.currentOutstanding')}</dt>
                  <dd>
                    <CurrencyDisplay amount={customer.balanceH} className="text-ink-700" />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">{t('checkout.payment.thisOrder')}</dt>
                  <dd>
                    <CurrencyDisplay amount={dueH} className="text-ink-700" />
                  </dd>
                </div>
                <div className="flex justify-between border-t border-dashed border-ink-200 pt-1.5">
                  <dt className="font-semibold text-ink-900">
                    {t('checkout.payment.newOutstanding')}
                  </dt>
                  <dd>
                    <CurrencyDisplay
                      amount={customer.balanceH + dueH}
                      className="font-semibold text-warning-700"
                    />
                  </dd>
                </div>
              </dl>
            )}

            {/* Running state: what is still owed, or what to hand back. */}
            {creditBlocker || cardBlocker ? (
              <Alert tone="danger" compact icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                {creditBlocker ?? cardBlocker}
              </Alert>
            ) : shortfallH > 0 && mode !== 'credit' ? (
              <div className="flex items-center justify-between rounded-md border border-warning-100 bg-warning-50 px-3 py-2.5">
                <span className="text-sm font-medium text-warning-700">
                  {t('checkout.payment.remaining')}
                </span>
                <CurrencyDisplay
                  amount={shortfallH}
                  className="text-xl font-semibold text-warning-700"
                />
              </div>
            ) : changeH > 0 ? (
              <div className="flex items-center justify-between rounded-md border border-success-100 bg-success-50 px-3 py-2.5">
                <span className="text-sm font-medium text-success-700">
                  {t('checkout.payment.change')}
                </span>
                <CurrencyDisplay
                  amount={changeH}
                  className="text-xl font-semibold text-success-700"
                />
              </div>
            ) : null}
          </section>
        </div>
      </Modal>

      {/* Final confirmation — the last chance to catch a mistyped tender. */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        dismissible={!submitting}
        title={t('checkout.confirm.title')}
        description={t('checkout.confirm.description')}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
              {t('checkout.confirm.back')}
            </Button>
            <Button onClick={place} loading={submitting}>
              {t('checkout.confirm.place')}
            </Button>
          </>
        }
      >
        <dl className="space-y-1.5 rounded-md bg-ink-50 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('checkout.confirm.orderTotal')}</dt>
            <dd>
              <CurrencyDisplay amount={targetH} className="font-semibold text-ink-900" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('checkout.confirm.paymentMethod')}</dt>
            <dd className="font-medium text-ink-800">{modeLabel}</dd>
          </div>

          {mode === 'mixed' && (
            <>
              <div className="flex justify-between text-xs">
                <dt className="text-ink-500">{t('checkout.payment.cardAmount')}</dt>
                <dd>
                  <CurrencyDisplay amount={Math.min(cardH, targetH)} className="text-ink-700" />
                </dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-ink-500">{t('checkout.payment.cashAmount')}</dt>
                <dd>
                  <CurrencyDisplay amount={cashH} className="text-ink-700" />
                </dd>
              </div>
            </>
          )}

          {changeH > 0 && (
            <div className="flex justify-between border-t border-dashed border-ink-200 pt-1.5">
              <dt className="text-ink-500">{t('checkout.payment.change')}</dt>
              <dd>
                <CurrencyDisplay amount={changeH} className="font-semibold text-success-600" />
              </dd>
            </div>
          )}
        </dl>
      </Modal>
    </>
  );
}
