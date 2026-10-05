import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, RotateCcw } from 'lucide-react';
import {
  Button,
  CurrencyDisplay,
  Drawer,
  FormField,
  Modal,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { computeReturnTotals, lineGrossH } from '@/types/sales';
import type {
  CreditNote,
  CreditNoteLine,
  PaymentMethod,
  ReturnReason,
  Sale,
} from '@/types/sales';

const REASONS: ReturnReason[] = [
  'damaged',
  'not_as_described',
  'changed_mind',
  'wrong_item',
  'other',
];

export interface SaleDetailProps {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
  notes: CreditNote[];
  remaining: Record<string, number>;
  canReturn: boolean;
  canVoid: boolean;
  onReturn: (input: {
    lines: { saleLineId: string; quantity: number }[];
    reason: ReturnReason;
    note: string;
    refundMethod: PaymentMethod;
  }) => Promise<boolean>;
  onVoid: (reason: string) => Promise<boolean>;
}

export function SaleDetail({
  sale,
  open,
  onClose,
  notes,
  remaining,
  canReturn,
  canVoid,
  onReturn,
  onVoid,
}: SaleDetailProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const [returning, setReturning] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason>('damaged');
  const [note, setNote] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash');
  const [voidReason, setVoidReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!returning) return;
    setQuantities({});
    setReason('damaged');
    setNote('');
    setRefundMethod(sale?.payments[0]?.method ?? 'cash');
    setFormError(null);
  }, [returning, sale]);

  useEffect(() => {
    if (!voiding) return;
    setVoidReason('');
    setFormError(null);
  }, [voiding]);

  const returnableTotal = useMemo(
    () => Object.values(remaining).reduce((sum, quantity) => sum + quantity, 0),
    [remaining],
  );

  const proposedLines: CreditNoteLine[] = useMemo(() => {
    if (!sale) return [];
    return sale.lines
      .filter((line) => (quantities[line.id] ?? 0) > 0)
      .map((line) => ({
        saleLineId: line.id,
        itemId: line.itemId,
        nameAr: line.nameAr,
        nameEn: line.nameEn,
        quantity: quantities[line.id],
        unitPriceH: line.unitPriceH,
      }));
  }, [sale, quantities]);

  const returnTotals = computeReturnTotals(proposedLines);

  if (!sale) return null;

  const isVoided = sale.status === 'voided';

  async function submitReturn() {
    if (proposedLines.length === 0) {
      setFormError(t('sales.returnDialog.nothingSelected'));
      return;
    }
    if (reason === 'other' && !note.trim()) {
      setFormError(t('sales.returnDialog.noteRequired'));
      return;
    }

    setSubmitting(true);
    const succeeded = await onReturn({
      lines: proposedLines.map((line) => ({
        saleLineId: line.saleLineId,
        quantity: line.quantity,
      })),
      reason,
      note,
      refundMethod,
    });
    setSubmitting(false);

    if (succeeded) setReturning(false);
  }

  async function submitVoid() {
    if (!voidReason.trim()) {
      setFormError(t('sales.voidDialog.reason'));
      return;
    }

    setSubmitting(true);
    const succeeded = await onVoid(voidReason);
    setSubmitting(false);

    if (succeeded) setVoiding(false);
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        size="lg"
        title={t('sales.detail.title', { invoice: sale.invoiceNumber })}
        description={formatDate(sale.soldAt, { language, withTime: true })}
        footer={
          <>
            {canVoid && sale.status === 'completed' && notes.length === 0 && (
              <Button variant="outline" leadingIcon={<Ban />} onClick={() => setVoiding(true)}>
                {t('sales.actions.voidSale')}
              </Button>
            )}
            {canReturn && !isVoided && returnableTotal > 0 && (
              <Button leadingIcon={<RotateCcw />} onClick={() => setReturning(true)}>
                {t('sales.actions.returnItems')}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          {isVoided && (
            <div className="flex items-start gap-2.5 rounded-md border border-danger-200 bg-danger-50 px-3.5 py-3">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
              <p className="text-sm text-danger-700">
                {t('sales.detail.voidedBanner', {
                  actor: sale.voidedBy ?? '—',
                  reason: sale.voidReason ?? '—',
                })}
              </p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-4 rounded-md border border-ink-200 bg-ink-50/60 p-4 text-sm">
            <div>
              <dt className="text-ink-500">{t('sales.detail.soldBy')}</dt>
              <dd className="font-medium text-ink-900">{sale.cashierName}</dd>
            </div>
            <div>
              <dt className="text-ink-500">{t('sales.detail.paidWith')}</dt>
              <dd className="font-medium text-ink-900">
                {t(`pos.payment.${sale.paymentMethod ?? 'unknown'}`)}
                {/* A split payment names each part, cash as handed over. */}
                {sale.payments.length > 1 && (
                  <span className="mt-0.5 block text-xs font-normal text-ink-500">
                    {sale.payments.map((payment, index) => (
                      <span key={`${payment.method}-${index}`} className="me-2 inline-block">
                        {t(`pos.payment.${payment.method}`)}{' '}
                        <CurrencyDisplay amount={payment.amountH} />
                      </span>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <section className="space-y-2">
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('sales.detail.lines')}
            </h3>

            <div className="overflow-hidden rounded-md border border-ink-200">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t('catalog.columns.name')}</TableHeaderCell>
                    <TableHeaderCell numeric>{t('sales.detail.quantity')}</TableHeaderCell>
                    <TableHeaderCell numeric>{t('sales.detail.unitPrice')}</TableHeaderCell>
                    <TableHeaderCell numeric>{t('sales.detail.lineTotal')}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sale.lines.map((line) => {
                    const left = remaining[line.id] ?? line.quantity;
                    const returned = line.quantity - left;

                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          <p className="font-medium text-ink-900">{nameOf(line)}</p>
                          {returned > 0 && (
                            <p className="text-xs text-warning-600">
                              {t('sales.detail.returnedQty')}:{' '}
                              <span className="numeric">
                                {formatNumber(returned, { language })}
                              </span>
                            </p>
                          )}
                        </TableCell>
                        <TableCell numeric>{formatNumber(line.quantity, { language })}</TableCell>
                        <TableCell numeric>
                          <CurrencyDisplay amount={line.unitPriceH} />
                        </TableCell>
                        <TableCell numeric className="font-medium text-ink-900">
                          <CurrencyDisplay amount={lineGrossH(line)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          <dl className="space-y-1.5 rounded-md border border-ink-200 bg-ink-50/60 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">{t('sales.columns.subtotal')}</dt>
              <dd>
                <CurrencyDisplay amount={sale.subtotalH} className="text-ink-700" />
              </dd>
            </div>
            {sale.discountH > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-500">{t('pos.cart.discount')}</dt>
                <dd>
                  <CurrencyDisplay amount={-sale.discountH} className="text-danger-600" />
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-500">{t('sales.columns.tax')}</dt>
              <dd>
                <CurrencyDisplay amount={sale.taxH} className="text-ink-700" />
              </dd>
            </div>
            <div className="flex justify-between border-t border-ink-200 pt-2">
              <dt className="font-semibold text-ink-900">{t('sales.columns.total')}</dt>
              <dd>
                <CurrencyDisplay amount={sale.totalH} className="text-lg font-semibold text-ink-900" />
              </dd>
            </div>
          </dl>

          {notes.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('sales.detail.creditNotes')}
              </h3>
              <ul className="space-y-2">
                {notes.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between rounded-md border border-ink-200 px-3.5 py-2.5"
                  >
                    <div>
                      <p className="numeric text-base font-medium text-ink-900">
                        {entry.noteNumber}
                      </p>
                      <p className="text-xs text-ink-500">
                        {t(`sales.returnDialog.reasons.${entry.reason}`)}
                        {entry.note ? ` — ${entry.note}` : ''}
                      </p>
                    </div>
                    <CurrencyDisplay
                      amount={-entry.totalH}
                      className="font-semibold text-danger-600"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </Drawer>

      {/* Return */}
      <Modal
        open={returning}
        onClose={() => setReturning(false)}
        title={t('sales.returnDialog.title')}
        description={t('sales.returnDialog.description')}
        size="lg"
        dismissible={!submitting}
        footer={
          <>
            <Button variant="outline" onClick={() => setReturning(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitReturn} loading={submitting}>
              {t('sales.returnDialog.confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ul className="divide-y divide-ink-200 overflow-hidden rounded-md border border-ink-200">
            {sale.lines.map((line) => {
              const max = remaining[line.id] ?? 0;
              const value = quantities[line.id] ?? 0;

              return (
                <li
                  key={line.id}
                  className={cn(
                    'flex items-center justify-between gap-4 px-3.5 py-2.5',
                    max === 0 && 'opacity-50',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-ink-900">{nameOf(line)}</p>
                    <p className="numeric text-xs text-ink-400">
                      {formatNumber(max, { language })} / {formatNumber(line.quantity, { language })}
                    </p>
                  </div>

                  <input
                    type="number"
                    min="0"
                    max={max}
                    dir="ltr"
                    disabled={max === 0}
                    value={value === 0 ? '' : value}
                    placeholder="0"
                    onChange={(event) => {
                      const next = Math.min(max, Math.max(0, Number(event.target.value) || 0));
                      setQuantities((current) => ({ ...current, [line.id]: next }));
                      setFormError(null);
                    }}
                    className="numeric h-9 w-20 rounded border border-ink-200 bg-surface px-2 text-center text-base text-ink-900 shadow-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25 disabled:bg-ink-50"
                  />
                </li>
              );
            })}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('sales.returnDialog.reason')} required>
              <Select
                value={reason}
                onChange={(value) => setReason(value as ReturnReason)}
                options={REASONS.map((value) => ({
                  value,
                  label: t(`sales.returnDialog.reasons.${value}`),
                }))}
              />
            </FormField>

            <FormField label={t('sales.returnDialog.refundMethod')}>
              <Select
                value={refundMethod}
                onChange={(value) => setRefundMethod(value as PaymentMethod)}
                options={[
                  { value: 'cash', label: t('pos.payment.cash') },
                  { value: 'card', label: t('pos.payment.card') },
                  { value: 'credit', label: t('pos.payment.credit') },
                ]}
              />
            </FormField>
          </div>

          <FormField
            label={t('sales.returnDialog.note')}
            hint={reason === 'other' ? t('sales.returnDialog.noteRequired') : undefined}
            required={reason === 'other'}
          >
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>

          {formError && (
            <p role="alert" className="text-sm text-danger-600">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-between rounded-md bg-ink-50 px-4 py-3">
            <span className="text-base font-medium text-ink-700">
              {t('sales.returnDialog.refundTotal')}
            </span>
            <CurrencyDisplay
              amount={returnTotals.totalH}
              className="text-lg font-semibold text-ink-900"
            />
          </div>
        </div>
      </Modal>

      {/* Void */}
      <Modal
        open={voiding}
        onClose={() => setVoiding(false)}
        title={t('sales.voidDialog.title')}
        description={t('sales.voidDialog.description')}
        size="sm"
        dismissible={!submitting}
        footer={
          <>
            <Button variant="outline" onClick={() => setVoiding(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={submitVoid} loading={submitting}>
              {t('sales.voidDialog.confirm')}
            </Button>
          </>
        }
      >
        <FormField label={t('sales.voidDialog.reason')} required error={formError ?? undefined}>
          <Textarea
            rows={3}
            value={voidReason}
            onChange={(event) => {
              setVoidReason(event.target.value);
              setFormError(null);
            }}
          />
        </FormField>
      </Modal>
    </>
  );
}
