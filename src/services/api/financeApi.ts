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

export const recurringApi = {
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
