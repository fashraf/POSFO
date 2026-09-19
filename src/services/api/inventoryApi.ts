import { api } from '../apiClient';
import type { ApiPage } from './catalogApi';

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

  vendors() {
    return api.get<Record<string, unknown>[]>('/api/inventory/vendors');
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
    return api.get<Record<string, unknown>[]>('/api/discounts');
  },

  /** Only what could apply to this basket, right now. */
  applicable(subtotalH: number) {
    return api.get<Record<string, unknown>[]>('/api/discounts/applicable', {
      query: { subtotalH },
    });
  },
};

export const userApi = {
  list(query: { search?: string; activeOnly?: boolean } = {}) {
    return api.get<Record<string, unknown>[]>('/api/users', { query });
  },

  roles() {
    return api.get<{
      roles: Record<string, unknown>[];
      permissions: { roleId: string; permissionKey: string }[];
    }>('/api/users/roles');
  },

  permissions() {
    return api.get<
      { permissionKey: string; module: string; action: string; sensitivity: string }[]
    >('/api/users/permissions');
  },
};
