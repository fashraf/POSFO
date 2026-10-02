import { api } from '../apiClient';
import type { ApiPage } from './catalogApi';
import type { ApiBranch } from './accessApi';
import type { ApiBranchSettings } from './settingsApi';

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
  /** Who approved a discount above its threshold (the cashier may name themself). */
  approvedByUserId?: string | null;
  /** Needed only when the approver is someone other than the caller. */
  approverPassword?: string | null;
  orderType?: 'dine_in' | 'takeaway' | 'delivery' | 'other' | null;
  lines: {
    itemId: string;
    quantity: number;
    unitPriceH: number;
    lineDiscountH: number;
    note?: string | null;
  }[];
  payments: { method: string; amountH: number; reference?: string | null }[];
}

export interface CreditNoteRow {
  id: string;
  noteNumber: string;
  saleId: string;
  saleInvoiceNumber: string;
  lines: {
    saleLineId: string;
    itemId: string;
    nameAr: string;
    nameEn: string;
    quantity: number;
    unitPriceH: number;
    amountH: number;
  }[];
  reason: string;
  note: string;
  subtotalH: number;
  taxH: number;
  totalH: number;
  cogsH: number;
  refundMethod: string;
  issuedBy: string;
  issuedAt: string;
  branchId?: string;
  customerId?: string;
  entryId?: string;
  createdAt: string;
  updatedAt: string;
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

  /** 409 sale_has_returns once a credit note exists against the sale. */
  void(saleId: string, reason: string) {
    return api.post<void>(`/api/sales/${saleId}/void`, { reason });
  },

  /** Credit notes against a sale, newest first. */
  returns(saleId: string) {
    return api.get<CreditNoteRow[]>(`/api/sales/${saleId}/returns`);
  },

  /** {saleLineId: quantity still returnable}. */
  returnsRemaining(saleId: string) {
    return api.get<Record<string, number>>(`/api/sales/${saleId}/returns/remaining`);
  },

  issueReturn(
    saleId: string,
    payload: {
      lines: { saleLineId: string; quantity: number }[];
      reason: string;
      note?: string | null;
      refundMethod: string;
    },
  ) {
    return api.post<CreditNoteRow>(`/api/sales/${saleId}/returns`, payload);
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

  /** Returns the stored customer row, same shape as GET /api/customers/{id}. */
  update(
    customerId: string,
    payload: {
      nameAr: string;
      nameEn: string;
      phone?: string | null;
      email?: string | null;
      vatNumber?: string | null;
      customerType?: string | null;
      creditLimitH: number;
      status?: 'active' | 'inactive';
    },
  ) {
    return api.put<Record<string, unknown>>(`/api/customers/${customerId}`, payload);
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

  /** Rows carry balanceH, creditLimitH and lifetime collectedH. */
  receivables() {
    return api.get<Record<string, unknown>[]>('/api/customers/receivables');
  },

  receivablesSummary(query: { from?: string; to?: string } = {}) {
    return api.get<{
      outstandingH: number;
      withBalance: number;
      overLimit: number;
      collectedH: number;
      collectionCount: number;
    }>('/api/customers/receivables/summary', { query });
  },
};

/** One scope's ledger figures for a month (P&L lines) and balances. */
export interface FinanceFigures {
  /** Net of returns. */
  revenueH: number;
  /** What returns took off revenue this month. */
  returnsH: number;
  cogsH: number;
  expensesH: number;
  /** Operating expenses split by account (5200/6000/6100/6200/6300). */
  expensesByAccount: {
    accountCode: string;
    nameAr: string;
    nameEn: string;
    name: string;
    amountH: number;
  }[];
  cashH: number;
  receivableH: number;
  payableH: number;
  prepaidH: number;
  cardClearingH: number;
}

export interface FinanceSummary extends FinanceFigures {
  /** How the month's sales were tendered; cash is net of change. */
  paymentMix: {
    cashH: number;
    cardH: number;
    creditH: number;
    bankH: number;
    totalH: number;
    saleCount: number;
  };
  refunds: {
    cashH: number;
    cardH: number;
    creditH: number;
    bankH: number;
    totalH: number;
    noteCount: number;
  };
  /**
   * With a branch: the entries tagged to no branch (business-wide costs),
   * kept apart from the branch's own figures. Null without a branch.
   */
  businessWide: FinanceFigures | null;
}

export interface ApiCommissionEntry {
  id: string;
  saleId: string;
  invoiceNumber: string;
  userId: string;
  userNameAr: string;
  userNameEn: string;
  itemId: string;
  itemNameAr: string;
  itemNameEn: string;
  lineGrossH: number;
  amountH: number;
  basis: 'percentage' | 'fixed';
  rateAtSale: number;
  branchId?: string;
  earnedAt: string;
  periodMonth: string;
  payrollRunId?: string;
  paid: boolean;
  saleStatus: string;
}

export interface ApiJournalEntry {
  entryId: string;
  reference: string;
  kind: string;
  sourceReference?: string;
  descriptionAr?: string;
  descriptionEn: string;
  postedAtUtc: string;
  branchId?: string;
  actor: string;
  totalDebitH: number;
  totalCreditH: number;
  reversesEntryId?: string;
  reversedByEntryId?: string;
  reversalReason?: string;
  lines: {
    journalLineId: number;
    accountCode: string;
    accountNameAr: string;
    accountNameEn: string;
    accountName: string;
    accountType: string;
    debitH: number;
    creditH: number;
    memo: string;
  }[];
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
    return api.get<Partial<FinanceSummary>>('/api/finance/summary', {
      query: { branchId: query.branchId ?? undefined, month: query.month },
    });
  },

  commission(query: { userId?: string; month?: string } = {}) {
    return api.get<Record<string, unknown>[]>('/api/finance/commission', { query });
  },

  /** The individual frozen commission lines behind the totals. */
  commissionEntries(query: {
    userId?: string;
    month?: string;
    saleId?: string;
    branchId?: string | null;
    paid?: boolean;
  } = {}) {
    return api.get<ApiCommissionEntry[]>('/api/finance/commission/entries', {
      query: { ...query, branchId: query.branchId ?? undefined },
    });
  },

  /** A journal entry with its lines. */
  entry(entryId: string) {
    return api.get<ApiJournalEntry>(`/api/finance/ledger/${entryId}`);
  },
};

export const referenceApi = {
  branches() {
    return api.get<ApiBranch[]>('/api/branches');
  },

  branchSettings(branchId: string) {
    return api.get<ApiBranchSettings>(`/api/branches/${branchId}/settings`);
  },

  languages() {
    return api.get<{ code: string; nameNative: string; nameEn: string; isRtl: boolean }[]>(
      '/api/languages',
    );
  },
};
