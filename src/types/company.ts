import type { Timestamped } from './common';

export interface CompanyAddress {
  street: string;
  district: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface CompanySocial {
  instagram: string;
  facebook: string;
  x: string;
  tiktok: string;
  linkedin: string;
  youtube: string;
}

export interface CompanyProfile extends Timestamped {
  nameEn: string;
  nameAr: string;
  description: string;
  logoUrl: string | null;
  crNumber: string;
  vatNumber: string;
  phone: string;
  email: string;
  website: string;
  address: CompanyAddress;
  social: CompanySocial;
}

/** Only the social links actually filled in — the preview hides the rest. */
export function activeSocials(social: CompanySocial): { key: keyof CompanySocial; handle: string }[] {
  return (Object.keys(social) as (keyof CompanySocial)[])
    .filter((key) => social[key].trim() !== '')
    .map((key) => ({ key, handle: social[key].trim() }));
}

/* ------------------------------------------------------------------ */
/* Bill template                                                       */
/* ------------------------------------------------------------------ */

export type PaperSize = '58mm' | '80mm' | 'a4';
export type BillLanguage = 'ar' | 'en' | 'both';
export type Alignment = 'start' | 'center' | 'end';

/**
 * Who a template prints for.
 *
 * `customer` always carries the whole order. `group` carries only the lines
 * assigned to its print group — that distinction is the entire point of having
 * more than one template.
 */
export type BillAudience = 'customer' | 'group';

export interface BillTemplate extends Timestamped {
  id: string;
  name: string;
  audience: BillAudience;
  /** Required when audience is `group`; ignored otherwise. */
  printGroupId: string | null;
  isDefault: boolean;
  status: 'active' | 'inactive';
  paperSize: PaperSize;
  language: BillLanguage;
  headerAlignment: Alignment;

  /* Header */
  showLogo: boolean;
  logoSize: 'sm' | 'md' | 'lg';
  showCompanyName: boolean;
  showDescription: boolean;
  showVatNumber: boolean;
  showCrNumber: boolean;
  showAddress: boolean;

  /* Body columns */
  showItemName: boolean;
  showSku: boolean;
  showBarcode: boolean;
  showUnitPrice: boolean;
  showQuantity: boolean;
  showLineTotal: boolean;
  showLineDiscount: boolean;

  /* Totals */
  showSubtotal: boolean;
  showDiscount: boolean;
  showVat: boolean;
  showGrandTotal: boolean;

  /* Footer */
  footerEn: string;
  footerAr: string;
  showZatcaQr: boolean;
}

export const DEFAULT_BILL_TEMPLATE: Omit<BillTemplate, 'createdAt' | 'updatedAt' | 'id'> = {
  name: 'Customer bill',
  audience: 'customer',
  printGroupId: null,
  isDefault: true,
  status: 'active',
  paperSize: '80mm',
  language: 'both',
  headerAlignment: 'center',
  showLogo: true,
  logoSize: 'md',
  showCompanyName: true,
  showDescription: true,
  showVatNumber: true,
  showCrNumber: true,
  showAddress: false,
  showItemName: true,
  showSku: false,
  showBarcode: false,
  showUnitPrice: true,
  showQuantity: true,
  showLineTotal: true,
  showLineDiscount: false,
  showSubtotal: true,
  showDiscount: true,
  showVat: true,
  showGrandTotal: true,
  footerEn: 'Thank you for your business',
  footerAr: 'شكرًا لتعاملكم معنا',
  showZatcaQr: true,
};

/** Rendered width of the receipt preview, in CSS pixels. */
/**
 * On-screen width of the preview.
 *
 * Scaled up from true millimetres: at 1:1 the text is too small to proofread
 * on a monitor, and the point of the preview is to be readable. Proportions
 * between the sizes are preserved, so a name that overflows 58mm here
 * overflows it on paper too.
 */
export const PAPER_WIDTHS: Record<PaperSize, number> = {
  '58mm': 320,
  '80mm': 440,
  a4: 680,
};
