import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { Button, CurrencyDisplay } from '@/components/ui';
import { DiscountPicker } from './DiscountPicker';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPercent } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { VAT_RATE, lineGrossH } from '@/types/sales';
import type { DiscountApproval } from '@/types/discounts';
import type { ResolvedDiscount } from '@/services';
import type { PosCart } from './usePosCart';

export interface CartPanelProps {
  cart: PosCart;
  onCheckout: () => void;
  /** Configured discounts, each resolved against the current basket. */
  discounts: ResolvedDiscount[];
  selectedDiscountId: string | null;
  onSelectDiscount: (discountId: string | null) => void;
  discountApproval: DiscountApproval;
  onRequestApproval: (reason: string) => void;
  discountCapped: boolean;
  /** True when an approval is outstanding, so checkout must wait. */
  checkoutBlocked: boolean;
}

export function CartPanel({
  cart,
  onCheckout,
  discounts,
  selectedDiscountId,
  onSelectDiscount,
  discountApproval,
  onRequestApproval,
  discountCapped,
  checkoutBlocked,
}: CartPanelProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const { totals } = cart;

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg border border-ink-200 bg-surface">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <ShoppingCart aria-hidden className="h-4 w-4 text-ink-400" />
          <h2 className="text-sm font-semibold text-ink-900">{t('pos.cart.title')}</h2>
          {!cart.isEmpty && (
            <span className="numeric rounded-full bg-ink-100 px-1.5 py-0.5 text-2xs font-semibold text-ink-600">
              {totals.itemCount}
            </span>
          )}
        </div>

        {!cart.isEmpty && (
          <Button variant="ghost" size="sm" onClick={cart.clear} leadingIcon={<Trash2 />}>
            {t('pos.cart.clear')}
          </Button>
        )}
      </header>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-400"
            >
              <ShoppingCart className="h-4.5 w-4.5" />
            </span>
            <p className="text-base font-medium text-ink-700">{t('pos.cart.empty')}</p>
            <p className="text-sm text-ink-400">{t('pos.cart.emptyHint')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {/* One compact row per line. A tall card per item is what forces
                a cashier to scroll after four products. */}
            {cart.lines.map((line) => (
              <li
                key={line.id}
                className="group grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight text-ink-900">
                    {nameOf(line)}
                  </p>
                  <p className="numeric text-2xs leading-tight text-ink-400">
                    {formatCurrency(line.unitPriceH, { language })}
                  </p>
                </div>

                <div className="flex items-center rounded border border-ink-200">
                  <button
                    type="button"
                    onClick={() => cart.decrement(line.id)}
                    aria-label={t('pos.cart.decrease')}
                    className="flex h-6 w-6 items-center justify-center rounded-s text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  >
                    <Minus aria-hidden className="h-3 w-3" />
                  </button>

                  <input
                    type="number"
                    min="1"
                    dir="ltr"
                    value={line.quantity}
                    onChange={(event) =>
                      cart.setQuantity(line.id, Number(event.target.value) || 0)
                    }
                    aria-label={nameOf(line)}
                    className="numeric h-6 w-9 border-x border-ink-200 bg-surface text-center text-xs text-ink-900 outline-none focus:bg-brand-50/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />

                  <button
                    type="button"
                    onClick={() => cart.increment(line.id)}
                    aria-label={t('pos.cart.increase')}
                    className="flex h-6 w-6 items-center justify-center rounded-e text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  >
                    <Plus aria-hidden className="h-3 w-3" />
                  </button>
                </div>

                <div className="flex w-20 items-center justify-end gap-1">
                  <CurrencyDisplay
                    amount={lineGrossH(line)}
                    className="text-sm font-semibold text-ink-900"
                  />
                  <button
                    type="button"
                    onClick={() => cart.remove(line.id)}
                    aria-label={t('pos.cart.removeLine')}
                    className="rounded p-0.5 text-ink-300 opacity-0 transition-all hover:bg-danger-50 hover:text-danger-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Totals */}
      <footer className="shrink-0 border-t border-ink-200 bg-ink-50/60 px-3 py-2.5">
        <div className="mb-2">
          <DiscountPicker
            inline
            resolved={discounts}
            selectedId={selectedDiscountId}
            onSelect={onSelectDiscount}
            approval={discountApproval}
            onRequestApproval={onRequestApproval}
            amountH={cart.discountH}
            capped={discountCapped}
            disabled={cart.isEmpty}
          />
        </div>

        <dl className="space-y-1 border-t border-dashed border-ink-200 pt-2 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-ink-500">{t('pos.cart.subtotal')}</dt>
            <dd>
              <CurrencyDisplay amount={totals.subtotalH} className="text-ink-700" />
            </dd>
          </div>

          {totals.discountH > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-ink-500">{t('pos.cart.discount')}</dt>
              <dd>
                <CurrencyDisplay amount={-totals.discountH} className="text-danger-600" />
              </dd>
            </div>
          )}

          <div className="flex items-center justify-between">
            <dt className="text-ink-500">
              {t('pos.cart.tax', { rate: formatPercent(VAT_RATE, { language, maximumFractionDigits: 0 }) })}
            </dt>
            <dd>
              <CurrencyDisplay amount={totals.taxH} className="text-ink-700" />
            </dd>
          </div>

        </dl>

        <Button
          size="lg"
          fullWidth
          disabled={cart.isEmpty || checkoutBlocked}
          onClick={onCheckout}
          className={cn('mt-2.5')}
        >
          {/* The button says what will happen and for how much, so nobody has
              to look back up at the totals before pressing it. */}
          {cart.isEmpty
            ? t('pos.cart.charge')
            : `${t('pos.cart.charge')} ${formatCurrency(totals.totalH, { language })}`}
        </Button>
      </footer>
    </aside>
  );
}
