import {
  customerApi,
  discountApi,
  drawerApi,
  expenseApi,
  financeApi,
  inventoryApi,
  kitchenApi,
  notificationApi,
  payrollApi,
  periodApi,
  recurringApi,
  referenceApi,
  reversalApi,
  salesApi,
  settlementApi,
  userApi,
} from './api';

/**
 * API-backed versions of the remaining services.
 *
 * Each keeps the method names the mock service uses, so swapping one for the
 * other is a single flag and no screen changes. Where the mock returned a
 * ready-made object and the API returns rows, the shape is adapted here rather
 * than in a component — a screen should never know which source it is reading.
 */

export const apiSalesService = {
  list: (query: Parameters<typeof salesApi.list>[0] = {}) => salesApi.list(query),
  get: (saleId: string) => salesApi.get(saleId),
  void: (saleId: string, reason: string) => salesApi.void(saleId, reason),
  commit: salesApi.commit,
};

export const apiCustomerService = {
  list: (query: Parameters<typeof customerApi.list>[0] = {}) => customerApi.list(query),
  get: (id: string) => customerApi.get(id),
  create: customerApi.create,
  statement: (id: string) => customerApi.statement(id),
  collect: customerApi.collect,
  receivables: () => customerApi.receivables(),
};

export const apiInventoryService = {
  list: (query: Parameters<typeof inventoryApi.levels>[0] = {}) => inventoryApi.levels(query),
  movements: (itemId: string, branchId?: string | null) =>
    inventoryApi.movements(itemId, { branchId }),
  receive: inventoryApi.receive,
  adjust: inventoryApi.adjust,
  vendors: () => inventoryApi.vendors(),
};

export const apiExpenseService = {
  list: (query: Parameters<typeof expenseApi.list>[0] = {}) => expenseApi.list(query),
  create: expenseApi.record,
  categories: () => expenseApi.categories(),
  reverse: (expenseId: string, reason: string) => reversalApi.expense(expenseId, reason),
};

export const apiRecurringService = {
  list: (branchId?: string | null) => expenseApi.recurring({ branchId }),
  recordInstalment: (recurringId: string, paidOn: string) =>
    recurringApi.recordInstalment(recurringId, paidOn),
};

export const apiLedgerService = {
  list: (query: Parameters<typeof financeApi.ledger>[0] = {}) => financeApi.ledger(query),
  balances: () => financeApi.accounts(),
  summary: (branchId?: string | null, month?: string) =>
    financeApi.summary({ branchId, month }),
  reverse: (entryId: string, reason: string) => reversalApi.ledgerEntry(entryId, reason),
};

export const apiCashService = {
  current: (branchId?: string | null) => drawerApi.current(branchId),
  expectation: (sessionId: string) => drawerApi.expectation(sessionId),
  dayTakings: (sessionId: string) => drawerApi.takings(sessionId),
  history: (branchId?: string | null) => drawerApi.history(branchId),
  open: (branchId: string, openingCashH: number) => drawerApi.open(branchId, openingCashH),
  close: (sessionId: string, countedCashH: number, note?: string | null) =>
    drawerApi.close(sessionId, countedCashH, note),

  /* Settlements sit on the same screen as the drawer. */
  list: (branchId?: string | null) => settlementApi.list(branchId),
  outstandingH: async () => (await settlementApi.outstanding()).outstandingH,
  record: settlementApi.record,
};

export const apiBalancePeriodService = {
  list: (branchId?: string | null) => periodApi.list(branchId),
  get: (periodId: string) => periodApi.get(periodId),
  expected: (periodId: string) => periodApi.expectation(periodId),
  open: periodApi.open,
  close: periodApi.close,

  /** The open period for a branch, or null. */
  current: async (branchId?: string | null) => {
    const rows = await periodApi.list(branchId);
    return rows.find((r) => (r as { status?: string }).status === 'open') ?? null;
  },
};

export const apiPayrollService = {
  list: (branchId?: string | null) => payrollApi.runs(branchId),
  get: (runId: string) => payrollApi.run(runId),
  draft: (periodMonth: string, branchId?: string | null) =>
    payrollApi.draft(periodMonth, branchId),
  updateLine: payrollApi.updateLine,
  pay: (runId: string, paidOn: string) => payrollApi.pay(runId, paidOn),

  /* Commission is read-only here: it records what was earned at each sale. */
  commission: (userId?: string, month?: string) => financeApi.commission({ userId, month }),
};

export const apiKitchenService = {
  list: (branchId?: string | null, includeCompleted = false) =>
    kitchenApi.orders({ branchId, includeCompleted }),
  setStatus: (preparationId: string, status: string) =>
    kitchenApi.setStatus(preparationId, status),
  setItemProgress: kitchenApi.setItemProgress,
};

export const apiDiscountService = {
  list: () => discountApi.list(),
  applicable: (subtotalH: number) => discountApi.applicable(subtotalH),
};

export const apiUserService = {
  list: (query: Parameters<typeof userApi.list>[0] = {}) => userApi.list(query),
  roles: () => userApi.roles(),
  permissions: () => userApi.permissions(),
};

export const apiNotificationService = {
  list: (unreadOnly = false) => notificationApi.list(unreadOnly),
  markRead: (id: string) => notificationApi.markRead(id),
  markAllRead: () => notificationApi.markAllRead(),
};

export const apiSettingsService = {
  branches: () => referenceApi.branches(),
  forBranch: (branchId: string) => referenceApi.branchSettings(branchId),
  languages: () => referenceApi.languages(),
};
