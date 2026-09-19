import { USE_MOCKS } from '@/config/env';
import { inventoryApi } from './api';
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
import {
  buildVendorLedger,
  computePurchaseTotals,
  weightedAverageCostH,
} from '@/types/inventory';
import { VAT_RATE } from '@/types/sales';
import { isProduct, stockLevelOf } from '@/types/catalog';
import type { Product, Vendor } from '@/types/catalog';
import { HttpError } from './http';
import { catalogService } from './catalogService';
import { credit, debit, ledgerService } from './ledgerService';
import { SEED_VENDORS } from './mock/seed';
import { compareBy, delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

/**
 * Inventory and supply.
 *
 * Stock changes in exactly one place — `record` — so every movement lands in
 * the ledger. Sales, returns, purchases, and manual corrections all route
 * through it, which is why an item's history is complete rather than
 * whatever happened to get logged.
 */

let movements: StockMovement[] = [];
let purchases: Purchase[] = [];
let vendorPayments: VendorPayment[] = [];
let vendors: Vendor[] = [...SEED_VENDORS];
let vendorBalances: Record<string, number> = {};
let purchaseSequence = 117;
let vendorPaymentSequence = 80;

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

export const inventoryService = {
  /** The single write path for stock. Returns the movement it appended. */
  async record(input: RecordMovementInput): Promise<StockMovement | null> {
    const item = await catalogService.get(input.itemId);
    if (!isProduct(item) || !item.trackInventory) return null;

    const updated = (await catalogService.adjustStock(input.itemId, input.quantity)) as Product;
    const now = timestamp();

    const movement: StockMovement = {
      id: nextId('mov'),
      itemId: input.itemId,
      kind: input.kind,
      quantity: input.quantity,
      balanceAfter: updated.stockQuantity,
      reference: input.reference,
      note: input.note ?? '',
      unitCostH: input.unitCostH ?? item.costH,
      actor: input.actor ?? 'System',
      branchId: input.branchId ?? null,
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
    };

    movements = [movement, ...movements];
    return movement;
  },

  /** Movement history for one item, newest first. */
  async movementsFor(itemId: string, limit = 50): Promise<StockMovement[]> {
    if (!USE_MOCKS) {
      const rows = await inventoryApi.movements(itemId, { take: limit });
      return rows.map(toStockMovement);
    }

    await delay(180);
    return movements.filter((movement) => movement.itemId === itemId).slice(0, limit);
  },

  async recentMovements(limit = 20): Promise<StockMovement[]> {
    if (!USE_MOCKS) {
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
    }

    await delay(160);
    return movements.slice(0, limit);
  },

  /**
   * A manual correction. The reason is mandatory because "the number was
   * wrong" is not an audit trail, and reducing reasons cannot be used to add
   * stock — a shortage that increases your count is a different event.
   */
  async adjust(input: {
    itemId: string;
    quantity: number;
    reason: AdjustmentReason;
    note: string;
    actor: string;
  }): Promise<StockMovement> {
    await delay(340);

    if (input.quantity === 0) {
      throw validationFailed({ quantity: ['Enter a quantity above or below zero.'] });
    }

    if (input.reason === 'other' && !input.note.trim()) {
      throw validationFailed({
        note: ['Describe what happened when the reason is "Other".'],
      });
    }

    const item = await catalogService.get(input.itemId);
    if (!isProduct(item) || !item.trackInventory) {
      throw new HttpError({
        status: 409,
        code: 'not_tracked',
        message: 'This item does not track stock, so there is nothing to adjust.',
      });
    }

    if (item.stockQuantity + input.quantity < 0) {
      throw new HttpError({
        status: 422,
        code: 'negative_stock',
        message: `You cannot remove more than the ${item.stockQuantity} on hand.`,
        fieldErrors: { quantity: [`At most ${item.stockQuantity} can be removed.`] },
      });
    }

    const movement = await inventoryService.record({
      itemId: input.itemId,
      kind: 'adjustment',
      quantity: input.quantity,
      reference: input.reason,
      note: input.note,
      actor: input.actor,
    });

    if (!movement) {
      throw new HttpError({ status: 500, code: 'adjust_failed', message: 'Adjustment failed.' });
    }

    return movement;
  },

  async summary(): Promise<InventorySummary> {
    await delay(180);

    const page = await catalogService.list({ pageSize: 1000 });
    const tracked = page.items.filter(isProduct).filter((item) => item.trackInventory);

    const shrinkageH = movements
      .filter((movement) => movement.kind === 'adjustment' && movement.quantity < 0)
      .reduce((sum, movement) => sum + Math.abs(movement.quantity) * movement.unitCostH, 0);

    return {
      totalValueH: tracked.reduce((sum, item) => sum + item.stockQuantity * item.costH, 0),
      retailValueH: tracked.reduce((sum, item) => sum + item.stockQuantity * item.priceH, 0),
      trackedItems: tracked.length,
      lowStock: tracked.filter((item) => stockLevelOf(item) === 'low_stock').length,
      outOfStock: tracked.filter((item) => stockLevelOf(item) === 'out_of_stock').length,
      shrinkageH,
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

export const purchaseService = {
  /**
   * Receive a delivery: stock goes up, each item's cost is re-averaged, and
   * unless it was paid on the spot the total lands on the vendor's balance.
   */
  async receive(input: ReceiveStockInput): Promise<Purchase> {
    if (!USE_MOCKS) {
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
        lines: input.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitCostH: line.unitCostH,
        })),
      });

      const totals = computePurchaseTotals(input.lines, VAT_RATE);

      /* Confirmed. Announce before returning, so the list the caller
         navigates to reloads rather than showing the pre-delivery stock. */
      invalidate('inventory', 'vendors');

      return {
        id: received.purchaseId,
        reference: received.reference,
        vendorId: input.vendorId,
        vendorInvoiceNumber: input.vendorInvoiceNumber,
        lines: input.lines,
        subtotalH: totals.subtotalH,
        taxH: totals.taxH,
        totalH: totals.totalH,
        paidOnReceipt: input.paidOnReceipt,
        status: 'received',
        note: input.note,
        receivedBy: input.receivedBy,
        receivedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Purchase;
    }

    await delay(460);

    if (input.lines.length === 0) {
      throw validationFailed({ lines: ['Add at least one item to the delivery.'] });
    }

    const vendor = vendors.find((candidate) => candidate.id === input.vendorId);
    if (!vendor) throw notFound('Vendor', input.vendorId);

    const invalid = input.lines.find((line) => line.quantity <= 0 || line.unitCostH < 0);
    if (invalid) {
      throw validationFailed({
        lines: ['Every line needs a quantity above zero and a cost of zero or more.'],
      });
    }

    const totals = computePurchaseTotals(input.lines, VAT_RATE);
    const now = timestamp();
    purchaseSequence += 1;

    const purchase: Purchase = {
      id: nextId('pur'),
      reference: `GRN-${purchaseSequence}`,
      vendorId: input.vendorId,
      vendorInvoiceNumber: input.vendorInvoiceNumber.trim(),
      lines: input.lines,
      subtotalH: totals.subtotalH,
      taxH: totals.taxH,
      totalH: totals.totalH,
      paidOnReceipt: input.paidOnReceipt,
      status: 'received',
      note: input.note.trim(),
      receivedBy: input.receivedBy,
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    purchases = [purchase, ...purchases];

    for (const line of input.lines) {
      const item = await catalogService.get(line.itemId);

      if (isProduct(item) && item.trackInventory) {
        /* Re-average before the movement, so the movement records the new cost. */
        const newCostH = weightedAverageCostH(
          item.stockQuantity,
          item.costH,
          line.quantity,
          line.unitCostH,
        );
        await catalogService.setCost(line.itemId, newCostH);

        await inventoryService.record({
          itemId: line.itemId,
          kind: 'purchase',
          quantity: line.quantity,
          reference: purchase.reference,
          unitCostH: line.unitCostH,
          actor: input.receivedBy,
        });
      }
    }

    if (!input.paidOnReceipt) {
      vendorBalances[input.vendorId] = (vendorBalances[input.vendorId] ?? 0) + totals.totalH;
    }

    /* Stock arriving is an asset swap, not a cost — it becomes a cost when it
       is sold, via COGS. */
    await ledgerService.post({
      kind: 'purchase',
      sourceReference: purchase.reference,
      description: `Delivery from ${vendor.nameEn}`,
      actor: input.receivedBy,
      lines: [
        debit('1200', totals.subtotalH, 'Inventory'),
        debit('1300', totals.taxH, 'Input VAT'),
        credit(input.paidOnReceipt ? '1000' : '2000', totals.totalH, vendor.nameEn),
      ],
    });

    return purchase;
  },

  async list(vendorId?: string): Promise<Purchase[]> {
    await delay(180);
    const filtered = vendorId
      ? purchases.filter((purchase) => purchase.vendorId === vendorId)
      : purchases;
    return compareBy(filtered, 'receivedAt', 'desc');
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
}

export const vendorService = {
  async list(): Promise<(Vendor & { balanceH: number })[]> {
    await delay(160);
    return compareBy(vendors, 'nameEn', 'asc').map((vendor) => ({
      ...vendor,
      balanceH: vendorBalances[vendor.id] ?? 0,
    }));
  },

  async get(id: string): Promise<Vendor & { balanceH: number }> {
    await delay(120);
    const vendor = vendors.find((candidate) => candidate.id === id);
    if (!vendor) throw notFound('Vendor', id);
    return { ...vendor, balanceH: vendorBalances[id] ?? 0 };
  },

  async create(input: VendorInput): Promise<Vendor> {
    await delay(340);

    const errors: Record<string, string[]> = {};
    if (!input.nameAr.trim()) errors.nameAr = ['Arabic name is required.'];
    if (!input.nameEn.trim()) errors.nameEn = ['English name is required.'];
    if (!input.phone.trim()) {
      errors.phone = ['A phone number is required so you can chase a delivery.'];
    }

    const vat = input.vatNumber.trim();
    if (vat && !/^\d{15}$/.test(vat)) {
      errors.vatNumber = ['A Saudi VAT number is exactly 15 digits, or leave it empty.'];
    }
    if (vat && vendors.some((vendor) => vendor.vatNumber === vat)) {
      errors.vatNumber = ['Another vendor already uses this VAT number.'];
    }

    if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      errors.email = ['Enter a valid email address, or leave it empty.'];
    }

    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    const now = timestamp();
    const created: Vendor = {
      id: nextId('ven'),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      contactPerson: input.contactPerson.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      vatNumber: vat,
      city: input.city.trim(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    vendors = [created, ...vendors];
    return created;
  },

  async setStatus(id: string, status: 'active' | 'inactive'): Promise<Vendor> {
    await delay(260);

    const existing = vendors.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Vendor', id);

    if (status === 'inactive' && (vendorBalances[id] ?? 0) > 0) {
      throw new HttpError({
        status: 409,
        code: 'outstanding_balance',
        message: 'You still owe this vendor. Settle the balance before deactivating them.',
      });
    }

    const updated: Vendor = { ...existing, status, updatedAt: timestamp() };
    vendors = vendors.map((vendor) => (vendor.id === id ? updated : vendor));
    return updated;
  },

  /** Pay a supplier, reducing what you owe them. */
  async recordPayment(input: {
    vendorId: string;
    amountH: number;
    method: 'cash' | 'card' | 'bank';
    note: string;
    paidBy: string;
  }): Promise<VendorPayment> {
    await delay(360);

    const owed = vendorBalances[input.vendorId] ?? 0;

    if (input.amountH <= 0) {
      throw validationFailed({ amountH: ['Enter an amount greater than zero.'] });
    }
    if (input.amountH > owed) {
      throw new HttpError({
        status: 422,
        code: 'overpayment',
        message: 'That is more than you owe this vendor. Reduce the amount.',
        fieldErrors: { amountH: ['Cannot exceed the outstanding balance.'] },
      });
    }

    const now = timestamp();
    vendorPaymentSequence += 1;

    const payment: VendorPayment = {
      id: nextId('vpy'),
      reference: `VP-${vendorPaymentSequence}`,
      vendorId: input.vendorId,
      amountH: input.amountH,
      method: input.method,
      note: input.note.trim(),
      paidBy: input.paidBy,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };

    vendorPayments = [payment, ...vendorPayments];

    await ledgerService.post({
      kind: 'supplier_payment',
      sourceReference: payment.reference,
      description: 'Vendor payment',
      actor: input.paidBy,
      lines: [
        debit('2000', input.amountH, 'Accounts payable'),
        credit(input.method === 'cash' ? '1000' : '1100', input.amountH, input.method),
      ],
    });
    vendorBalances = {
      ...vendorBalances,
      [input.vendorId]: owed - input.amountH,
    };

    return payment;
  },

  /** Purchases and payments in date order, with a running balance. */
  async ledger(vendorId: string): Promise<VendorLedgerEntry[]> {
    await delay(200);

    const purchaseEntries = purchases
      .filter((purchase) => purchase.vendorId === vendorId && !purchase.paidOnReceipt)
      .map((purchase) => ({
        id: purchase.id,
        kind: 'purchase' as const,
        reference: purchase.reference,
        date: purchase.receivedAt,
        amountH: purchase.totalH,
      }));

    const paymentEntries = vendorPayments
      .filter((payment) => payment.vendorId === vendorId)
      .map((payment) => ({
        id: payment.id,
        kind: 'payment' as const,
        reference: payment.reference,
        date: payment.paidAt,
        amountH: -payment.amountH,
      }));

    return buildVendorLedger([...purchaseEntries, ...paymentEntries]);
  },

  async summary(): Promise<{
    payableH: number;
    activeVendors: number;
    withBalance: number;
    purchasedH: number;
  }> {
    await delay(140);

    return {
      payableH: Object.values(vendorBalances).reduce((sum, value) => sum + Math.max(0, value), 0),
      activeVendors: vendors.filter((vendor) => vendor.status === 'active').length,
      withBalance: Object.values(vendorBalances).filter((value) => value > 0).length,
      purchasedH: purchases.reduce((sum, purchase) => sum + purchase.totalH, 0),
    };
  },
};
