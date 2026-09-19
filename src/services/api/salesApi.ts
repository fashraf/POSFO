import { api } from '../apiClient';
import type { ApiPage } from './catalogApi';

/**
 * Sales, customers and finance.
 *
 * Committing a sale is one call on purpose. The server performs the sale, the
 * stock movement, the frozen commission and the ledger entry inside a single
 * transaction; splitting it across several calls here would reintroduce exactly
 * the partial-failure that the procedure exists to prevent.
 */

export interface CommitSalePayload {
  /** One key per attempt. A retry must reuse it. */
  idempotencyKey?: string;
  branchId: string;
  customerId?: string | null;
  servedByUserId?: string | null;
  discountId?: string | null;
  discountH: number;
  tenderedH?: number | null;
  lines: {
    itemId: string;
    quantity: number;
    unitPriceH: number;
    lineDiscountH: number;
    note?: string | null;
  }[];
  payments: { method: string; amountH: number; reference?: string | null }[];
}

export interface CommittedSale {
  saleId: string;
  invoiceNumber: string;
}

export const salesApi = {
  /** Dashboard figures, aggregated server-side. */
  analytics(query: { branchId?: string | null; days?: number } = {}) {
    return api.get<{
      current: { salesH: number; transactions: number; averageH: number; grossProfitH: number };
      previous: { salesH: number; transactions: number; averageH: number; grossProfitH: number };
      daily: { date: string; salesH: number }[];
      byMethod: { method: string; amountH: number }[];
      topItems: { itemId: string; nameAr: string; nameEn: string;
                  quantity: number; revenueH: number }[];
    }>('/api/sales/analytics', { query });
  },

  commit(payload: CommitSalePayload) {
    return api.post<CommittedSale>('/api/sales', payload);
  },

  list(query: {
    branchId?: string | null;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    return api.get<ApiPage<Record<string, unknown>>>('/api/sales', {
      query: { ...query, branchId: query.branchId ?? undefined },
    });
  },

  get(saleId: string) {
    return api.get<{
      sale: Record<string, unknown>;
      lines: Record<string, unknown>[];
      payments: Record<string, unknown>[];
    }>(`/api/sales/${saleId}`);
  },

  void(saleId: string, reason: string) {
    return api.post<void>(`/api/sales/${saleId}/void`, { reason });
  },
};

export const customerApi = {
  list(query: { search?: string; owingOnly?: boolean; page?: number; pageSize?: number } = {}) {
    return api.get<ApiPage<Record<string, unknown>>>('/api/customers', { query });
  },

  get(customerId: string) {
    return api.get<Record<string, unknown>>(`/api/customers/${customerId}`);
  },

  statement(customerId: string) {
    return api.get<Record<string, unknown>[]>(`/api/customers/${customerId}/statement`);
  },

  create(payload: {
    nameAr: string;
    nameEn: string;
    phone?: string | null;
    email?: string | null;
    vatNumber?: string | null;
    customerType: string;
    creditLimitH: number;
  }) {
    return api.post<{ customerId: string }>('/api/customers', payload);
  },

  collect(
    customerId: string,
    payload: {
      amountH: number;
      method: string;
      reference?: string | null;
      branchId?: string | null;
    },
  ) {
    return api.post<{ entryId: string }>(`/api/customers/${customerId}/collect`, payload);
  },

  receivables() {
    return api.get<Record<string, unknown>[]>('/api/customers/receivables');
  },
};

export interface FinanceSummary {
  revenueH: number;
  cogsH: number;
  expensesH: number;
  cashH: number;
  receivableH: number;
  payableH: number;
  prepaidH: number;
  cardClearingH: number;
}

export const financeApi = {
  ledger(query: {
    branchId?: string | null;
    accountCode?: string | null;
    kind?: string | null;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    return api.get<ApiPage<Record<string, unknown>>>('/api/finance/ledger', {
      query: {
        ...query,
        branchId: query.branchId ?? undefined,
        accountCode: query.accountCode ?? undefined,
        kind: query.kind ?? undefined,
      },
    });
  },

  accounts() {
    return api.get<Record<string, unknown>[]>('/api/finance/accounts');
  },

  summary(query: { branchId?: string | null; month?: string } = {}) {
    return api.get<FinanceSummary>('/api/finance/summary', {
      query: { branchId: query.branchId ?? undefined, month: query.month },
    });
  },

  commission(query: { userId?: string; month?: string } = {}) {
    return api.get<Record<string, unknown>[]>('/api/finance/commission', { query });
  },
};

export const referenceApi = {
  branches() {
    return api.get<
      { branchId: string; code: string; nameAr: string; nameEn: string; isActive: boolean }[]
    >('/api/branches');
  },

  branchSettings(branchId: string) {
    return api.get<Record<string, unknown>>(`/api/branches/${branchId}/settings`);
  },

  languages() {
    return api.get<{ code: string; nameNative: string; nameEn: string; isRtl: boolean }[]>(
      '/api/languages',
    );
  },
};
