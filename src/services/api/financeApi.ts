import { api } from '../apiClient';

/** Cash drawer, settlements, balance periods, payroll and notifications. */

export interface DrawerExpectation {
  openingCashH: number;
  cashSalesH: number;
  cashCollectionsH: number;
  ownerContributionsH: number;
  cashExpensesH: number;
  ownerWithdrawalsH: number;
  cashRefundsH: number;
  expectedH: number;
}

export interface DayTakings {
  cashH: number;
  cardH: number;
  creditH: number;
  totalH: number;
}

export const drawerApi = {
  /** Null when the drawer is closed — a normal state, not an error. */
  current(branchId?: string | null) {
    return api.get<Record<string, unknown> | null>('/api/finance/drawer/current', {
      query: { branchId: branchId ?? undefined },
    });
  },

  expectation(sessionId: string) {
    return api.get<DrawerExpectation>(`/api/finance/drawer/${sessionId}/expectation`);
  },

  /** The shift's takings by method. Card and credit never touch the drawer. */
  takings(sessionId: string) {
    return api.get<DayTakings>(`/api/finance/drawer/${sessionId}/takings`);
  },

  history(branchId?: string | null, take = 20) {
    return api.get<Record<string, unknown>[]>('/api/finance/drawer/history', {
      query: { branchId: branchId ?? undefined, take },
    });
  },

  open(branchId: string, openingCashH: number) {
    return api.post<{ sessionId: string }>('/api/finance/drawer/open', {
      branchId,
      openingCashH,
    });
  },

  close(sessionId: string, countedCashH: number, note?: string | null) {
    return api.post<{ varianceH: number }>(`/api/finance/drawer/${sessionId}/close`, {
      countedCashH,
      note,
    });
  },
};

export const settlementApi = {
  list(branchId?: string | null) {
    return api.get<Record<string, unknown>[]>('/api/finance/settlements', {
      query: { branchId: branchId ?? undefined },
    });
  },

  outstanding() {
    return api.get<{ outstandingH: number }>('/api/finance/settlements/outstanding');
  },

  record(payload: {
    branchId?: string | null;
    cardSalesH: number;
    depositH: number;
    settledOn: string;
    note?: string | null;
  }) {
    return api.post<{ settlementId: string; reference: string }>(
      '/api/finance/settlements',
      payload,
    );
  },
};

export const periodApi = {
  list(branchId?: string | null) {
    return api.get<Record<string, unknown>[]>('/api/finance/periods', {
      query: { branchId: branchId ?? undefined },
    });
  },

  get(periodId: string) {
    return api.get<Record<string, unknown>>(`/api/finance/periods/${periodId}`);
  },

  /** What the ledger says the position should be, per method. */
  expectation(periodId: string) {
    return api.get<{
      cashH: number;
      cardH: number;
      creditH: number;
      bankH: number;
      inventoryH: number;
      payablesH: number;
    }>(`/api/finance/periods/${periodId}/expectation`);
  },

  open(payload: {
    branchId: string;
    label: string;
    openedOn: string;
    openingCashH: number;
    openingCardH: number;
    openingCreditH: number;
    openingBankH: number;
    openingInventoryH: number;
    openingPayablesH: number;
    note?: string | null;
  }) {
    return api.post<{ periodId: string }>('/api/finance/periods', payload);
  },

  close(
    periodId: string,
    payload: {
      closedOn: string;
      closingCashH: number;
      closingCardH: number;
      closingCreditH: number;
      closingBankH: number;
      closingInventoryH: number;
      closingPayablesH: number;
      note?: string | null;
    },
  ) {
    return api.post<{ varianceH: number }>(`/api/finance/periods/${periodId}/close`, payload);
  },
};

export interface ApiOpeningBalance {
  openingId: string;
  branchId?: string;
  asOf: string;
  cashH: number;
  bankH: number;
  inventoryH: number;
  receivablesH: number;
  payablesH: number;
  vatH: number;
  assetsH: number;
  liabilitiesH: number;
  equityH: number;
  entryId: string;
  reference: string;
  status: 'posted' | 'reversed';
  reversedByEntryId?: string;
  note: string;
  postedAt: string;
  actor: string;
}

export interface ApiOpeningBalances {
  posted: boolean;
  branchId?: string;
  current?: ApiOpeningBalance;
  openingId?: string;
  asOf?: string;
  cashH?: number;
  bankH?: number;
  inventoryH?: number;
  receivablesH?: number;
  payablesH?: number;
  vatH?: number;
  equityH?: number;
  entryId?: string;
  postedAt?: string;
  actor?: string;
  history: ApiOpeningBalance[];
}

export const openingBalanceApi = {
  /** No branchId = the business-level position. */
  get(branchId?: string | null) {
    return api.get<ApiOpeningBalances>('/api/finance/opening-balances', {
      query: { branchId: branchId ?? undefined },
    });
  },

  /** 409 already_posted while a posting stands; 422 nothing_to_post. */
  post(payload: {
    branchId?: string | null;
    asOf: string;
    cashH: number;
    bankH: number;
    inventoryH: number;
    receivablesH: number;
    payablesH: number;
    vatH: number;
  }) {
    return api.post<ApiOpeningBalances>('/api/finance/opening-balances', payload);
  },
};

export const payrollApi = {
  runs(branchId?: string | null) {
    return api.get<Record<string, unknown>[]>('/api/finance/payroll', {
      query: { branchId: branchId ?? undefined },
    });
  },

  run(runId: string) {
    return api.get<{ run: Record<string, unknown>; lines: Record<string, unknown>[] }>(
      `/api/finance/payroll/${runId}`,
    );
  },

  draft(periodMonth: string, branchId?: string | null) {
    return api.post<{ runId: string }>('/api/finance/payroll/draft', {
      periodMonth,
      branchId,
    });
  },

  /**
   * Adjust a line before paying.
   *
   * Commission is absent on purpose — it records what was earned at each sale
   * and is not editable here.
   */
  updateLine(
    runId: string,
    userId: string,
    payload: { baseSalaryH: number; allowancesH: number; deductionsH: number },
  ) {
    return api.put<void>(`/api/finance/payroll/${runId}/lines/${userId}`, payload);
  },

  pay(runId: string, paidOn: string) {
    return api.post<void>(`/api/finance/payroll/${runId}/pay`, { paidOn });
  },
};

export interface ApiExpenseCategory {
  categoryId: string;
  nameAr: string;
  nameEn: string;
  name?: string;
  accountCode: string;
  accountNameAr?: string;
  accountNameEn?: string;
  isActive: boolean;
  status?: 'active' | 'inactive';
  expenseCount?: number;
  recurringCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiExpenseRecognitionItem {
  month: string;
  amountH: number;
  expenseId: string;
  reference: string;
  categoryId: string;
  categoryNameAr: string;
  categoryNameEn: string;
  accountCode: string;
  branchId?: string;
  descriptionEn: string;
  descriptionAr: string;
  recognition: string;
  paymentMethod: string;
  paidOn: string;
  periodStart?: string;
  periodEnd?: string;
  expenseAmountH: number;
  vatH: number;
}

export interface ApiExpenseRecognition {
  from: string;
  to: string;
  branchId?: string;
  totalH: number;
  branchTotalH?: number;
  businessWideTotalH: number;
  byMonth: { month: string; amountH: number }[];
  byCategory: {
    categoryId: string;
    nameAr: string;
    nameEn: string;
    name: string;
    accountCode: string;
    amountH: number;
  }[];
  byMonthCategory: { month: string; categoryId: string; amountH: number }[];
  items: ApiExpenseRecognitionItem[];
}

export const expenseCategoryApi = {
  /** Active categories unless includeInactive is set. */
  list(query: { includeInactive?: boolean } = {}) {
    return api.get<ApiExpenseCategory[]>('/api/expenses/categories', { query });
  },

  create(payload: { nameAr: string; nameEn: string; accountCode: string; status?: string }) {
    return api.post<ApiExpenseCategory>('/api/expenses/categories', payload);
  },

  update(
    categoryId: string,
    payload: { nameAr: string; nameEn: string; accountCode: string; status?: string },
  ) {
    return api.put<ApiExpenseCategory>(`/api/expenses/categories/${categoryId}`, payload);
  },

  /** The month-by-month split of each posted expense, net of VAT. */
  recognition(query: {
    month?: string;
    from?: string;
    to?: string;
    branchId?: string | null;
    categoryId?: string | null;
  }) {
    return api.get<ApiExpenseRecognition>('/api/expenses/recognition', {
      query: {
        ...query,
        branchId: query.branchId ?? undefined,
        categoryId: query.categoryId ?? undefined,
      },
    });
  },
};

export interface SaveRecurringPayload {
  descriptionEn: string;
  descriptionAr?: string | null;
  categoryId: string;
  branchId?: string | null;
  amountH: number;
  frequency: string;
  nextDueOn: string;
  paymentMethod?: string | null;
  note?: string | null;
  status?: 'active' | 'paused';
}

export const recurringApi = {
  get(recurringId: string) {
    return api.get<Record<string, unknown>>(`/api/expenses/recurring/${recurringId}`);
  },

  create(payload: SaveRecurringPayload) {
    return api.post<Record<string, unknown>>('/api/expenses/recurring', payload);
  },

  update(recurringId: string, payload: SaveRecurringPayload) {
    return api.put<Record<string, unknown>>(`/api/expenses/recurring/${recurringId}`, payload);
  },

  setStatus(recurringId: string, status: 'active' | 'paused') {
    return api.patch<Record<string, unknown>>(`/api/expenses/recurring/${recurringId}/status`, {
      status,
    });
  },

  recordInstalment(recurringId: string, paidOn: string) {
    return api.post<{ expenseId: string }>(`/api/finance/recurring/${recurringId}/record`, {
      paidOn,
    });
  },
};

export const reversalApi = {
  expense(expenseId: string, reason: string) {
    return api.post<void>(`/api/finance/expenses/${expenseId}/reverse`, { reason });
  },

  /** Corrections post the opposite entry; the original always stays. */
  ledgerEntry(entryId: string, reason: string) {
    return api.post<{ entryId: string }>(`/api/finance/ledger/${entryId}/reverse`, { reason });
  },
};

export const notificationApi = {
  list(unreadOnly = false) {
    return api.get<Record<string, unknown>[]>('/api/notifications', { query: { unreadOnly } });
  },

  markRead(notificationId: string) {
    return api.post<void>(`/api/notifications/${notificationId}/read`);
  },

  markAllRead() {
    return api.post<void>('/api/notifications/read-all');
  },
};
