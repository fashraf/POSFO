import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Save } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  FormField,
  LoadingState,
  PageHeader,
  SearchableSelect,
  Switch,
  Tabs,
  Textarea,
} from '@/components/ui';
import { BillPreview } from '@/features/company/BillPreview';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { billTemplateService, companyService, printGroupService, safeCall } from '@/services';
import type { Alignment, BillLanguage, BillTemplate, PaperSize } from '@/types/company';
import type { BillAudience, CompanyProfile } from '@/types/company';
import { DEFAULT_BILL_TEMPLATE } from '@/types/company';
import type { PrintGroup } from '@/types/printing';
import { TAX_INVOICE_REQUIRED_FIELDS, withTaxInvoiceFields } from '@/types/printing';
import { Input } from '@/components/ui';

type TabValue = 'paper' | 'header' | 'body' | 'totals' | 'footer';

export default function BillBuilderPage({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [template, setTemplate] = useState<BillTemplate | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>('paper');
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<PrintGroup[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    const [companyResult, groupResult] = await Promise.all([
      safeCall(() => companyService.get()),
      safeCall(() => printGroupService.list()),
    ]);

    if (companyResult.ok) setCompany(companyResult.data);
    if (groupResult.ok) setGroups(groupResult.data);

    if (mode === 'edit' && id) {
      const result = await safeCall(() => billTemplateService.get(id));
      /* An older customer template saved with a tax field off opens with it
         on — that is how it prints, and the server will not save it off. */
      if (result.ok) setTemplate(withTaxInvoiceFields(result.data));
    } else {
      const stamp = new Date().toISOString();
      setTemplate({
        ...DEFAULT_BILL_TEMPLATE,
        id: 'new',
        name: '',
        isDefault: false,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }

    setLoading(false);
  }, [mode, id]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof BillTemplate>(key: K, value: BillTemplate[K]) {
    /* Switching to the customer audience turns the tax-invoice fields back on. */
    setTemplate((current) => (current ? withTaxInvoiceFields({ ...current, [key]: value }) : current));
  }

  async function save() {
    if (!template) return;
    setSaving(true);

    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = template;
    const result = await safeCall(() =>
      mode === 'edit' && id
        ? billTemplateService.update(id, input)
        : billTemplateService.create(input),
    );

    setSaving(false);

    if (result.ok) {
      toast.success(mode === 'edit' ? t('bills.toast.updated') : t('bills.toast.created'));
      navigate('/bills');
    } else {
      toast.error(t('bills.toast.failed'), result.error.message);
    }
  }

  if (loading || !template || !company) return <LoadingState className="py-20" />;

  /*
   * On a customer receipt the VAT number, VAT line and QR code are what make
   * it a simplified tax invoice (ZATCA), so they are shown on and locked, with
   * the reason. Group tickets are not invoices and keep the switch.
   */
  const isLocked = (key: keyof BillTemplate) =>
    template.audience === 'customer' &&
    (TAX_INVOICE_REQUIRED_FIELDS as readonly string[]).includes(key);

  /** A labelled on/off row — the builder is mostly these. */
  const toggle = (key: keyof BillTemplate, label: string, description?: string) => {
    const locked = isLocked(key);
    return (
      <div className="rounded-md border border-ink-200 px-3 py-2">
        <Switch
          checked={locked || Boolean(template[key])}
          disabled={locked}
          onCheckedChange={(checked) => set(key, checked as never)}
          label={label}
          description={locked ? t('bill.taxInvoiceLocked') : description}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeft className="flip-rtl" />}
          onClick={() => navigate('/bills')}
        >
          {t('bills.title')}
        </Button>
      </div>

      <PageHeader
        title={mode === 'edit' ? t('bills.editTitle') : t('bills.newTitle')}
        description={t('bill.description')}
        actions={
          <>
            <Button variant="outline" leadingIcon={<Printer />} onClick={() => window.print()}>
              {t('bill.actions.print')}
            </Button>
            <Button leadingIcon={<Save />} onClick={save} loading={saving}>
              {t('bill.actions.save')}
            </Button>
          </>
        }
      />

      {/* Configuration on the left, live receipt on the right. Every toggle
          changes the paper immediately — that feedback is the whole point. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Card>
          <CardBody className="space-y-3">
            {/* What this template prints comes first: it changes what the rest
                of the options even mean. */}
            <div className="grid gap-3 border-b border-dashed border-ink-200 pb-3 sm:grid-cols-2">
              <FormField label={t('bills.name')} required>
                <Input
                  inputSize="sm"
                  value={template.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="Kitchen ticket"
                />
              </FormField>

              <FormField label={t('bills.audience.label')} help={t('bills.audience.help')}>
                <SearchableSelect
                  size="sm"
                  value={template.audience}
                  onChange={(value) => set('audience', (value ?? 'customer') as BillAudience)}
                  options={[
                    { value: 'customer', label: t('bills.audience.customer') },
                    { value: 'group', label: t('bills.audience.group') },
                  ]}
                />
              </FormField>

              {template.audience === 'group' && (
                <FormField
                  label={t('bills.printGroup')}
                  required
                  help={t('bills.printGroupHelp')}
                  className="sm:col-span-2"
                >
                  <SearchableSelect
                    size="sm"
                    value={template.printGroupId}
                    onChange={(value) => set('printGroupId', value)}
                    options={groups.map((group) => ({
                      value: group.id,
                      label: language === 'ar' ? group.nameAr : group.nameEn,
                    }))}
                    placeholder={t('bills.printGroup')}
                  />
                </FormField>
              )}

              {template.audience === 'customer' && (
                <div className="sm:col-span-2">
                  <div className="rounded-md border border-ink-200 px-3 py-2.5">
                    <Switch
                      checked={template.isDefault}
                      onCheckedChange={(checked) => set('isDefault', checked)}
                      label={t('bills.setDefault')}
                    />
                  </div>
                </div>
              )}
            </div>

            <Tabs
              value={tab}
              onChange={(value) => setTab(value as TabValue)}
              aria-label={t('bill.title')}
              items={[
                { value: 'paper', label: t('bill.tabs.paper') },
                { value: 'header', label: t('bill.tabs.header') },
                { value: 'body', label: t('bill.tabs.body') },
                { value: 'totals', label: t('bill.tabs.totals') },
                { value: 'footer', label: t('bill.tabs.footer') },
              ]}
            />

            {tab === 'paper' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label={t('bill.paper.size')} help={t('bill.paper.sizeHelp')}>
                  <SearchableSelect
                    size="sm"
                    value={template.paperSize}
                    onChange={(value) => set('paperSize', (value ?? '80mm') as PaperSize)}
                    options={[
                      { value: '58mm', label: '58 mm' },
                      { value: '80mm', label: '80 mm' },
                      { value: 'a4', label: 'A4' },
                    ]}
                  />
                </FormField>

                <FormField label={t('bill.paper.language')}>
                  <SearchableSelect
                    size="sm"
                    value={template.language}
                    onChange={(value) => set('language', (value ?? 'both') as BillLanguage)}
                    options={[
                      { value: 'ar', label: t('bill.paper.ar') },
                      { value: 'en', label: t('bill.paper.en') },
                      { value: 'both', label: t('bill.paper.both') },
                    ]}
                  />
                </FormField>

                <FormField label={t('bill.paper.alignment')}>
                  <SearchableSelect
                    size="sm"
                    value={template.headerAlignment}
                    onChange={(value) => set('headerAlignment', (value ?? 'center') as Alignment)}
                    options={[
                      { value: 'start', label: t('bill.paper.start') },
                      { value: 'center', label: t('bill.paper.center') },
                      { value: 'end', label: t('bill.paper.end') },
                    ]}
                  />
                </FormField>
              </div>
            )}

            {tab === 'header' && (
              <div className="grid gap-2 sm:grid-cols-2">
                {toggle('showLogo', t('bill.header.logo'))}

                {template.showLogo && (
                  <FormField label={t('bill.header.logoSize')}>
                    <SearchableSelect
                      size="sm"
                      value={template.logoSize}
                      onChange={(value) =>
                        set('logoSize', (value ?? 'md') as BillTemplate['logoSize'])
                      }
                      options={[
                        { value: 'sm', label: t('bill.header.sm') },
                        { value: 'md', label: t('bill.header.md') },
                        { value: 'lg', label: t('bill.header.lg') },
                      ]}
                    />
                  </FormField>
                )}

                {toggle('showCompanyName', t('bill.header.companyName'))}
                {toggle('showDescription', t('bill.header.description'))}
                {toggle('showVatNumber', t('bill.header.vat'))}
                {toggle('showCrNumber', t('bill.header.cr'))}
                {toggle('showAddress', t('bill.header.address'))}
              </div>
            )}

            {tab === 'body' && (
              <div className="grid gap-2 sm:grid-cols-2">
                {toggle('showItemName', t('bill.body.itemName'))}
                {toggle('showQuantity', t('bill.body.quantity'))}
                {toggle('showUnitPrice', t('bill.body.unitPrice'))}
                {toggle('showLineTotal', t('bill.body.lineTotal'))}
                {toggle('showSku', t('bill.body.sku'))}
                {toggle('showBarcode', t('bill.body.barcode'))}
                {toggle('showLineDiscount', t('bill.body.lineDiscount'))}
              </div>
            )}

            {tab === 'totals' && (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {toggle('showSubtotal', t('bill.totals.subtotal'))}
                  {toggle('showDiscount', t('bill.totals.discount'))}
                  {toggle('showVat', t('bill.totals.vat'))}
                </div>

                {/* The grand total is not optional. Offering a switch that
                    produces an unusable receipt is not a real choice. */}
                <Alert tone="tip" compact>
                  {t('bill.totals.grandTotalLocked')}
                </Alert>
              </div>
            )}

            {tab === 'footer' && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label={t('bill.footer.en')} hint={t('bill.footer.hint')} showOptional>
                    <Textarea
                      rows={2}
                      dir="ltr"
                      value={template.footerEn}
                      onChange={(event) => set('footerEn', event.target.value)}
                    />
                  </FormField>

                  <FormField label={t('bill.footer.ar')} showOptional>
                    <Textarea
                      rows={2}
                      dir="rtl"
                      value={template.footerAr}
                      onChange={(event) => set('footerAr', event.target.value)}
                    />
                  </FormField>
                </div>

                {toggle('showZatcaQr', t('bill.footer.qr'), t('bill.qrNote'))}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="lg:sticky lg:top-16 lg:h-fit">
          <div className="rounded-lg bg-ink-100 p-5">
            <BillPreview template={template} company={company} />
          </div>
        </div>
      </div>


    </div>
  );
}
