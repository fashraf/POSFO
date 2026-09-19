import type { ID, Timestamped } from './common';
import type { CatalogItemKind } from './catalog';

/** Saudi standard rate. Lives here until settings are configurable. */
export const VAT_RATE = 0.15;

export type PaymentMethod = 'cash' | 'card' | 'credit';

export type SaleStatus = 'completed' | 'returned' | 'partially_returned' | 'voided';

/**
 * A line on a sale.
 *
 * Prices are captured at the moment of sale and never re-read from the catalog.
 * If an item's price changes tomorrow, yesterday's receipt must not change with
 * it — so the line owns its own copy.
 */
export interface SaleLine {
  id: ID;
  itemId: ID;
  kind: CatalogItemKind;
  nameAr: string;
  nameEn: string;
  quantity: number;
  /** VAT-inclusive unit price at time of sale, in halalas. */
  unitPriceH: number;
  /** Unit cost at time of sale, for margin reporting. */
  unitCostH: number;
  /** Line-level discount in halalas, already applied to the totals. */
  discountH: number;
}

export interface SalePayment {
  method: PaymentMethod;
  /** Amount tendered against this method, in halalas. */
  amountH: number;
}

export interface Sale extends Timestamped {
  /**
   * The branch this sale happened at.
   *
   * Null only for records created before branches existed. Every read path
   * treats null as "belongs to whichever branch is asking", so legacy data
   * stays visible rather than disappearing.
   */
  branchId: ID | null;
  id: ID;
  /** Human-readable invoice number, e.g. INV-1042. */
  invoiceNumber: string;
  lines: SaleLine[];
  payments: SalePayment[];
  customerId: ID | null;
  cashierName: string;
  /** Invoice-level discount in halalas. */
  discountH: number;
  /** Net of VAT. */
  subtotalH: number;
  taxH: number;
  totalH: number;
  /** Cash handed over, for the change calculation. Null for non-cash sales. */
  tenderedH: number | null;
  changeH: number;
  status: SaleStatus;
  soldAt: string;
  /** Set only when the sale is voided — who, when, and why. */
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
}

export interface Customer extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  phone: string;
  email: string;
  /** Outstanding balance in halalas. Positive means the customer owes money. */
  balanceH: number;
  /** Credit ceiling in halalas. Zero means no credit allowed. */
  creditLimitH: number;
  status: 'active' | 'inactive';
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/**
 * Displayed prices are VAT-inclusive, which is how Saudi retail quotes them.
 * The tax component is therefore extracted from the gross rather than added to
 * a net, and every intermediate result stays an integer.
 */
export function taxFromGross(grossH: number, rate: number = VAT_RATE): number {
  return Math.round((grossH * rate) / (1 + rate));
}

export function lineGrossH(line: SaleLine): number {
  return Math.max(0, line.unitPriceH * line.quantity - line.discountH);
}

export interface CartTotals {
  /** Sum of line gross before the invoice-level discount. */
  grossH: number;
  discountH: number;
  /** Net of VAT, after discount. */
  subtotalH: number;
  taxH: number;
  totalH: number;
  itemCount: number;
  lineCount: number;
}

/**
 * The single place cart totals are computed.
 *
 * Both the cart panel and the payment modal call this, so the number the
 * cashier sees is by construction the number that gets posted — there is no
 * second implementation to drift out of step.
 */
export function computeTotals(lines: SaleLine[], invoiceDiscountH = 0): CartTotals {
  const grossH = lines.reduce((sum, line) => sum + lineGrossH(line), 0);
  const discountH = Math.min(Math.max(0, invoiceDiscountH), grossH);
  const totalH = grossH - discountH;
  const taxH = taxFromGross(totalH);

  return {
    grossH,
    discountH,
    subtotalH: totalH - taxH,
    taxH,
    totalH,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    lineCount: lines.length,
  };
}

/* ------------------------------------------------------------------ */
/* Returns and voids                                                   */
/* ------------------------------------------------------------------ */

/**
 * A void and a return are different events, not two words for the same thing.
 *
 *  - A **void** cancels a sale that should never have been recorded. The whole
 *    invoice is reversed and nothing of it survives into revenue.
 *  - A **return** is a real, later transaction: the customer keeps the history
 *    of having bought, and a credit note offsets part or all of it.
 *
 * Keeping them apart matters because they post differently, and collapsing them
 * now would be expensive to unpick once there is a ledger behind this.
 */
export type ReturnReason =
  | 'damaged'
  | 'not_as_described'
  | 'changed_mind'
  | 'wrong_item'
  | 'other';

export interface CreditNoteLine {
  saleLineId: ID;
  itemId: ID;
  nameAr: string;
  nameEn: string;
  quantity: number;
  unitPriceH: number;
}

export interface CreditNote extends Timestamped {
  id: ID;
  /** Human-readable credit note number, e.g. CN-204. */
  noteNumber: string;
  saleId: ID;
  saleInvoiceNumber: string;
  lines: CreditNoteLine[];
  reason: ReturnReason;
  /** Free text the cashier adds. Required when the reason is "other". */
  note: string;
  subtotalH: number;
  taxH: number;
  totalH: number;
  refundMethod: PaymentMethod;
  issuedBy: string;
  issuedAt: string;
}

/**
 * How many of each line remain returnable, given everything already credited.
 * Derived, never stored — a stored counter drifts the moment anything fails
 * halfway.
 */
export function remainingQuantities(sale: Sale, notes: CreditNote[]): Record<string, number> {
  const returned = notes
    .filter((note) => note.saleId === sale.id)
    .flatMap((note) => note.lines)
    .reduce<Record<string, number>>((totals, line) => {
      totals[line.saleLineId] = (totals[line.saleLineId] ?? 0) + line.quantity;
      return totals;
    }, {});

  return sale.lines.reduce<Record<string, number>>((remaining, line) => {
    remaining[line.id] = Math.max(0, line.quantity - (returned[line.id] ?? 0));
    return remaining;
  }, {});
}

/** Totals for a proposed return, using the same VAT extraction as a sale. */
export function computeReturnTotals(lines: CreditNoteLine[]): {
  subtotalH: number;
  taxH: number;
  totalH: number;
} {
  const totalH = lines.reduce((sum, line) => sum + line.unitPriceH * line.quantity, 0);
  const taxH = taxFromGross(totalH);
  return { subtotalH: totalH - taxH, taxH, totalH };
}

/* ------------------------------------------------------------------ */
/* Customer statements                                                 */
/* ------------------------------------------------------------------ */

/** A payment received against a customer's outstanding balance. */
export interface CustomerPayment extends Timestamped {
  id: ID;
  receiptNumber: string;
  customerId: ID;
  amountH: number;
  method: Exclude<PaymentMethod, 'credit'>;
  note: string;
  receivedBy: string;
  receivedAt: string;
}

export type StatementEntryKind = 'credit_sale' | 'payment' | 'credit_note';

/**
 * One line of a customer statement.
 *
 * `amountH` is signed from the customer's point of view: positive increases
 * what they owe, negative reduces it. A running balance is then just a
 * cumulative sum, with no per-type branching to get wrong.
 */
export interface StatementEntry {
  id: ID;
  kind: StatementEntryKind;
  reference: string;
  date: string;
  amountH: number;
  balanceH: number;
}

/** Build a statement in chronological order, carrying a running balance. */
export function buildStatement(
  entries: Omit<StatementEntry, 'balanceH'>[],
  openingBalanceH = 0,
): StatementEntry[] {
  const ordered = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let running = openingBalanceH;
  return ordered.map((entry) => {
    running += entry.amountH;
    return { ...entry, balanceH: running };
  });
}

/** How much credit the customer has left before hitting their ceiling. */
export function availableCreditH(customer: Customer): number {
  return Math.max(0, customer.creditLimitH - customer.balanceH);
}

/** Share of the limit already used, as a ratio, for the utilisation bar. */
export function creditUtilisation(customer: Customer): number {
  if (customer.creditLimitH <= 0) return customer.balanceH > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, customer.balanceH / customer.creditLimitH));
}
