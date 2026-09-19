import { useCallback, useEffect, useState } from 'react';
import { Copy, Save } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  ConfirmModal,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  SearchableSelect,
  Switch,
} from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { billTemplateService, safeCall, settingsService } from '@/services';
import type { BillTemplate } from '@/types/company';
import type {
  BranchSettings,
  DefaultCustomerMode,
  ServedByRequirement,
} from '@/types/settings';

/**
 * Settings, scoped to the active branch.
 *
 * Switching branch in the header switches what this page edits, which is why
 * the branch name is in the description rather than buried in a field — it has
 * to be impossible to configure the wrong shop by accident.
 */
export default function SettingsPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch, branches } = useSession();
  const toast = useToast();

  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [templates, setTemplates] = useState<BillTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copySource, setCopySource] = useState<string | null>(null);
  const [confirmingCopy, setConfirmingCopy] = useState(false);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    if (!activeBranch) return;
    setLoading(true);

    const [settingsResult, templateResult] = await Promise.all([
      safeCall(() => settingsService.get(activeBranch.id)),
      safeCall(() => billTemplateService.list()),
    ]);

    if (settingsResult.ok) setSettings(settingsResult.data);
    if (templateResult.ok) setTemplates(templateResult.data);
    setLoading(false);
  }, [activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof BranchSettings>(key: K, value: BranchSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!settings || !activeBranch) return;
    setSaving(true);

    const { branchId: _b, createdAt: _c, updatedAt: _u, ...input } = settings;
    const result = await safeCall(() => settingsService.update(activeBranch.id, input));
    setSaving(false);

    if (result.ok) {
      setSettings(result.data);
      toast.success(t('settings.toast.saved'));
    } else {
      toast.error(t('settings.toast.failed'), result.error.message);
    }
  }

  async function copy() {
    if (!copySource || !activeBranch) return;
    setSaving(true);

    const result = await safeCall(() => settingsService.copyFrom(copySource, activeBranch.id));
    setSaving(false);
    setConfirmingCopy(false);

    if (result.ok) {
      setSettings(result.data);
      toast.success(t('settings.toast.copied'));
    }
  }

  if (loading || !settings || !activeBranch) return <LoadingState className="py-20" />;

  const otherBranches = branches.filter((branch) => branch.id !== activeBranch.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description', { branch: nameOf(activeBranch) })}
        actions={
          <Button leadingIcon={<Save />} onClick={save} loading={saving}>
            {t('common.saveChanges')}
          </Button>
        }
      />

      <Alert tone="info" compact>
        {t('settings.branchScoped')}
      </Alert>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Checkout */}
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('settings.sections.checkout')}
            </h2>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-ink-700">
                {t('settings.fields.defaultCustomerMode')}
              </span>
              <p className="text-xs text-ink-500">
                {t('settings.fields.defaultCustomerModeHelp')}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {(['walkin', 'customer'] as DefaultCustomerMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set('defaultCustomerMode', mode)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                      settings.defaultCustomerMode === mode
                        ? 'border-brand-500 bg-brand-50/60 text-brand-800 ring-1 ring-brand-500/30'
                        : 'border-ink-200 text-ink-600 hover:border-ink-300',
                    )}
                  >
                    {t(`settings.fields.${mode}`)}
                  </button>
                ))}
              </div>
            </div>

            <FormField
              label={t('settings.fields.servedBy')}
              help={t('settings.fields.servedByHelp')}
            >
              <SearchableSelect
                size="sm"
                value={settings.servedBy}
                onChange={(value) => set('servedBy', (value ?? 'optional') as ServedByRequirement)}
                options={[
                  { value: 'off', label: t('settings.fields.servedByOff') },
                  { value: 'optional', label: t('settings.fields.servedByOptional') },
                  { value: 'required', label: t('settings.fields.servedByRequired') },
                ]}
              />
            </FormField>

            <div className="rounded-md border border-ink-200 px-3 py-2.5">
              <Switch
                checked={settings.allowNegativeStock}
                onCheckedChange={(checked) => set('allowNegativeStock', checked)}
                label={t('settings.fields.allowNegativeStock')}
                description={t('settings.fields.allowNegativeStockHelp')}
              />
            </div>
          </CardBody>
        </Card>

        {/* Receipts */}
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('settings.sections.receipts')}
            </h2>

            <FormField
              label={t('settings.fields.defaultBill')}
              help={t('settings.fields.defaultBillHelp')}
            >
              <SearchableSelect
                size="sm"
                value={settings.defaultBillTemplateId}
                onChange={(value) => set('defaultBillTemplateId', value)}
                options={templates
                  .filter((template) => template.audience === 'customer')
                  .map((template) => ({ value: template.id, label: template.name }))}
                isClearable
              />
            </FormField>

            <div className="space-y-2">
              <div className="rounded-md border border-ink-200 px-3 py-2.5">
                <Switch
                  checked={settings.autoPrintCustomerBill}
                  onCheckedChange={(checked) => set('autoPrintCustomerBill', checked)}
                  label={t('settings.fields.autoPrintCustomer')}
                />
              </div>
              <div className="rounded-md border border-ink-200 px-3 py-2.5">
                <Switch
                  checked={settings.autoPrintGroupTickets}
                  onCheckedChange={(checked) => set('autoPrintGroupTickets', checked)}
                  label={t('settings.fields.autoPrintGroups')}
                  description={t('settings.fields.autoPrintHint')}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Money */}
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('settings.sections.money')}
            </h2>

            <FormField label={t('settings.fields.vatRate')} help={t('settings.fields.vatRateHelp')}>
              <Input
                inputSize="sm"
                type="number"
                min="0"
                max="100"
                step="0.5"
                dir="ltr"
                className="tabular text-start"
                value={settings.vatRatePercent}
                onChange={(event) => set('vatRatePercent', Number(event.target.value) || 0)}
                trailingAddon={<span className="text-xs font-medium text-ink-500">%</span>}
              />
            </FormField>

            <div className="rounded-md border border-ink-200 px-3 py-2.5">
              <Switch
                checked={settings.pricesIncludeVat}
                onCheckedChange={(checked) => set('pricesIncludeVat', checked)}
                label={t('settings.fields.pricesIncludeVat')}
                description={t('settings.fields.pricesIncludeVatHelp')}
              />
            </div>
          </CardBody>
        </Card>

        {/* Copy from another branch */}
        {otherBranches.length > 0 && (
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('settings.copyFrom')}
              </h2>
              <p className="text-xs text-ink-500">{t('settings.copyFromHint')}</p>

              <div className="flex items-end gap-2">
                <SearchableSelect
                  size="sm"
                  className="flex-1"
                  value={copySource}
                  onChange={setCopySource}
                  options={otherBranches.map((branch) => ({
                    value: branch.id,
                    label: nameOf(branch),
                    description: branch.code,
                  }))}
                  placeholder={t('settings.copyFrom')}
                />
                <Button
                  variant="outline"
                  size="sm"
                  leadingIcon={<Copy />}
                  disabled={!copySource}
                  onClick={() => setConfirmingCopy(true)}
                >
                  {t('common.confirm')}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <ConfirmModal
        open={confirmingCopy}
        title={t('settings.copyConfirmTitle')}
        description={t('settings.copyConfirmDescription', {
          branch: copySource
            ? nameOf(branches.find((branch) => branch.id === copySource)!)
            : '—',
        })}
        variant="warning"
        loading={saving}
        onConfirm={copy}
        onCancel={() => setConfirmingCopy(false)}
      />
    </div>
  );
}
