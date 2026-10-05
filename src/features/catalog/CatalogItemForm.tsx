import { useEffect, useMemo, useState } from 'react';
import { Box, Wrench } from 'lucide-react';
import {
  Button,
  Checkbox,
  Drawer,
  FormField,
  Input,
  PriceInput,
  Select,
  Switch,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatPercent, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { grossMarginOf, isProduct } from '@/types/catalog';
import type { PrintGroup } from '@/types/printing';
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemKind,
  Category,
  StaffMember,
  UnitOfMeasure,
  Vendor,
} from '@/types/catalog';

const UNITS: UnitOfMeasure[] = ['piece', 'kg', 'gram', 'litre', 'ml', 'metre', 'box', 'pack'];

/** Form state keeps money as strings so the input stays editable mid-typing. */
interface FormState {
  kind: CatalogItemKind;
  nameAr: string;
  nameEn: string;
  categoryId: string;
  description: string;
  price: string;
  cost: string;
  sku: string;
  barcode: string;
  vendorId: string;
  unit: UnitOfMeasure;
  trackInventory: boolean;
  stockQuantity: string;
  minStockLevel: string;
  duration: string;
  providerId: string;
  showOnPos: boolean;
  requiresPreparation: boolean;
  printGroupId: string;
  active: boolean;
}

function emptyForm(kind: CatalogItemKind): FormState {
  return {
    kind,
    nameAr: '',
    nameEn: '',
    categoryId: '',
    description: '',
    price: '',
    cost: '',
    sku: '',
    barcode: '',
    vendorId: '',
    unit: 'piece',
    trackInventory: true,
    stockQuantity: '0',
    minStockLevel: '0',
    duration: '',
    providerId: '',
    showOnPos: true,
    requiresPreparation: false,
    printGroupId: '',
    active: true,
  };
}

function formFrom(item: CatalogItem): FormState {
  const base: FormState = {
    ...emptyForm(item.kind),
    kind: item.kind,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    categoryId: item.categoryId ?? '',
    description: item.description,
    price: fromMinorUnits(item.priceH),
    cost: fromMinorUnits(item.costH),
    showOnPos: item.showOnPos,
    requiresPreparation: item.requiresPreparation ?? false,
    printGroupId: item.printGroupId ?? '',
    active: item.status === 'active',
  };

  if (isProduct(item)) {
    return {
      ...base,
      sku: item.sku,
      barcode: item.barcode,
      vendorId: item.vendorId ?? '',
      unit: item.unit,
      trackInventory: item.trackInventory,
      stockQuantity: String(item.stockQuantity),
      minStockLevel: String(item.minStockLevel),
    };
  }

  return {
    ...base,
    duration: item.durationMinutes === null ? '' : String(item.durationMinutes),
    providerId: item.providerId ?? '',
  };
}

function toInput(form: FormState): CatalogItemInput {
  const shared = {
    kind: form.kind,
    nameAr: form.nameAr,
    nameEn: form.nameEn,
    categoryId: form.categoryId || null,
    description: form.description,
    priceH: toMinorUnits(form.price || '0'),
    costH: toMinorUnits(form.cost || '0'),
    showOnPos: form.showOnPos,
    requiresPreparation: form.requiresPreparation,
    printGroupId: form.printGroupId || null,
    status: form.active ? ('active' as const) : ('inactive' as const),
  };

  if (form.kind === 'product') {
    return {
      ...shared,
      sku: form.sku,
      barcode: form.barcode,
      vendorId: form.vendorId || null,
      unit: form.unit,
      trackInventory: form.trackInventory,
      stockQuantity: form.trackInventory ? Number(form.stockQuantity) || 0 : 0,
      minStockLevel: form.trackInventory ? Number(form.minStockLevel) || 0 : 0,
    };
  }

  return {
    ...shared,
    durationMinutes: form.duration ? Number(form.duration) : null,
    providerId: form.providerId || null,
  };
}

/** Section wrapper — a small heading with a rule, keeping the form scannable. */
function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-ink-200 pt-5 first:border-0 first:pt-0">
      <legend className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

export interface CatalogItemFormProps {
  /** Destinations an item's ticket can be routed to. */
  printGroups: PrintGroup[];
  open: boolean;
  onClose: () => void;
  /** Null means create. */
  item: CatalogItem | null;
  /** Kind preselected when creating. */
  defaultKind?: CatalogItemKind;
  categories: Category[];
  vendors: Vendor[];
  staff: StaffMember[];
  onSubmit: (input: CatalogItemInput) => Promise<boolean>;
}

export function CatalogItemForm({
  open,
  onClose,
  item,
  defaultKind = 'product',
  printGroups,
  categories,
  vendors,
  staff,
  onSubmit,
}: CatalogItemFormProps) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const [form, setForm] = useState<FormState>(() => emptyForm(defaultKind));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /* Reset whenever the drawer opens, so a previous edit never leaks in. */
  useEffect(() => {
    if (!open) return;
    setForm(item ? formFrom(item) : emptyForm(defaultKind));
    setErrors({});
  }, [open, item, defaultKind]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const margin = useMemo(() => {
    const priceH = toMinorUnits(form.price || '0');
    const costH = toMinorUnits(form.cost || '0');
    /* On the price excluding VAT, the same rule as the P&L. */
    return grossMarginOf(priceH, costH);
  }, [form.price, form.cost]);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: t('catalog.form.noCategory') },
      ...categories
        .filter((category) => category.appliesTo === 'both' || category.appliesTo === form.kind)
        .map((category) => ({ value: category.id, label: nameOf(category) })),
    ],
    [categories, form.kind, language, t],
  );

  async function handleSubmit() {
    /* The field is marked required; say so before the round trip. The server
       refuses it too (fieldErrors.sku), so this is a courtesy, not the rule. */
    if (form.kind === 'product' && form.sku.trim() === '') {
      setErrors({ sku: t('catalog.form.skuRequired') });
      return;
    }

    setSaving(true);
    setErrors({});

    try {
      const succeeded = await onSubmit(toInput(form));
      if (succeeded) onClose();
    } catch (error) {
      const failure = error as { fieldErrors?: Record<string, string[]>; message?: string };
      const fieldErrors = failure.fieldErrors;
      if (fieldErrors) {
        const entries = Object.entries(fieldErrors).filter(([, messages]) => messages.length > 0);
        /* A single-field refusal: the top-level message is already in the
           user's language, the field text is English only. */
        setErrors(
          Object.fromEntries(
            entries.map(([field, messages]) => [
              field,
              entries.length === 1 && failure.message ? failure.message : messages[0],
            ]),
          ),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? t('catalog.editItem') : t('catalog.newItem')}
      description={item ? `${nameOf(item)}` : t('catalog.form.itemTypeHint')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Fieldset legend={t('catalog.form.basics')}>
          {/* Kind is the fork in the form. Locked once an item exists, because
              changing it would strand its stock or its bookings. */}
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-ink-700">
              {t('catalog.form.itemType')}
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {(['product', 'service'] as const).map((kind) => {
                const Icon = kind === 'product' ? Box : Wrench;
                const selected = form.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={Boolean(item)}
                    onClick={() => set('kind', kind)}
                    className={cn(
                      'flex items-center gap-3 rounded-md border p-3 text-start transition-colors',
                      selected
                        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30'
                        : 'border-ink-200 bg-surface hover:border-ink-300 hover:bg-ink-50',
                      item && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded',
                        selected ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span
                      className={cn(
                        'text-base font-medium',
                        selected ? 'text-brand-800' : 'text-ink-700',
                      )}
                    >
                      {t(`catalog.kind.${kind}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('catalog.form.nameAr')} required error={errors.nameAr}>
              <Input
                value={form.nameAr}
                onChange={(event) => set('nameAr', event.target.value)}
                dir="rtl"
                placeholder="قص شعر"
              />
            </FormField>

            <FormField label={t('catalog.form.nameEn')} required error={errors.nameEn}>
              <Input
                value={form.nameEn}
                onChange={(event) => set('nameEn', event.target.value)}
                dir="ltr"
                placeholder="Haircut"
              />
            </FormField>
          </div>

          <FormField label={t('catalog.form.category')}>
            <Select
              value={form.categoryId}
              onChange={(value) => set('categoryId', value)}
              options={categoryOptions}
            />
          </FormField>

          <FormField
            label={t('catalog.form.descriptionLabel')}
            hint={t('catalog.form.descriptionHint')}
            showOptional
          >
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </FormField>
        </Fieldset>

        <Fieldset legend={t('catalog.form.pricing')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('catalog.form.costPrice')} error={errors.costH}>
              <PriceInput
                value={form.cost}
                onChange={(event) => set('cost', event.target.value)}
                placeholder="0.00"
              />
            </FormField>

            <FormField
              label={t('catalog.form.sellingPrice')}
              required
              error={errors.priceH}
              hint={
                margin === null
                  ? t('catalog.form.marginUnavailable')
                  : t('catalog.form.marginHint', {
                      margin: formatPercent(margin, { language }),
                    })
              }
            >
              <PriceInput
                value={form.price}
                onChange={(event) => set('price', event.target.value)}
                placeholder="0.00"
              />
            </FormField>
          </div>
        </Fieldset>

        {/* Everything below this point is kind-specific. A service never sees a
            stock field, and a product never sees a duration. */}
        {form.kind === 'product' ? (
          <Fieldset legend={t('catalog.form.inventory')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('catalog.form.sku')} required hint={t('catalog.form.skuHint')} error={errors.sku}>
                <Input
                  value={form.sku}
                  onChange={(event) => set('sku', event.target.value)}
                  dir="ltr"
                  placeholder="DRK-COLA-330"
                />
              </FormField>

              <FormField label={t('catalog.form.barcode')} showOptional error={errors.barcode}>
                <Input
                  value={form.barcode}
                  onChange={(event) => set('barcode', event.target.value)}
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="6281000000011"
                />
              </FormField>

              <FormField label={t('catalog.form.vendor')} showOptional>
                <Select
                  value={form.vendorId}
                  onChange={(value) => set('vendorId', value)}
                  options={[
                    { value: '', label: t('catalog.form.noVendor') },
                    ...vendors.map((vendor) => ({ value: vendor.id, label: nameOf(vendor) })),
                  ]}
                />
              </FormField>

              <FormField label={t('catalog.form.unit')}>
                <Select
                  value={form.unit}
                  onChange={(value) => set('unit', value as UnitOfMeasure)}
                  options={UNITS.map((unit) => ({ value: unit, label: unit }))}
                />
              </FormField>
            </div>

            <div className="rounded-md border border-ink-200 bg-ink-50/50 p-4">
              <Switch
                checked={form.trackInventory}
                onCheckedChange={(checked) => set('trackInventory', checked)}
                label={t('catalog.form.trackInventory')}
                description={t('catalog.form.trackInventoryHint')}
              />

              {form.trackInventory && (
                <div className="mt-4 grid gap-4 border-t border-ink-200 pt-4 sm:grid-cols-2">
                  <FormField label={t('catalog.form.openingStock')}>
                    <Input
                      type="number"
                      min="0"
                      dir="ltr"
                      className="tabular text-start"
                      value={form.stockQuantity}
                      onChange={(event) => set('stockQuantity', event.target.value)}
                    />
                  </FormField>

                  <FormField label={t('catalog.form.minStockLevel')}>
                    <Input
                      type="number"
                      min="0"
                      dir="ltr"
                      className="tabular text-start"
                      value={form.minStockLevel}
                      onChange={(event) => set('minStockLevel', event.target.value)}
                    />
                  </FormField>
                </div>
              )}
            </div>
          </Fieldset>
        ) : (
          <Fieldset legend={t('catalog.form.serviceDetails')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('catalog.form.duration')}
                hint={t('catalog.form.durationHint')}
                showOptional
              >
                <Input
                  type="number"
                  min="0"
                  step="5"
                  dir="ltr"
                  className="tabular text-start"
                  value={form.duration}
                  onChange={(event) => set('duration', event.target.value)}
                  placeholder="30"
                  trailingAddon={
                    <span className="text-xs font-medium text-ink-500">
                      {t('catalog.form.minutesSuffix')}
                    </span>
                  }
                />
              </FormField>

              <FormField label={t('catalog.form.provider')} showOptional>
                <Select
                  value={form.providerId}
                  onChange={(value) => set('providerId', value)}
                  options={[
                    { value: '', label: t('catalog.form.noProvider') },
                    ...staff.map((member) => ({
                      value: member.id,
                      label: `${nameOf(member)} — ${member.role}`,
                    })),
                  ]}
                />
              </FormField>
            </div>
          </Fieldset>
        )}

        <Fieldset legend={t('catalog.form.availability')}>
          <Checkbox
            checked={form.showOnPos}
            onChange={(event) => set('showOnPos', event.target.checked)}
            label={t('catalog.form.showOnPos')}
            description={t('catalog.form.showOnPosHint')}
          />
          <FormField
            label={t('catalog.form.printGroup')}
            help={t('catalog.form.printGroupHelp')}
            showOptional
          >
            <Select
              value={form.printGroupId}
              onChange={(value) => set('printGroupId', value)}
              options={[
                { value: '', label: t('catalog.form.noPrintGroup') },
                ...printGroups
                  .filter((group) => group.status === 'active')
                  .map((group) => ({ value: group.id, label: nameOf(group) })),
              ]}
            />
          </FormField>

          <Checkbox
            checked={form.requiresPreparation}
            onChange={(event) => set('requiresPreparation', event.target.checked)}
            label={t('catalog.form.requiresPreparation')}
            description={t('catalog.form.requiresPreparationHint')}
          />
          <Checkbox
            checked={form.active}
            onChange={(event) => set('active', event.target.checked)}
            label={t('catalog.form.activeStatus')}
            description={t('catalog.form.activeStatusHint')}
          />
        </Fieldset>
      </div>
    </Drawer>
  );
}
