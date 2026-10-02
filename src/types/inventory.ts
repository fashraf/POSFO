import type { ID, Timestamped } from './common';

/**
 * Stock is a ledger, not a number.
 *
 * `stockQuantity` on a product is a running total kept for speed; the movements
 * below are the record of how it got there. Every change — a sale, a return, a
 * delivery, a count correction — appends one, so "why is this figure 7?" always
 * has an answer.
 */
export type MovementKind =
  | 'purchase'
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'stocktake'
  | 'opening';

export interface StockMovement extends Timestamped {
  /** Where the stock actually moved. Stock is physical, so it is per branch. */
  branchId: ID | null;
  id: ID;
  itemId: ID;
  kind: MovementKind;
  /** Signed: positive adds stock, negative removes it. */
  quantity: number;
  /** Quantity on hand immediately after this movement. */
  balanceAfter: number;
  /** Invoice number, credit note number, or purchase reference. */
  reference: string;
  /** Free text — required for a manual adjustment, optional elsewhere. */
  note: string;
  /** Unit cost at the time, in halalas. Zero when the movement has no cost. */
  unitCostH: number;
  actor: string;
  occurredAt: string;
}

/** Why someone is correcting stock by hand. Forces a real answer. */
export type AdjustmentReason =
  | 'damaged'
  | 'expired'
  | 'lost'
  | 'found'
  | 'supplier_shortage'
  | 'internal_use'
  | 'other';

/** Adjustment reasons that can only ever reduce stock. */
export const REDUCING_REASONS: AdjustmentReason[] = [
  'damaged',
  'expired',
  'lost',
  'supplier_shortage',
  'internal_use',
];

export interface PurchaseLine {
  itemId: ID;
  nameAr: string;
  nameEn: string;
  quantity: number;
  /** What you paid per unit, in halalas. Updates the item's cost on receipt. */
  unitCostH: number;
}

export type PurchaseStatus = 'received' | 'cancelled';

export interface Purchase extends Timestamped {
  id: ID;
  /** Human-readable reference, e.g. GRN-118. */
  reference: string;
  vendorId: ID;
  /** The supplier's own invoice number, if they gave you one. */
  vendorInvoiceNumber: string;
  lines: PurchaseLine[];
  /** Net of VAT. */
  subtotalH: number;
  taxH: number;
  totalH: number;
  /** True when paid on delivery; false means it sits on the vendor balance. */
  paidOnReceipt: boolean;
  /** Settled so far — the whole total when paid on receipt. */
  paidH: number;
  outstandingH: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  vendorNameAr: string;
  vendorNameEn: string;
  branchId: ID | null;
  status: PurchaseStatus;
  note: string;
  receivedBy: string;
  receivedAt: string;
}

export interface VendorPayment extends Timestamped {
  id: ID;
  reference: string;
  vendorId: ID;
  amountH: number;
  method: 'cash' | 'card' | 'bank';
  note: string;
  paidBy: string;
  paidAt: string;
  branchId: ID | null;
  /** The journal entry the payment posted. */
  entryId: ID | null;
  /** Which purchases it settled, oldest first. */
  allocations: { purchaseId: ID; reference: string; amountH: number }[];
}

export type VendorLedgerKind = 'purchase' | 'payment';

/**
 * A line of a vendor's account. Signed from your point of view: positive means
 * you owe more, negative means you have paid some off.
 */
export interface VendorLedgerEntry {
  id: ID;
  kind: VendorLedgerKind;
  reference: string;
  date: string;
  amountH: number;
  /** Running balance after this line, as the server computed it. */
  balanceH: number;
  method: string | null;
  vendorInvoiceNumber: string | null;
  note: string | null;
}

/** Totals for a purchase. Supplier prices are quoted net, so VAT is added on. */
export function computePurchaseTotals(
  lines: PurchaseLine[],
  vatRate: number,
): { subtotalH: number; taxH: number; totalH: number } {
  const subtotalH = lines.reduce((sum, line) => sum + line.unitCostH * line.quantity, 0);
  const taxH = Math.round(subtotalH * vatRate);
  return { subtotalH, taxH, totalH: subtotalH + taxH };
}

/**
 * Weighted average cost after receiving new stock.
 *
 * Using the latest purchase price alone would make margins lurch every time a
 * supplier changed their price; averaging over what is actually on the shelf
 * reflects what the stock really cost.
 */
export function weightedAverageCostH(
  currentQuantity: number,
  currentCostH: number,
  incomingQuantity: number,
  incomingCostH: number,
): number {
  const totalQuantity = currentQuantity + incomingQuantity;
  if (totalQuantity <= 0) return incomingCostH;
  if (currentQuantity <= 0) return incomingCostH;

  const totalValue = currentQuantity * currentCostH + incomingQuantity * incomingCostH;
  return Math.round(totalValue / totalQuantity);
}

export interface InventorySummary {
  /** Cost value of everything tracked, in halalas. */
  totalValueH: number;
  /** What it would fetch at current selling prices. */
  retailValueH: number;
  trackedItems: number;
  lowStock: number;
  outOfStock: number;
  /** Cost value of stock written off in the current period. */
  shrinkageH: number;
}
