import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Percent, Save, Tags } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Switch,
  Button,
  Card,
  CardBody,
  Checkbox,
  CurrencyDisplay,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  PriceInput,
  Select,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatCurrency, fromMinorUnits, toMinorUnits } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import {
  branchService,
  discountService,
  roleService,
  safeCall,
} from '@/services';
import { percentToStored, storedToPercent } from '@/types/discounts';
import type { Discount, DiscountApplicability, DiscountInput, DiscountType } from '@/types/discounts';
import type { Branch, Role } from '@/types/permissions';

interface FormState {
  nameAr: string;
  nameEn: string;
  description: string;
  type: DiscountType;
  percent: string;
  fixed: string;
  maximum: string;
  minimum: string;
  applicability: DiscountApplicability;
  appliesToIds: string[];
  branchIds: string[];
  allowedRoleIds: string[];
  approvalAbove: string;
  startsAt: string;
  endsAt: string;
  status: 'active' | 'inactive';
  isAutomatic: boolean;
  allowStacking: boolean;
  activeDays: number[];
}

const EMPTY: FormState = {
  nameAr: '',
  nameEn: '',
  description: '',
  type: 'percentage',
  percent: '10',
  fixed: '',
  maximum: '',
  minimum: '',
  applicability: 'all',
  appliesToIds: [],
  branchIds: [],
  allowedRoleIds: [],
  approvalAbove: '',
  startsAt: '',
  endsAt: '',
  status: 'active',
  isAutomatic: false,
  allowStacking: false,
  activeDays: [],
};

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const toIso = (value: string) =>
  value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;

/** `/discounts/new` and `/discounts/:id/edit`. */
export default function DiscountFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<Discount | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [roleResult, branchResult] = await Promise.all([
      safeCall(() => roleService.list()),
      safeCall(() => branchService.list()),
    ]);

    if (roleResult.ok) setRoles(roleResult.data);
    if (branchResult.ok) setBranches(branchResult.data);

    if (mode === 'edit' && id) {
      const result = await safeCall(() => discountService.get(id));
      if (result.ok) {
        const discount = result.data;
        setExisting(discount);
        setForm({
          nameAr: discount.nameAr,
          nameEn: discount.nameEn,
          description: discount.description,
          type: discount.type,
          percent:
            discount.type === 'percentage' ? String(storedToPercent(discount.value)) : '10',
          fixed: discount.type === 'fixed' ? fromMinorUnits(discount.value) : '',
          maximum: discount.maxAmountH > 0 ? fromMinorUnits(discount.maxAmountH) : '',
          minimum: discount.minOrderH > 0 ? fromMinorUnits(discount.minOrderH) : '',
          applicability: discount.applicability,
          appliesToIds: discount.appliesToIds,
          branchIds: discount.branchIds,
          allowedRoleIds: discount.allowedRoleIds,
          approvalAbove:
            discount.requiresApprovalAboveH > 0
              ? fromMinorUnits(discount.requiresApprovalAboveH)
              : '',
          startsAt: toDateInput(discount.startsAt),
          endsAt: toDateInput(discount.endsAt),
          status: discount.status,
          isAutomatic: discount.isAutomatic,
          allowStacking: discount.allowStacking,
          activeDays: discount.activeDays,
        });
      } else {
        setLoadError(result.error.message);
      }
    }

    setLoading(false);
  }, [mode, id]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function toggleIn(key: 'branchIds' | 'allowedRoleIds', id: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      [key]: checked
        ? [...current[key], id]
        : current[key].filter((entry) => entry !== id),
    }));
  }

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  /* Worked example on a 200.00 basket, so the effect of the caps is visible
     rather than something to be worked out on paper. */
  const preview = useMemo(() => {
    const sampleH = 20000;
    const rawH =
      form.type === 'percentage'
        ? Math.round((sampleH * (Number(form.percent) || 0)) / 100)
        : toMinorUnits(form.fixed || '0');

    const maxH = toMinorUnits(form.maximum || '0');
    const clamped = Math.min(rawH, sampleH);
    const finalH = maxH > 0 ? Math.min(clamped, maxH) : clamped;

    return { sampleH, finalH, capped: finalH < clamped };
  }, [form.type, form.percent, form.fixed, form.maximum]);

  async function save() {
    setSaving(true);
    setErrors({});

    const input: DiscountInput = {
      nameAr: form.nameAr,
      nameEn: form.nameEn,
      description: form.description,
      type: form.type,
      value:
        form.type === 'percentage'
          ? percentToStored(Number(form.percent) || 0)
          : toMinorUnits(form.fixed || '0'),
      maxAmountH: toMinorUnits(form.maximum || '0'),
      minOrderH: toMinorUnits(form.minimum || '0'),
      applicability: form.applicability,
      appliesToIds: form.appliesToIds,
      branchIds: form.branchIds,
      allowedRoleIds: form.allowedRoleIds,
      requiresApprovalAboveH: toMinorUnits(form.approvalAbove || '0'),
      isAutomatic: form.isAutomatic,
      allowStacking: form.allowStacking,
      activeDays: form.activeDays,
      startsAt: toIso(form.startsAt),
      endsAt: toIso(form.endsAt),
      status: form.status,
    };

    const result = await safeCall(() =>
      mode === 'edit' && id ? discountService.update(id, input) : discountService.create(input),
    );

    setSaving(false);

    if (result.ok) {
      toast.success(mode === 'edit' ? t('discounts.toast.updated') : t('discounts.toast.created'));
      navigate(ROUTES.discounts);
      return;
    }

    if (result.error.fieldErrors) {
      setErrors(
        Object.fromEntries(
          Object.entries(result.error.fieldErrors)
            .filter(([, messages]) => messages.length > 0)
            .map(([field, messages]) => [field, messages[0]]),
        ),
      );
    }
    toast.error(t('discounts.toast.failed'), result.error.message);
  }

  if (loading) return <LoadingState className="py-24" />;
  if (loadError) return <ErrorState description={loadError} onRetry={() => void load()} />;

  const blocked =
    !form.nameAr.trim() || !form.nameEn.trim()
      ? t('discounts.needName')
      : (form.type === 'percentage' ? Number(form.percent) : toMinorUnits(form.fixed || '0')) <= 0
        ? t('discounts.needValue')
        : null;

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeft className="flip-rtl" />}
          onClick={() => navigate(ROUTES.discounts)}
        >
          {t('discounts.title')}
        </Button>
      </div>

      <PageHeader
        title={mode === 'edit' ? t('discounts.editTitle') : t('discounts.newTitle')}
        description={
          mode === 'edit' ? t('discounts.editDescription') : t('discounts.newDescription')
        }
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(ROUTES.discounts)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button leadingIcon={<Save />} onClick={save} loading={saving} disabled={Boolean(blocked)}>
              {t('common.saveChanges')}
            </Button>
          </>
        }
      />

      {mode === 'edit' && existing?.status === 'active' && (
        <Alert tone="info">{t('discounts.active')}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Basic */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('discounts.sections.basic')}
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('discounts.fields.nameEn')} required error={errors.nameEn}>
                  <Input
                    dir="ltr"
                    value={form.nameEn}
                    onChange={(e) => set('nameEn', e.target.value)}
                    placeholder="10% Employee Discount"
                  />
                </FormField>
                <FormField label={t('discounts.fields.nameAr')} required error={errors.nameAr}>
                  <Input
                    dir="rtl"
                    value={form.nameAr}
                    onChange={(e) => set('nameAr', e.target.value)}
                    placeholder="خصم الموظفين ١٠٪"
                  />
                </FormField>
              </div>

              <FormField
                label={t('discounts.fields.description')}
                hint={t('discounts.fields.descriptionHint')}
                showOptional
              >
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </FormField>

              <FormField label={t('discounts.fields.status')}>
                <Select
                  value={form.status}
                  onChange={(value) => set('status', value as 'active' | 'inactive')}
                  options={[
                    { value: 'active', label: t('common.active') },
                    { value: 'inactive', label: t('common.inactive') },
                  ]}
                />
              </FormField>
            </CardBody>
          </Card>

          {/* Type and value */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('discounts.sections.value')}
              </h2>

              <div className="grid grid-cols-2 gap-2.5">
                {(['percentage', 'fixed'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set('type', type)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border p-3 text-start transition-colors',
                      form.type === type
                        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30'
                        : 'border-ink-200 bg-surface hover:border-ink-300',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded',
                        form.type === type ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500',
                      )}
                    >
                      {type === 'percentage' ? (
                        <Percent className="h-4 w-4" />
                      ) : (
                        <Tags className="h-4 w-4" />
                      )}
                    </span>
                    <span className="text-base font-medium text-ink-800">
                      {t(`discounts.type.${type}`)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {form.type === 'percentage' ? (
                  <FormField label={t('discounts.fields.percentValue')} required error={errors.value}>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      dir="ltr"
                      className="tabular text-start"
                      value={form.percent}
                      onChange={(e) => set('percent', e.target.value)}
                      trailingAddon={<span className="text-xs font-medium text-ink-500">%</span>}
                    />
                  </FormField>
                ) : (
                  <FormField label={t('discounts.fields.fixedValue')} required error={errors.value}>
                    <PriceInput value={form.fixed} onChange={(e) => set('fixed', e.target.value)} />
                  </FormField>
                )}

                <FormField
                  label={t('discounts.fields.maximum')}
                  showOptional
                  error={errors.maxAmountH}
                  help={t('discounts.fields.maximumHelp')}
                >
                  <PriceInput
                    value={form.maximum}
                    onChange={(e) => set('maximum', e.target.value)}
                    placeholder="0.00"
                  />
                </FormField>
              </div>
            </CardBody>
          </Card>

          {/* Restrictions */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('discounts.sections.restrictions')}
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={t('discounts.applicability.label')}
                  help={t('discounts.applicability.help')}
                >
                  <Select
                    value={form.applicability}
                    onChange={(value) => set('applicability', value as DiscountApplicability)}
                    options={[
                      { value: 'all', label: t('discounts.applicability.all') },
                      { value: 'products', label: t('discounts.applicability.products') },
                      { value: 'services', label: t('discounts.applicability.services') },
                    ]}
                  />
                </FormField>

                <FormField
                  label={t('discounts.fields.minimum')}
                  showOptional
                  error={errors.minOrderH}
                  help={t('discounts.fields.minimumHelp')}
                >
                  <PriceInput
                    value={form.minimum}
                    onChange={(e) => set('minimum', e.target.value)}
                    placeholder="0.00"
                  />
                </FormField>

                <FormField
                  label={t('discounts.fields.approvalAbove')}
                  showOptional
                  help={t('discounts.fields.approvalAboveHelp')}
                  className="sm:col-span-2"
                >
                  <PriceInput
                    value={form.approvalAbove}
                    onChange={(e) => set('approvalAbove', e.target.value)}
                    placeholder="0.00"
                  />
                </FormField>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium text-ink-700">
                  {t('discounts.fields.allowedRoles')}
                </span>
                <p className="text-xs text-ink-500">{t('discounts.fields.allowedRolesHelp')}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles
                    .filter((role) => !role.external)
                    .map((role) => (
                      <div key={role.id} className="rounded-md border border-ink-200 px-3 py-2">
                        <Checkbox
                          checked={form.allowedRoleIds.includes(role.id)}
                          onChange={(e) => toggleIn('allowedRoleIds', role.id, e.target.checked)}
                          label={nameOf(role)}
                        />
                      </div>
                    ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium text-ink-700">
                  {t('discounts.fields.branches')}
                </span>
                <p className="text-xs text-ink-500">{t('discounts.fields.branchesHelp')}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {branches.map((branch) => (
                    <div key={branch.id} className="rounded-md border border-ink-200 px-3 py-2">
                      <Checkbox
                        checked={form.branchIds.includes(branch.id)}
                        onChange={(e) => toggleIn('branchIds', branch.id, e.target.checked)}
                        label={nameOf(branch)}
                        description={branch.code}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Availability */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('discounts.sections.availability')}
              </h2>

              <div className="rounded-md border border-ink-200 bg-ink-50/60 p-4">
                <Switch
                  checked={form.isAutomatic}
                  onCheckedChange={(checked) => set('isAutomatic', checked)}
                  label={t('discounts.fields.automatic')}
                  description={t('discounts.fields.automaticHelp')}
                />
              </div>

              {form.isAutomatic && (
                <div className="rounded-md border border-ink-200 p-4">
                  <Switch
                    checked={form.allowStacking}
                    onCheckedChange={(checked) => set('allowStacking', checked)}
                    label={t('discounts.fields.stacking')}
                    description={t('discounts.fields.stackingHelp')}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-sm font-medium text-ink-700">
                  {t('discounts.fields.activeDays')}
                </span>
                <p className="text-xs text-ink-500">{t('discounts.fields.activeDaysHelp')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                    const on = form.activeDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          set(
                            'activeDays',
                            on
                              ? form.activeDays.filter((d) => d !== day)
                              : [...form.activeDays, day],
                          )
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          on
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-ink-200 text-ink-500 hover:border-ink-300',
                        )}
                      >
                        {t(`discounts.days.${day}` as never)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('discounts.fields.startsAt')} showOptional>
                  <DatePicker
                size="sm"
                value={form.startsAt}
                onChange={(value) => set('startsAt', value)}
                />
                </FormField>
                <FormField
                  label={t('discounts.fields.endsAt')}
                  showOptional
                  error={errors.endsAt}
                  hint={t('discounts.noExpiry')}
                >
                  <DatePicker
                size="sm"
                value={form.endsAt}
                onChange={(value) => set('endsAt', value)}
                />
                </FormField>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Worked example */}
        <div className="space-y-4">
          <div className="lg:sticky lg:top-20">
            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-base font-semibold text-ink-900">{t('wizard.review')}</h2>

                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('pos.cart.subtotal')}</dt>
                    <dd>
                      <CurrencyDisplay amount={preview.sampleH} className="text-ink-700" />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('posDiscount.amount')}</dt>
                    <dd>
                      <CurrencyDisplay amount={-preview.finalH} className="text-danger-600" />
                    </dd>
                  </div>
                  <hr className="rule-dotted" />
                  <div className="flex justify-between">
                    <dt className="font-semibold text-ink-900">{t('pos.cart.total')}</dt>
                    <dd>
                      <CurrencyDisplay
                        amount={preview.sampleH - preview.finalH}
                        className="text-md font-semibold text-ink-900"
                      />
                    </dd>
                  </div>
                </dl>

                {preview.capped && (
                  <Alert tone="warning" compact>
                    {t('posDiscount.capped')}
                  </Alert>
                )}

                <p className="text-xs text-ink-400">
                  {formatCurrency(preview.sampleH, { language })} — {t('wizard.reviewHint')}
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
