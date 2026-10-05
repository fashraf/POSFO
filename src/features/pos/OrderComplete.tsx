import { CheckCircle2, ChefHat, Eye, Plus, Printer, Receipt } from 'lucide-react';
import { Alert, Button, CurrencyDisplay, Modal } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import type { Sale } from '@/types/sales';
import type { Discount } from '@/types/discounts';
import type { PrintGroup } from '@/types/printing';

export interface OrderCompleteProps {
  open: boolean;
  sale: Sale | null;
  /** Named so the receipt and the screen agree on why the total changed. */
  discount: Discount | null;
  changeH: number;
  /** True when the order also created work on the kitchen board. */
  sentToKitchen: boolean;
  /** Only the groups this order actually touches. */
  printGroups: PrintGroup[];
  onPrint: (documentId: string) => void;
  onPrintAll: () => void;
  onView: () => void;
  onNewSale: () => void;
}

/**
 * The screen after a sale lands.
 *
 * It exists so the cashier gets an unambiguous answer to "did that go
 * through?" before the till resets. Change due is the largest thing on it,
 * because that is the one number they act on immediately.
 */
export function OrderComplete({
  open,
  sale,
  discount,
  changeH,
  sentToKitchen,
  printGroups,
  onPrint,
  onPrintAll,
  onView,
  onNewSale,
}: OrderCompleteProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  if (!sale) return null;

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  /* The sale's own word for how it was paid — mixed when split. */
  const method = sale.paymentMethod ?? 'unknown';

  return (
    <Modal open={open} onClose={onNewSale} size="sm" dismissible={false}>
      <div className="space-y-4 py-2 text-center">
        <span
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-50 text-success-500"
        >
          <CheckCircle2 className="h-7 w-7" />
        </span>

        <div className="space-y-0.5">
          <h2 className="text-lg font-semibold text-ink-900">{t('checkout.done.title')}</h2>
          <p className="numeric text-sm text-ink-500">
            {t('checkout.done.order')} {sale.invoiceNumber}
          </p>
        </div>

        <dl className="space-y-1.5 rounded-lg border border-ink-200 bg-ink-50/60 p-4 text-start text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-500">{t('checkout.done.total')}</dt>
            <dd>
              <CurrencyDisplay amount={sale.totalH} className="text-lg font-semibold text-ink-900" />
            </dd>
          </div>

          {discount && sale.discountH > 0 && (
            <div className="flex items-start justify-between gap-2">
              <dt className="min-w-0 text-ink-500">
                {t('checkout.done.discount')}
                <span className="block truncate text-2xs text-brand-600">{nameOf(discount)}</span>
              </dt>
              <dd>
                <CurrencyDisplay amount={-sale.discountH} className="text-danger-600" />
              </dd>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-dashed border-ink-200 pt-1.5">
            <dt className="text-ink-500">{t('checkout.done.payment')}</dt>
            <dd className="font-medium text-ink-800">{t(`pos.payment.${method}`)}</dd>
          </div>

          {/* Change is what the cashier does next, so it gets the emphasis. */}
          {changeH > 0 && (
            <div className="flex items-center justify-between rounded-md bg-success-50 px-3 py-2">
              <dt className="font-medium text-success-700">{t('checkout.done.change')}</dt>
              <dd>
                <CurrencyDisplay
                  amount={changeH}
                  className="text-lg font-semibold text-success-700"
                />
              </dd>
            </div>
          )}
        </dl>

        {sentToKitchen && (
          <Alert tone="info" compact icon={<ChefHat className="h-3.5 w-3.5" />}>
            {t('checkout.done.kitchenSent')}
          </Alert>
        )}

        {/* One order can produce several documents. The customer bill always
            carries everything; a group ticket carries only its own lines. A
            group with nothing in this order gets no button at all. */}
        <div className="space-y-2">
          <Button
            variant="outline"
            fullWidth
            leadingIcon={<Receipt />}
            onClick={() => onPrint('customer')}
          >
            {t('print.customerBill')}
          </Button>

          {printGroups.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {printGroups.map((group) => (
                  <Button
                    key={group.id}
                    variant="outline"
                    size="sm"
                    leadingIcon={<Printer />}
                    onClick={() => onPrint(group.id)}
                  >
                    {nameOf(group)}
                  </Button>
                ))}
              </div>

              <Button
                variant="secondary"
                fullWidth
                size="sm"
                leadingIcon={<Printer />}
                onClick={onPrintAll}
              >
                {t('print.printAll')}
              </Button>
            </>
          )}

          <div className="grid grid-cols-2 gap-2 border-t border-dashed border-ink-200 pt-2">
            <Button variant="ghost" size="sm" leadingIcon={<Eye />} onClick={onView}>
              {t('checkout.done.view')}
            </Button>
            <Button size="sm" leadingIcon={<Plus />} onClick={onNewSale}>
              {t('checkout.done.newSale')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
