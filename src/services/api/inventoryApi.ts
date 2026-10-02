import { api } from '../apiClient';
import { MAX_PAGE_SIZE, type ApiPage } from './catalogApi';
import type { ApiRole, ApiUser } from './accessApi';
import type { ApiDiscount } from './settingsApi';

/** Inventory, expenses, kitchen, discounts and staff. */

export interface StockLevelRow {
  itemId: string;
  nameAr: string;
  nameEn: string;
  sku: string | null;
  categoryId: string | null;
  costH: number;
  priceH: number;
  reorderLevel: number;
  quantity: number;
  stockValueH: number;
  stockStatus: 'ok' | 'low' | 'out';
}

export interface VendorRow {
  vendorId: string;
  nameAr: string;
  nameEn: string;
  name?: string;
  contactPerson: string;
  phone: string;
  email: string;
  vatNumber: string;
  city?: string;
  paymentTermDays: number;
  isActive: boolean;
  status?: 'active' | 'inactive';
  /** Unsettled part of purchases not paid on receipt, net of payments. */
  balanceH: number;
  /** Every purchase, paid on receipt or not, lifetime. */
  purchasedH?: number;
  paidH?: number;
  purchaseCount?: number;
  lastPurchaseAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveVendorPayload {
  nameAr: string;
  nameEn: string;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  vatNumber?: string | null;
  city?: string | null;
  paymentTermDays?: number | null;
  status?: 'active' | 'inactive';
}

export interface VendorSummaryRow {
  payableH: number;
  activeVendors: number;
  withBalance: number;
  purchasedH: number;
  purchaseCount: number;
  paidH: number;
}

export interface VendorPaymentRow {
  id: string;
  reference: string;
  vendorId: string;
  amountH: number;
  method: 'cash' | 'card' | 'bank';
  note: string;
  paidBy: string;
  paidAt: string;
  branchId?: string;
  entryId?: string;
  allocations: { purchaseId: string; reference: string; amountH: number }[];
  createdAt: string;
  updatedAt: string;
}

export interface VendorLedgerRow {
  id: string;
  kind: 'purchase' | 'payment';
  reference: string;
  date: string;
  amountH: number;
  balanceH: number;
  purchaseId?: string;
  paymentId?: string;
  method?: string;
  vendorInvoiceNumber?: string;
  note?: string;
}

export interface PurchaseRow {
  id: string;
  reference: string;
  vendorId: string;
  vendorNameAr: string;
  vendorNameEn: string;
  branchId?: string;
  vendorInvoiceNumber: string;
  lines: {
    itemId: string;
    nameAr: string;
    nameEn: string;
    quantity: number;
    unitCostH: number;
    lineTotalH: number;
  }[];
  subtotalH: number;
  taxH: number;
  totalH: number;
  paidOnReceipt: boolean;
  paidH: number;
  outstandingH: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  status: 'received' | 'cancelled';
  note: string;
  receivedBy: string;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  payments?: { paymentId: string; reference: string; method: string; amountH: number; paidAt: string }[];
}

export const inventoryApi = {
  levels(query: {
    branchId?: string | null;
    search?: string;
    lowOnly?: boolean;
    page?: number;
    pageSize?: number;
  } = {}) {
    return api.get<ApiPage<StockLevelRow>>('/api/inventory/levels', {
      query: { ...query, branchId: query.branchId ?? undefined },
    });
  },

  /** Every tracked item's level at a branch, across pages. */
  async allLevels(query: { branchId?: string | null; lowOnly?: boolean } = {}) {
    const all: StockLevelRow[] = [];

    for (let page = 1; ; page += 1) {
      const result = await inventoryApi.levels({ ...query, page, pageSize: MAX_PAGE_SIZE });
      all.push(...result.items);
      if (result.items.length < MAX_PAGE_SIZE || all.length >= result.totalCount) break;
    }

    return all;
  },

  movements(itemId: string, query: { branchId?: string | null; take?: number } = {}) {
    return api.get<Record<string, unknown>[]>(`/api/inventory/movements/${itemId}`, {
      query: { branchId: query.branchId ?? undefined, take: query.take ?? 100 },
    });
  },

  receive(payload: {
    vendorId: string;
    branchId: string;
    invoiceNumber?: string | null;
    vatRate: number;
    paidOnReceipt: boolean;
    note?: string | null;
    lines: { itemId: string; quantity: number; unitCostH: number }[];
  }) {
    return api.post<{ purchaseId: string; reference: string }>(
      '/api/inventory/purchases',
      payload,
    );
  },

  adjust(
    itemId: string,
    payload: { branchId: string; newQuantity: number; reasonEn: string; reasonAr?: string | null },
  ) {
    return api.post<void>(`/api/inventory/items/${itemId}/adjust`, payload);
  },

  /** Active vendors by default, each with what is owed on unpaid deliveries. */
  vendors(query: { includeInactive?: boolean } = {}) {
    return api.get<VendorRow[]>('/api/inventory/vendors', { query });
  },

  vendor(vendorId: string) {
    return api.get<VendorRow>(`/api/inventory/vendors/${vendorId}`);
  },

  /** Period figures when from/to are given; lifetime otherwise. */
  vendorSummary(query: { from?: string; to?: string } = {}) {
    return api.get<VendorSummaryRow>('/api/inventory/vendors/summary', { query });
  },

  createVendor(payload: SaveVendorPayload) {
    return api.post<VendorRow>('/api/inventory/vendors', payload);
  },

  updateVendor(vendorId: string, payload: SaveVendorPayload) {
    return api.put<VendorRow>(`/api/inventory/vendors/${vendorId}`, payload);
  },

  payVendor(
    vendorId: string,
    payload: {
      amountH: number;
      method: 'cash' | 'card' | 'bank';
      note?: string | null;
      purchaseId?: string | null;
      branchId?: string | null;
    },
  ) {
    return api.post<VendorPaymentRow>(`/api/inventory/vendors/${vendorId}/payments`, payload);
  },

  vendorPayments(vendorId: string) {
    return api.get<VendorPaymentRow[]>(`/api/inventory/vendors/${vendorId}/payments`);
  },

  /** Oldest first, with the running balance the server computed. */
  vendorLedger(vendorId: string) {
    return api.get<VendorLedgerRow[]>(`/api/inventory/vendors/${vendorId}/ledger`);
  },

  purchases(query: {
    vendorId?: string;
    branchId?: string | null;
    from?: string;
    to?: string;
    paymentStatus?: 'paid' | 'partial' | 'unpaid';
    page?: number;
    pageSize?: number;
  } = {}) {
    return api.get<ApiPage<PurchaseRow>>('/api/inventory/purchases', {
      query: { ...query, branchId: query.branchId ?? undefined },
    });
  },

  purchase(purchaseId: string) {
    return api.get<PurchaseRow>(`/api/inventory/purchases/${purchaseId}`);
  },
};

export const expenseApi = {
  list(query: {
    branchId?: string | null;
    categoryId?: string | null;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    return api.get<ApiPage<Record<string, unknown>>>('/api/expenses', {
      query: {
        ...query,
        branchId: query.branchId ?? undefined,
        categoryId: query.categoryId ?? undefined,
      },
    });
  },

  record(payload: {
    categoryId: string;
    branchId?: string | null;
    descriptionEn: string;
    descriptionAr?: string | null;
    amountH: number;
    vatH: number;
    paymentMethod: string;
    paidOn: string;
    recognition: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    externalRef?: string | null;
    attachmentName?: string | null;
  }) {
    return api.post<{ expenseId: string }>('/api/expenses', payload);
  },

  categories() {
    return api.get<{ categoryId: string; nameAr: string; nameEn: string }[]>(
      '/api/expenses/categories',
    );
  },

  recurring(query: { branchId?: string | null } = {}) {
    return api.get<Record<string, unknown>[]>('/api/expenses/recurring', {
      query: { branchId: query.branchId ?? undefined },
    });
  },
};

export const kitchenApi = {
  orders(query: { branchId?: string | null; includeCompleted?: boolean } = {}) {
    return api.get<{
      orders: Record<string, unknown>[];
      items: Record<string, unknown>[];
    }>('/api/kitchen/orders', {
      query: { branchId: query.branchId ?? undefined, includeCompleted: query.includeCompleted },
    });
  },

  setStatus(preparationId: string, status: string) {
    return api.post<void>(`/api/kitchen/orders/${preparationId}/status`, { status });
  },

  setItemProgress(preparationId: string, itemId: number, completedQuantity: number) {
    return api.post<void>(`/api/kitchen/orders/${preparationId}/items/${itemId}`, {
      completedQuantity,
    });
  },
};

export const discountApi = {
  list() {
    return api.get<ApiDiscount[]>('/api/discounts');
  },

  /**
   * Only what could apply to this basket, right now: DiscountDto rows the
   * server filtered by status, dates, weekday, minimum order, branch (when
   * given) and the caller's role. 403 for a branch the caller cannot see.
   */
  applicable(subtotalH: number, branchId?: string | null) {
    return api.get<ApiDiscount[]>('/api/discounts/applicable', {
      query: { subtotalH, branchId: branchId ?? undefined },
    });
  },
};

export const userApi = {
  list(query: { search?: string; activeOnly?: boolean } = {}) {
    return api.get<ApiUser[]>('/api/users', { query });
  },

  /** Active people at a branch (or any of the caller's), for the till. */
  staff(branchId?: string | null) {
    return api.get<
      {
        id: string;
        nameAr: string;
        nameEn: string;
        name: string;
        roleId: string;
        roleNameAr: string;
        roleNameEn: string;
      }[]
    >('/api/users/staff', { query: { branchId: branchId ?? undefined } });
  },

  roles() {
    return api.get<{
      roles: ApiRole[];
      permissions: { roleId: string; permissionKey: string }[];
    }>('/api/users/roles');
  },

  permissions() {
    return api.get<
      { permissionKey: string; module: string; action: string; sensitivity: string }[]
    >('/api/users/permissions');
  },
};
