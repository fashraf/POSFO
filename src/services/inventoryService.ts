import { activationApi, catalogApi, inventoryApi } from './api';
import type {
  PurchaseRow,
  SaveVendorPayload,
  VendorLedgerRow,
  VendorPaymentRow,
  VendorRow,
} from './api/inventoryApi';
import { invalidate } from './dataVersion';
import { activeBranchForStock } from './apiCatalogService';
import { toStockMovement } from './mappers/saleMappers';
import type {
  AdjustmentReason,
  InventorySummary,
  MovementKind,
  Purchase,
  PurchaseLine,
  StockMovement,
  VendorLedgerEntry,
  VendorPayment,
} from '@/types/inventory';
import type { Vendor } from '@/types/catalog';
import { en } from '@/i18n/locales/en';
import { ar } from '@/i18n/locales/ar';
import { HttpError } from './http';
import { utc } from './mappers/time';
import { compareBy, validationFailed } from './util';

/**
 * Inventory and supply.
 *
 * Stock changes only on the server. Sales, purchases and adjustments each go
 * through one procedure that moves the level and writes the movement in the
 * same transaction, which is why an item's history is complete rather than
 * whatever happened to get logged.
 */

/**
 * A movement as the screens describe one.
 *
 * Kept for the services barrel. Nothing records movements client-side any
 * more — the server writes them as part of each stock-changing call.
 */
export interface RecordMovementInput {
  itemId: string;
  branchId?: string | null;
  kind: MovementKind;
  quantity: number;
  reference: string;
  note?: string;
  unitCostH?: number;
  actor?: string;
}

/** The branch stock writes apply to. Refuses rather than guessing one. */
function requireBranch(): string {
  const branchId = activeBranchForStock();

  if (!branchId) {
    throw validationFailed({
      branch: ['Select a branch first. Stock is held per branch.'],
    });
  }

  return branchId;
}

/** Run `task` over `values`, a few at a time, so a long list is not one burst. */
async function inBatches<T, R>(values: T[], size: number, task: (value: T) => Promise<R>) {
  const results: R[] = [];
  for (let start = 0; start < values.length; start += size) {
    results.push(...(await Promise.all(values.slice(start, start + size).map(task))));
  }
  return results;
}

export const inventoryService = {
  /** Movement history for one item, newest first. */
  async movementsFor(itemId: string, limit = 50): Promise<StockMovement[]> {
    const rows = await inventoryApi.movements(itemId, {
      branchId: activeBranchForStock(),
      take: limit,
    });
    return rows.map(toStockMovement);
  },

  async recentMovements(limit = 20): Promise<StockMovement[]> {
    /* There is no cross-item movement endpoint, and adding one would mean a
       new route for a dashboard strip. Recent low-stock items and their
       movements cover the same need from routes that already exist. */
    const levels = await inventoryApi.levels({ pageSize: 10 });
    const perItem = await Promise.all(
      levels.items
        .slice(0, 5)
        .map((row) => inventoryApi.movements(row.itemId, { take: 5 })),
    );

    return perItem
      .flat()
      .map(toStockMovement)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  },

  /**
   * A manual correction. The reason is mandatory because "the number was
   * wrong" is not an audit trail, and reducing reasons cannot be used to add
   * stock — a shortage that increases your count is a different event.
   *
   * The server records who made it from the token, so no actor is passed.
   */
  async adjust(input: {
    itemId: string;
    quantity: number;
    reason: AdjustmentReason;
    note: string;
  }): Promise<StockMovement> {
    if (input.quantity === 0) {
      throw validationFailed({ quantity: ['Enter a quantity above or below zero.'] });
    }

    const note = input.note.trim();

    if (input.reason === 'other' && !note) {
      throw validationFailed({
        note: ['Describe what happened when the reason is "Other".'],
      });
    }

    const branchId = requireBranch();
    const item = await catalogApi.item(input.itemId, branchId);

    if (item.kind !== 'product' || !item.tracksStock) {
      throw new HttpError({
        status: 409,
        code: 'not_tracked',
        message: 'This item does not track stock, so there is nothing to adjust.',
      });
    }

    /* The route takes the new absolute quantity: the procedure posts the
       difference against what is really on hand. Read just now, so the delta
       is applied to the current figure rather than to what the screen showed. */
    if (item.quantity + input.quantity < 0) {
      throw new HttpError({
        status: 422,
        code: 'negative_stock',
        message: `You cannot remove more than the ${item.quantity} on hand.`,
        fieldErrors: { quantity: [`At most ${item.quantity} can be removed.`] },
      });
    }

    /* The reason the person chose, in both languages, with their note. */
    const label = (dictionary: typeof en) =>
      dictionary.inventory.adjustModal.reasons[input.reason];

    await inventoryApi.adjust(input.itemId, {
      branchId,
      newQuantity: item.quantity + input.quantity,
      reasonEn: note ? `${label(en)}: ${note}` : label(en),
      reasonAr: note ? `${label(ar)}: ${note}` : label(ar),
    });

    invalidate('inventory');

    /* The movement the server just wrote, rather than one assembled here. */
    const [movement] = await inventoryService.movementsFor(input.itemId, 1);

    if (!movement) {
      throw new HttpError({
        status: 500,
        code: 'adjust_failed',
        message: 'The adjustment was saved, but its movement could not be read back.',
      });
    }

    return movement;
  },

  async summary(): Promise<InventorySummary> {
    const branchId = activeBranchForStock();
    const levels = await inventoryApi.allLevels({ branchId });

    /* Written off: the cost value of every manual adjustment that reduced
       stock. Each item's history is read separately because there is no
       cross-item movement route; the route returns up to 500 per item, which
       covers far more than one period of corrections. */
    const histories = await inBatches(levels, 8, (row) =>
      inventoryApi.movements(row.itemId, { branchId, take: 500 }),
    );

    const shrinkageH = histories
      .flat()
      .map(toStockMovement)
      .filter((movement) => movement.kind === 'adjustment' && movement.quantity < 0)
      .reduce((sum, movement) => sum + Math.abs(movement.quantity) * movement.unitCostH, 0);

    return {
      totalValueH: levels.reduce((sum, row) => sum + row.stockValueH, 0),
      retailValueH: levels.reduce(
        (sum, row) => sum + Math.max(0, row.quantity) * row.priceH,
        0,
      ),
      trackedItems: levels.length,
      lowStock: levels.filter((row) => row.stockStatus === 'low').length,
      outOfStock: levels.filter((row) => row.stockStatus === 'out').length,
      shrinkageH: Math.round(shrinkageH),
    };
  },
};

/* ------------------------------------------------------------------ */
/* Purchases and vendors                                               */
/* ------------------------------------------------------------------ */

export interface ReceiveStockInput {
  vendorId: string;
  vendorInvoiceNumber: string;
  lines: PurchaseLine[];
  paidOnReceipt: boolean;
  note: string;
  receivedBy: string;
}

function toPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    reference: row.reference,
    vendorId: row.vendorId,
    vendorNameAr: row.vendorNameAr ?? '',
    vendorNameEn: row.vendorNameEn ?? '',
    branchId: row.branchId ?? null,
    vendorInvoiceNumber: row.vendorInvoiceNumber ?? '',
    lines: (row.lines ?? []).map((line) => ({
      itemId: line.itemId,
      nameAr: line.nameAr,
      nameEn: line.nameEn,
      quantity: Number(line.quantity),
      unitCostH: line.unitCostH,
    })),
    subtotalH: row.subtotalH,
    taxH: row.taxH,
    totalH: row.totalH,
    paidOnReceipt: row.paidOnReceipt,
    paidH: row.paidH ?? 0,
    outstandingH: row.outstandingH ?? 0,
    paymentStatus: row.paymentStatus,
    status: row.status,
    note: row.note ?? '',
    receivedBy: row.receivedBy ?? '',
    receivedAt: utc(row.receivedAt),
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

export const purchaseService = {
  /**
   * Receive a delivery: stock goes up, each item's cost is re-averaged, and
   * unless it was paid on the spot the total lands on the vendor's balance.
   */
  async receive(input: ReceiveStockInput): Promise<Purchase> {
    if (input.lines.length === 0) {
      throw validationFailed({ lines: ['Add at least one item to the delivery.'] });
    }

    const branchId = activeBranchForStock();

    if (!branchId) {
      throw validationFailed({
        branch: ['Select a branch first. Stock is held per branch, so a delivery needs one.'],
      });
    }

    /* One call. The procedure writes the purchase, its lines, the re-averaged
       cost, the stock level, the movement and the ledger entry in a single
       transaction — splitting it here would let a dropped connection leave
       stock raised for a delivery that was never recorded. */
    const received = await inventoryApi.receive({
      vendorId: input.vendorId,
      branchId,
      invoiceNumber: input.vendorInvoiceNumber || null,
      vatRate: 15,
      paidOnReceipt: input.paidOnReceipt,
      note: input.note.trim() || null,
      lines: input.lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitCostH: line.unitCostH,
      })),
    });

    /* Confirmed. Announce before returning, so the list the caller
       navigates to reloads rather than showing the pre-delivery stock. */
    invalidate('inventory', 'vendors');

    /* The purchase as the server stored it — totals, VAT and timestamps are
       its figures, not a recomputation of what was sent. */
    return toPurchase(await inventoryApi.purchase(received.purchaseId));
  },

  /**
   * Deliveries, newest first; every page, optionally for one vendor or only
   * those still owing (`unpaid` / `partial`).
   */
  async list(
    vendorId?: string,
    options: { paymentStatus?: 'paid' | 'partial' | 'unpaid' } = {},
  ): Promise<Purchase[]> {
    const all: PurchaseRow[] = [];
    const pageSize = 100;

    for (let page = 1; ; page += 1) {
      const result = await inventoryApi.purchases({
        vendorId,
        paymentStatus: options.paymentStatus,
        page,
        pageSize,
      });
      all.push(...result.items);
      if (result.items.length < pageSize || all.length >= result.totalCount) break;
    }

    return compareBy(all.map(toPurchase), 'receivedAt', 'desc');
  },

  /** Deliveries not yet fully paid, newest first. */
  async unsettled(vendorId?: string): Promise<Purchase[]> {
    const [unpaid, partial] = await Promise.all([
      purchaseService.list(vendorId, { paymentStatus: 'unpaid' }),
      purchaseService.list(vendorId, { paymentStatus: 'partial' }),
    ]);
    return compareBy(
      [...unpaid, ...partial].filter((purchase) => purchase.outstandingH > 0),
      'receivedAt',
      'desc',
    );
  },

  async get(id: string): Promise<Purchase> {
    return toPurchase(await inventoryApi.purchase(id));
  },
};

export interface VendorInput {
  nameAr: string;
  nameEn: string;
  contactPerson: string;
  phone: string;
  email: string;
  vatNumber: string;
  city: string;
  paymentTermDays?: number | null;
  status?: 'active' | 'inactive';
}

export type VendorWithBalance = Vendor & {
  balanceH: number;
  /** Lifetime purchases, paid on receipt included. */
  purchasedH: number;
  paidH: number;
  purchaseCount: number;
  paymentTermDays: number;
  lastPurchaseAt: string | null;
};

function toVendor(row: VendorRow): VendorWithBalance {
  return {
    id: row.vendorId,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    contactPerson: row.contactPerson ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    vatNumber: row.vatNumber ?? '',
    city: row.city ?? '',
    status: row.status ?? (row.isActive ? 'active' : 'inactive'),
    balanceH: row.balanceH ?? 0,
    purchasedH: row.purchasedH ?? 0,
    paidH: row.paidH ?? 0,
    purchaseCount: row.purchaseCount ?? 0,
    paymentTermDays: row.paymentTermDays ?? 0,
    lastPurchaseAt: row.lastPurchaseAt ? utc(row.lastPurchaseAt) : null,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

function toVendorPayload(input: VendorInput): SaveVendorPayload {
  return {
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn.trim(),
    contactPerson: input.contactPerson.trim() || null,
    phone: input.phone.trim(),
    email: input.email.trim() || null,
    vatNumber: input.vatNumber.trim() || null,
    city: input.city.trim() || null,
    paymentTermDays: input.paymentTermDays ?? null,
    status: input.status,
  };
}

function toVendorPayment(row: VendorPaymentRow): VendorPayment {
  return {
    id: row.id,
    reference: row.reference,
    vendorId: row.vendorId,
    amountH: row.amountH,
    method: row.method,
    note: row.note ?? '',
    paidBy: row.paidBy ?? '',
    paidAt: utc(row.paidAt),
    branchId: row.branchId ?? null,
    entryId: row.entryId ?? null,
    allocations: row.allocations ?? [],
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

function toLedgerEntry(row: VendorLedgerRow): VendorLedgerEntry {
  return {
    id: row.id,
    kind: row.kind,
    reference: row.reference,
    date: utc(row.date),
    amountH: row.amountH,
    balanceH: row.balanceH,
    method: row.method ?? null,
    vendorInvoiceNumber: row.vendorInvoiceNumber ?? null,
    note: row.note ?? null,
  };
}

export const vendorService = {
  /**
   * Vendors, each with what is owed on unpaid deliveries. Active only unless
   * `includeInactive` is set.
   */
  async list(options: { includeInactive?: boolean } = {}): Promise<VendorWithBalance[]> {
    const rows = await inventoryApi.vendors({ includeInactive: options.includeInactive });
    return compareBy(rows.map(toVendor), 'nameEn', 'asc');
  },

  async get(id: string): Promise<VendorWithBalance> {
    return toVendor(await inventoryApi.vendor(id));
  },

  /** The server validates names, phone, VAT number (15 digits) and email. */
  async create(input: VendorInput): Promise<VendorWithBalance> {
    const created = toVendor(await inventoryApi.createVendor(toVendorPayload(input)));
    invalidate('vendors');
    return created;
  },

  async update(id: string, input: VendorInput): Promise<VendorWithBalance> {
    const updated = toVendor(await inventoryApi.updateVendor(id, toVendorPayload(input)));
    invalidate('vendors');
    return updated;
  },

  /**
   * Take a vendor out of circulation, or put one back. The server refuses
   * while something depends on the vendor and says what; that arrives as
   * DeactivationBlocked with a message written for the person reading it.
   */
  async setStatus(id: string, status: 'active' | 'inactive'): Promise<VendorWithBalance> {
    await activationApi.set('vendor', id, status === 'active');
    invalidate('vendors');
    return vendorService.get(id);
  },

  /**
   * Pay a supplier, reducing what you owe them. The server settles the oldest
   * unpaid deliveries first (or only `purchaseId`) and posts the entry; it
   * refuses more than is owed with 422 overpayment.
   */
  async recordPayment(input: {
    vendorId: string;
    amountH: number;
    method: 'cash' | 'card' | 'bank';
    note: string;
    purchaseId?: string | null;
    branchId?: string | null;
  }): Promise<VendorPayment> {
    if (input.amountH <= 0) {
      throw validationFailed({ amountH: ['Enter an amount greater than zero.'] });
    }

    const payment = await inventoryApi.payVendor(input.vendorId, {
      amountH: input.amountH,
      method: input.method,
      note: input.note.trim() || null,
      purchaseId: input.purchaseId ?? null,
      branchId: input.branchId ?? activeBranchForStock() ?? null,
    });

    invalidate('vendors', 'ledger');
    return toVendorPayment(payment);
  },

  async payments(vendorId: string): Promise<VendorPayment[]> {
    return (await inventoryApi.vendorPayments(vendorId)).map(toVendorPayment);
  },

  /**
   * Purchases on credit and payments, oldest first, with the running balance.
   * Paid-on-receipt deliveries are left out, so the last balance is the
   * vendor's balance.
   */
  async ledger(vendorId: string): Promise<VendorLedgerEntry[]> {
    return (await inventoryApi.vendorLedger(vendorId)).map(toLedgerEntry);
  },

  /** Lifetime figures unless a period is given; `payableH` is always now. */
  async summary(period: { from?: string; to?: string } = {}): Promise<{
    payableH: number;
    activeVendors: number;
    withBalance: number;
    purchasedH: number;
    purchaseCount: number;
    paidH: number;
  }> {
    const row = await inventoryApi.vendorSummary(period);
    return {
      payableH: row.payableH,
      activeVendors: row.activeVendors,
      withBalance: row.withBalance,
      purchasedH: row.purchasedH,
      purchaseCount: row.purchaseCount,
      paidH: row.paidH,
    };
  },
};
