import type { ID, Timestamped } from './common';
import type { SaleLine } from './sales';

/**
 * A print group is a destination for part of an order.
 *
 * Deliberately generic: a restaurant calls them Kitchen and Bar, a laundry
 * calls them Washing and Ironing, a shop calls them Packing. Hard-coding
 * "kitchen" would make the whole product a restaurant POS, which it is not.
 */
export interface PrintGroup extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  /** Shown on the ticket header. Falls back to the name. */
  ticketTitle: string;
  sortOrder: number;
  status: 'active' | 'inactive';
}

export type DocumentKind = 'customer_receipt' | 'group_ticket';

/**
 * The title a customer receipt carries.
 *
 * A Saudi B2C receipt is a simplified tax invoice, and ZATCA requires it to
 * say so, in Arabic (English alongside on a bilingual bill). Group tickets —
 * kitchen, bar, packing — are not invoices and never carry it.
 */
export const SIMPLIFIED_TAX_INVOICE_TITLE = {
  ar: 'فاتورة ضريبية مبسطة',
  en: 'Simplified Tax Invoice',
} as const;

/**
 * The template switches a customer receipt cannot turn off: the seller's VAT
 * number, the VAT line and the QR code are mandatory on a simplified tax
 * invoice. The server refuses to save them off (62031–62033); the builder
 * shows them locked, and anything rendering a customer receipt forces them on.
 */
export const TAX_INVOICE_REQUIRED_FIELDS = ['showVatNumber', 'showVat', 'showZatcaQr'] as const;

export type TaxInvoiceRequiredField = (typeof TAX_INVOICE_REQUIRED_FIELDS)[number];

/** A template as a receipt must render it: tax-invoice fields forced on for customers. */
export function withTaxInvoiceFields<
  T extends { audience: 'customer' | 'group' } & Record<TaxInvoiceRequiredField, boolean>,
>(template: T): T {
  if (template.audience !== 'customer') return template;
  return { ...template, showVatNumber: true, showVat: true, showZatcaQr: true };
}

/** One printable document produced from an order. */
export interface PrintDocument {
  id: string;
  kind: DocumentKind;
  /** Null for the customer receipt, which is not tied to a group. */
  groupId: ID | null;
  titleAr: string;
  titleEn: string;
  lines: SaleLine[];
}

/**
 * Split an order into everything that needs printing.
 *
 * The rule that matters: **the customer receipt always carries the whole
 * order; a group ticket carries only the lines assigned to that group.** Items
 * with no print group appear on the customer receipt and nowhere else.
 */
export function buildPrintDocuments(
  lines: SaleLine[],
  groups: PrintGroup[],
  itemGroupIds: Record<string, ID | null>,
): PrintDocument[] {
  const documents: PrintDocument[] = [
    {
      id: 'customer',
      kind: 'customer_receipt',
      groupId: null,
      /* A customer receipt is a simplified tax invoice, and its title says so. */
      titleAr: SIMPLIFIED_TAX_INVOICE_TITLE.ar,
      titleEn: SIMPLIFIED_TAX_INVOICE_TITLE.en,
      lines,
    },
  ];

  for (const group of groups) {
    if (group.status !== 'active') continue;

    const groupLines = lines.filter((line) => itemGroupIds[line.itemId] === group.id);
    /* A group with nothing in this order produces no ticket, and its button
       never appears — offering an empty print is a way to waste paper. */
    if (groupLines.length === 0) continue;

    documents.push({
      id: group.id,
      kind: 'group_ticket',
      groupId: group.id,
      titleAr: group.nameAr,
      titleEn: group.nameEn,
      lines: groupLines,
    });
  }

  return documents;
}

/** Which groups an order actually touches. Drives the print buttons. */
export function groupsInOrder(
  lines: SaleLine[],
  groups: PrintGroup[],
  itemGroupIds: Record<string, ID | null>,
): PrintGroup[] {
  const touched = new Set(
    lines.map((line) => itemGroupIds[line.itemId]).filter((id): id is ID => Boolean(id)),
  );
  return groups.filter((group) => touched.has(group.id) && group.status === 'active');
}
