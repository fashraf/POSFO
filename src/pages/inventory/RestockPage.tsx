import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileCheck, PackagePlus, Plus, Trash2, Upload } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Button,
  Card,
  CardBody,
  ConfirmModal,
  CurrencyDisplay,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  PriceInput,
  SearchableSelect,
  type SearchableOption,
} from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatNumber, toMinorUnits } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { catalogService, purchaseService, safeCall, vendorService } from '@/services';
import { isProduct } from '@/types/catalog';
import type { Product, Vendor } from '@/types/catalog';
import { VAT_RATE } from '@/types/sales';
import { computePurchaseTotals, weightedAverageCostH } from '@/types/inventory';
import type { PurchaseLine } from '@/types/inventory';

interface DraftLine {
  key: string;
  itemId: string | null;
  quantity: string;
  unitCost: string;
}

function emptyLine(): DraftLine {
  return {
    key: `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    itemId: null,
    quantity: '',
    unitCost: '',
  };
}

/**
 * Restocking.
 *
 * Deliberately a page rather than a modal: a delivery often covers a dozen
 * lines, and the person needs to see the running total and every new stock
 * level at once while they work through the supplier's invoice.
 */
export default function RestockPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [items, setItems] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<(Vendor & { balanceH: number })[]>([]);
  const [loading, setLoading] = useState(true);

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [invoiceRef, setInvoiceRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  /* The supplier's bill. Held in component state only — the API has no upload
     endpoint yet, so the file itself is not sent. The name is recorded on the
     expense side of a paid delivery, which is the part that matters for
     reconciliation; wiring the binary needs storage that does not exist. */
  const [bill, setBill] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const [catalogResult, vendorResult] = await Promise.all([
      safeCall(() => catalogService.list({ pageSize: 500 })),
      safeCall(() => vendorService.list()),
    ]);

    if (catalogResult.ok) {
      /* Services never appear here — there is nothing to count. */
      setItems(catalogResult.data.items.filter(isProduct).filter((item) => item.trackInventory));
    }
    if (vendorResult.ok) {
      const active = vendorResult.data.filter((vendor) => vendor.status === 'active');
      setVendors(active);
      setVendorId((current) => current ?? active[0]?.id ?? null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Arriving from a product page pre-selects that item, which is the whole
     point of the shortcut there. */
  useEffect(() => {
    const preselect = params.get('item');
    if (!preselect || items.length === 0) return;

    const match = items.find((item) => item.id === preselect);
    if (!match) return;

    setLines((current) =>
      current.length === 1 && !current[0].itemId
        ? [{ ...current[0], itemId: match.id, quantity: '', unitCost: '' }]
        : current,
    );
  }, [params, items]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const itemOptions: SearchableOption[] = useMemo(
    () =>
      items.map((item) => ({
        value: item.id,
        label: nameOf(item),
        /* Searchable by SKU and barcode too — a storeman reads off a box, not
           a product name. */
        description: `${item.sku}${item.barcode ? ` · ${item.barcode}` : ''} · ${t(
          'restock.onHandShort',
        )} ${item.stockQuantity}`,
      })),
    [items, language, t],
  );

  const vendorOptions: SearchableOption[] = vendors.map((vendor) => ({
    value: vendor.id,
    label: nameOf(vendor),
    description: vendor.city || undefined,
  }));

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  const resolved = useMemo(
    () =>
      lines.map((line) => {
        const item = line.itemId ? items.find((candidate) => candidate.id === line.itemId) : null;
        const quantity = Number(line.quantity) || 0;
        const unitCostH = toMinorUnits(line.unitCost || '0');

        return {
          line,
          item,
          quantity,
          unitCostH,
          totalH: quantity * unitCostH,
          newStock: item ? item.stockQuantity + quantity : 0,
          newCostH:
            item && quantity > 0 && unitCostH > 0
              ? weightedAverageCostH(item.stockQuantity, item.costH, quantity, unitCostH)
              : null,
          valid: Boolean(item) && quantity > 0 && unitCostH > 0,
        };
      }),
    [lines, items],
  );

  const validLines = resolved.filter((entry) => entry.valid);
  const purchaseLines: PurchaseLine[] = validLines.map((entry) => ({
    itemId: entry.item!.id,
    nameAr: entry.item!.nameAr,
    nameEn: entry.item!.nameEn,
    quantity: entry.quantity,
    unitCostH: entry.unitCostH,
  }));

  const totals = computePurchaseTotals(purchaseLines, VAT_RATE);
  const totalUnits = validLines.reduce((sum, entry) => sum + entry.quantity, 0);

  /* Same item on two lines would double-count against one stock figure. */
  const duplicate = useMemo(() => {
    const seen = new Set<string>();
    return validLines.some((entry) => {
      if (seen.has(entry.item!.id)) return true;
      seen.add(entry.item!.id);
      return false;
    });
  }, [validLines]);

  const blocker = !vendorId
    ? t('restock.needVendor')
    : validLines.length === 0
      ? t('restock.needLines')
      : duplicate
        ? t('restock.duplicateItem')
        : null;

  async function confirm() {
    setSubmitting(true);

    const result = await safeCall(() =>
      purchaseService.receive({
        vendorId: vendorId!,
        vendorInvoiceNumber: invoiceRef,
        lines: purchaseLines,
        paidOnReceipt: false,
        note: notes,
        receivedBy: 'Ahmed Ali',
      }),
    );

    setSubmitting(false);
    setConfirming(false);

    if (result.ok) {
      toast.success(t('restock.toast.success'), t('restock.toast.successDetail'));
      navigate(ROUTES.inventory);
    } else {
      toast.error(t('restock.toast.failed'), result.error.message);
    }
  }

  if (loading) return <LoadingState className="py-20" />;

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeft className="flip-rtl" />}
          onClick={() => navigate(ROUTES.inventory)}
        >
          {t('inventory.title')}
        </Button>
      </div>

      <PageHeader
        title={t('restock.title')}
        description={t('restock.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(ROUTES.inventory)}>
              {t('common.cancel')}
            </Button>
            <Button
              leadingIcon={<PackagePlus />}
              onClick={() => setConfirming(true)}
              disabled={Boolean(blocker)}
            >
              {t('restock.confirm')}
            </Button>
          </>
        }
      />

      {items.length === 0 && <Alert tone="info">{t('restock.noStockedItems')}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          {/* Delivery header */}
          <Card>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <FormField label={t('restock.vendor')} required>
                <SearchableSelect
                  options={vendorOptions}
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder={t('restock.vendor')}
                />
              </FormField>

              <FormField label={t('restock.invoiceRef')} showOptional>
                <Input
                  dir="ltr"
                  value={invoiceRef}
                  onChange={(event) => setInvoiceRef(event.target.value)}
                  placeholder="INV-88213"
                />
              </FormField>

              <FormField label={t('restock.date')}>
                <DatePicker
                size="sm"
                value={date}
                onChange={(value) => setDate(value)}
                />
              </FormField>

              <FormField label={t('restock.notes')} showOptional>
                <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
              </FormField>

              <div className="sm:col-span-2">
                <FormField label={t('restock.bill')} showOptional>
                  {bill ? (
                    <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{bill.name}</p>
                          <p className="text-2xs text-ink-500">
                            {(bill.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setBill(null)}>
                        {t('restock.removeBill')}
                      </Button>
                    </div>
                  ) : (
                    <label
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        const dropped = event.dataTransfer.files?.[0];
                        if (dropped) setBill(dropped);
                      }}
                      className={cn(
                        'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
                        dragging
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-ink-300 bg-ink-50/40 hover:border-ink-400',
                      )}
                    >
                      <Upload className="h-5 w-5 text-ink-400" aria-hidden />
                      <span className="text-sm text-ink-700">{t('restock.billDrop')}</span>
                      <span className="text-2xs text-ink-500">{t('restock.billFormats')}</span>
                      <input
                        type="file"
                        className="sr-only"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(event) => setBill(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </FormField>
              </div>
            </CardBody>
          </Card>

          {/* Lines */}
          <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_5rem_6rem_5.5rem_2rem] gap-2 border-b border-ink-200 bg-ink-50/70 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-500">
              <span>{t('restock.columns.product')}</span>
              <span className="text-end">{t('restock.columns.current')}</span>
              <span className="text-end">{t('restock.columns.quantity')}</span>
              {/* The result of the two columns before it — the figure the
                  person is really deciding on. */}
              <span className="text-end">{t('restock.columns.newStock')}</span>
              <span className="text-end">{t('restock.columns.unitCost')}</span>
              <span className="text-end">{t('restock.columns.total')}</span>
              <span />
            </div>

            <ul className="divide-y divide-ink-100">
              {resolved.map((entry) => (
                <li
                  key={entry.line.key}
                  className="grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_5rem_6rem_5.5rem_2rem] items-center gap-2 px-3 py-2"
                >
                  <SearchableSelect
                    size="sm"
                    options={itemOptions}
                    value={entry.line.itemId}
                    onChange={(value) => updateLine(entry.line.key, { itemId: value })}
                    placeholder={t('restock.chooseProduct')}
                    isClearable
                  />

                  <span className="numeric text-end text-sm text-ink-500">
                    {entry.item ? formatNumber(entry.item.stockQuantity, { language }) : '—'}
                  </span>

                  <Input
                    inputSize="sm"
                    type="number"
                    min="1"
                    dir="ltr"
                    className="tabular text-end"
                    value={entry.line.quantity}
                    onChange={(event) =>
                      updateLine(entry.line.key, { quantity: event.target.value })
                    }
                    placeholder="0"
                  />

                  {/* Current plus quantity. Shown in the accent colour once it
                      differs from current, so the change is visible at a glance
                      rather than needing mental arithmetic per row. */}
                  <span
                    className={cn(
                      'numeric text-end text-sm font-medium',
                      Number(entry.line.quantity) > 0 ? 'text-brand-700' : 'text-ink-400',
                    )}
                  >
                    {entry.item
                      ? formatNumber(
                          entry.item.stockQuantity + (Number(entry.line.quantity) || 0),
                          { language },
                        )
                      : '—'}
                  </span>

                  <PriceInput
                    inputSize="sm"
                    value={entry.line.unitCost}
                    onChange={(event) =>
                      updateLine(entry.line.key, { unitCost: event.target.value })
                    }
                    placeholder="0.00"
                  />

                  <span className="text-end">
                    {entry.totalH > 0 ? (
                      <CurrencyDisplay
                        amount={entry.totalH}
                        className="text-sm font-medium text-ink-900"
                      />
                    ) : (
                      <span className="text-sm text-ink-300">—</span>
                    )}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('restock.removeLine')}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((l) => l.key !== entry.line.key))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-ink-400" />
                  </Button>
                </li>
              ))}
            </ul>

            <div className="border-t border-ink-200 px-3 py-2">
              <Button
                variant="outline"
                size="sm"
                leadingIcon={<Plus />}
                onClick={() => setLines((current) => [...current, emptyLine()])}
              >
                {t('restock.addLine')}
              </Button>
            </div>
          </div>

          {duplicate && <Alert tone="warning" compact>{t('restock.duplicateItem')}</Alert>}
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="lg:sticky lg:top-16">
            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-sm font-semibold text-ink-900">{t('restock.preview')}</h2>

                {validLines.length === 0 ? (
                  <p className="text-xs text-ink-400">{t('restock.previewEmpty')}</p>
                ) : (
                  <ul className="divide-dotted-y">
                    {validLines.map((entry) => (
                      <li key={entry.line.key} className="py-1.5">
                        <p className="truncate text-xs font-medium text-ink-800">
                          {nameOf(entry.item!)}
                        </p>
                        <p className="numeric text-2xs text-ink-500">
                          {formatNumber(entry.item!.stockQuantity, { language })} +{' '}
                          {formatNumber(entry.quantity, { language })} ={' '}
                          <span className="font-semibold text-ink-900">
                            {formatNumber(entry.newStock, { language })}
                          </span>
                        </p>
                        {entry.newCostH !== null && entry.newCostH !== entry.item!.costH && (
                          <p className="text-2xs text-info-700">
                            {t('inventory.receive.costChange', {
                              from: (entry.item!.costH / 100).toFixed(2),
                              to: (entry.newCostH / 100).toFixed(2),
                            })}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <dl className="space-y-1 border-t border-dashed border-ink-200 pt-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('restock.totalUnits')}</dt>
                    <dd className="numeric font-medium text-ink-700">
                      {formatNumber(totalUnits, { language })}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('inventory.receive.subtotal')}</dt>
                    <dd>
                      <CurrencyDisplay amount={totals.subtotalH} className="text-ink-700" />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('inventory.receive.vat')}</dt>
                    <dd>
                      <CurrencyDisplay amount={totals.taxH} className="text-ink-700" />
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-ink-200 pt-1.5">
                    <dt className="text-sm font-semibold text-ink-900">
                      {t('restock.totalCost')}
                    </dt>
                    <dd>
                      <CurrencyDisplay
                        amount={totals.totalH}
                        className="text-sm font-semibold text-ink-900"
                      />
                    </dd>
                  </div>
                </dl>

                {blocker && <p className={cn('text-2xs text-ink-500')}>{blocker}</p>}
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirming}
        title={t('restock.confirmTitle')}
        description={t('restock.confirmDescription', {
          units: formatNumber(totalUnits, { language }),
          products: formatNumber(validLines.length, { language }),
        })}
        confirmLabel={t('restock.confirm')}
        variant="primary"
        loading={submitting}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      >
        <dl className="space-y-1 rounded-md bg-ink-50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('restock.vendor')}</dt>
            <dd className="font-medium text-ink-800">
              {vendors.find((vendor) => vendor.id === vendorId)
                ? nameOf(vendors.find((vendor) => vendor.id === vendorId)!)
                : '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('restock.totalCost')}</dt>
            <dd>
              <CurrencyDisplay amount={totals.totalH} className="font-semibold text-ink-900" />
            </dd>
          </div>
        </dl>
      </ConfirmModal>
    </div>
  );
}
