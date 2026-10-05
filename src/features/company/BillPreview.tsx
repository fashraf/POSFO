import { QrCode } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import { PAPER_WIDTHS } from '@/types/company';
import type { BillTemplate, CompanyProfile } from '@/types/company';
import { VAT_RATE, computeTotals, type SaleLine } from '@/types/sales';
import { SIMPLIFIED_TAX_INVOICE_TITLE, withTaxInvoiceFields } from '@/types/printing';

/** A representative basket, so the preview shows a real-looking receipt. */
const SAMPLE_LINES = [
  { nameEn: 'Coca Cola 330ml', nameAr: 'كوكا كولا ٣٣٠ مل', sku: 'DRK-COLA-330', qty: 2, unitH: 300 },
  { nameEn: 'Haircut', nameAr: 'قص شعر', sku: 'SRV-CUT', qty: 1, unitH: 4000 },
  { nameEn: 'Shampoo 400ml', nameAr: 'شامبو ٤٠٠ مل', sku: 'PC-SHMP-400', qty: 1, unitH: 2800 },
];

const SAMPLE_DISCOUNT_H = 500;

const ALIGN: Record<BillTemplate['headerAlignment'], string> = {
  start: 'text-start items-start',
  center: 'text-center items-center',
  end: 'text-end items-end',
};

const LOGO_SIZE = { sm: 'h-16 w-16', md: 'h-16 w-16', lg: 'h-16 w-16' } as const;

export interface BillPreviewProps {
  template: BillTemplate;
  company: CompanyProfile;
  className?: string;
}

/**
 * A live receipt.
 *
 * Rendered at the true paper width in pixels and in a monospace face, because
 * the thing a merchant actually needs to judge is whether their shop name fits
 * on 58mm paper — which a nicely-typeset web preview would hide from them.
 */
export function BillPreview({ template: stored, company, className }: BillPreviewProps) {
  const { t } = useTranslation();

  /* What prints, not just what is stored: a customer receipt always carries
     the tax-invoice fields, whatever an older saved template says. */
  const template = withTaxInvoiceFields(stored);
  const isTaxInvoice = template.audience === 'customer';

  const showAr = template.language === 'ar' || template.language === 'both';
  const showEn = template.language === 'en' || template.language === 'both';

  /* The receipt follows the template's own language setting, not the app's. */
  const direction = template.language === 'en' ? 'ltr' : 'rtl';

  const money = (halalas: number) => (halalas / 100).toFixed(2);

  /* The till's basis (computeTotals): subtotal and discount both VAT
     exclusive, subtotal − discount + VAT = total. */
  const totals = computeTotals(
    SAMPLE_LINES.map((line, index) => ({
      id: `sample-${index}`,
      itemId: line.sku,
      nameAr: line.nameAr,
      nameEn: line.nameEn,
      unitPriceH: line.unitH,
      quantity: line.qty,
      discountH: 0,
    })) as unknown as SaleLine[],
    template.showDiscount ? SAMPLE_DISCOUNT_H : 0,
  );
  const afterDiscountH = totals.totalH;
  const taxH = totals.taxH;
  const subtotalH = totals.subtotalH;
  const discountExH = totals.discountExH;

  const columns = [
    template.showItemName,
    template.showQuantity,
    template.showUnitPrice,
    template.showLineTotal,
  ].filter(Boolean).length;

  return (
    <div className={cn('flex justify-center', className)}>
      <div
        dir={direction}
        style={{
          width: PAPER_WIDTHS[template.paperSize],
          /* Paper stays paper-coloured in dark mode — a receipt is printed on
             white stock whatever theme the app is wearing — but the surround
             dims, so it does not glare. */
          ['--paper' as string]: 'rgb(252 252 250)',
          ['--paper-ink' as string]: 'rgb(24 24 27)',
        }}
        className="rounded-sm bg-[--paper] p-5 font-mono text-[13px] leading-relaxed text-[--paper-ink] shadow-lg ring-1 ring-ink-300"
      >
        {/* Header */}
        <header className={cn('flex flex-col gap-1', ALIGN[template.headerAlignment])}>
          {template.showLogo && (
            <div
              aria-hidden
              className={cn(
                'flex items-center justify-center rounded bg-black/5',
                LOGO_SIZE[template.logoSize],
              )}
            >
              {company.logoUrl ? (
                <img src={company.logoUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[10px] opacity-50">LOGO</span>
              )}
            </div>
          )}

          {template.showCompanyName && (
            <div className="w-full">
              {showAr && <p className="text-[17px] font-bold">{company.nameAr}</p>}
              {showEn && <p className="text-[17px] font-bold">{company.nameEn}</p>}
            </div>
          )}

          {template.showDescription && company.description && (
            <p className="w-full text-[12px] opacity-70">{company.description}</p>
          )}

          {template.showAddress && (
            <p className="w-full text-[11px] opacity-60">
              {[company.address.street, company.address.district, company.address.city]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <div className="w-full space-y-0.5 pt-1 text-[12px]">
            {template.showVatNumber && company.vatNumber && (
              <p>
                {t('bill.preview.vat')}: <span className="numeric">{company.vatNumber}</span>
              </p>
            )}
            {template.showCrNumber && company.crNumber && (
              <p>
                {t('bill.preview.cr')}: <span className="numeric">{company.crNumber}</span>
              </p>
            )}
          </div>
        </header>

        <hr className="my-2 border-0 border-t border-dashed border-current opacity-30" />

        {/* The document's title. A customer receipt is a simplified tax
            invoice (ZATCA) and must say so; it follows the template's language,
            Arabic first on a bilingual bill. Group tickets carry no such title. */}
        {isTaxInvoice && (
          <div className="mb-1 text-center font-bold">
            {showAr && <p className="text-[14px]">{SIMPLIFIED_TAX_INVOICE_TITLE.ar}</p>}
            {showEn && <p className="text-[13px]">{SIMPLIFIED_TAX_INVOICE_TITLE.en}</p>}
          </div>
        )}

        {/* Invoice meta */}
        <div className="flex justify-between text-[12px] opacity-70">
          <span className="numeric">INV-1042</span>
          <span className="numeric">27/08/2026 14:22</span>
        </div>

        <hr className="my-2 border-0 border-t border-dashed border-current opacity-30" />

        {/* Lines */}
        <table className="w-full">
          <thead>
            <tr className="border-b border-dashed border-current text-[11px] uppercase opacity-60">
              {template.showItemName && <th className="py-0.5 text-start">{t('bill.preview.item')}</th>}
              {template.showQuantity && <th className="py-0.5 text-end">{t('bill.preview.qty')}</th>}
              {template.showUnitPrice && (
                <th className="py-0.5 text-end">{t('bill.preview.price')}</th>
              )}
              {template.showLineTotal && (
                <th className="py-0.5 text-end">{t('bill.preview.total')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_LINES.map((line) => (
              <tr key={line.sku} className="align-top">
                {template.showItemName && (
                  <td className="py-0.5 pe-1">
                    <span className="block">
                      {direction === 'rtl' && showAr ? line.nameAr : line.nameEn}
                    </span>
                    {template.showSku && (
                      <span className="numeric block text-[10px] opacity-50">{line.sku}</span>
                    )}
                    {template.showBarcode && (
                      <span className="numeric block text-[10px] opacity-50">6281000000011</span>
                    )}
                  </td>
                )}
                {template.showQuantity && (
                  <td className="numeric py-0.5 text-end">{line.qty}</td>
                )}
                {template.showUnitPrice && (
                  <td className="numeric py-0.5 text-end">{money(line.unitH)}</td>
                )}
                {template.showLineTotal && (
                  <td className="numeric py-0.5 text-end">{money(line.unitH * line.qty)}</td>
                )}
              </tr>
            ))}
            {columns === 0 && (
              <tr>
                <td className="py-2 text-center text-[11px] opacity-50">
                  {t('bill.noColumns')}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <hr className="my-2 border-0 border-t border-dashed border-current opacity-30" />

        {/* Totals */}
        <dl className="space-y-0.5 text-[12px]">
          {template.showSubtotal && (
            <div className="flex justify-between">
              <dt>{t('bill.preview.subtotal')}</dt>
              <dd className="numeric">{money(subtotalH)}</dd>
            </div>
          )}
          {template.showDiscount && (
            <div className="flex justify-between">
              <dt>{t('bill.preview.discount')}</dt>
              <dd className="numeric">-{money(discountExH)}</dd>
            </div>
          )}
          {template.showVat && (
            <div className="flex justify-between">
              <dt>
                {t('bill.preview.vatLine')} {Math.round(VAT_RATE * 100)}%
              </dt>
              <dd className="numeric">{money(taxH)}</dd>
            </div>
          )}
          {template.showGrandTotal && (
            <div className="mt-1 flex justify-between border-t border-current pt-1.5 text-[16px] font-bold">
              <dt>{t('bill.preview.grandTotal')}</dt>
              <dd className="numeric">{money(afterDiscountH)}</dd>
            </div>
          )}
        </dl>

        {/* Footer */}
        {(template.footerAr || template.footerEn) && (
          <>
            <hr className="my-2 border-0 border-t border-dashed border-current opacity-30" />
            <div className="space-y-0.5 text-center text-[12px]">
              {showAr && template.footerAr && <p>{template.footerAr}</p>}
              {showEn && template.footerEn && <p>{template.footerEn}</p>}
            </div>
          </>
        )}

        {/* ZATCA QR — a placeholder, deliberately. The real payload is a signed
            TLV string the backend produces; faking it here would be misleading. */}
        {template.showZatcaQr && (
          <div className="mt-3 flex flex-col items-center gap-1">
            <div className="flex h-24 w-24 items-center justify-center rounded-sm bg-black/5">
              <QrCode className="h-16 w-16 opacity-60" />
            </div>
            <p className="text-center text-[10px] leading-tight opacity-50">
              {t('bill.qrNote')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
