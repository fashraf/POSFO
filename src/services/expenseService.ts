import { activationApi, expenseApi, reversalApi } from './api';
import { expenseCategoryApi } from './api/financeApi';
import type { ApiExpenseCategory, ApiExpenseRecognitionItem } from './api/financeApi';
import { toExpense } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type { Expense, ExpenseCategory } from '@/types/finance';
import { utc } from './mappers/time';
import { notFound, validationFailed } from './util';

/**
 * Expenses.
 *
 * The design decision that matters: **when money left is not when the cost
 * belongs.** A year of rent paid in January is one cash movement and twelve
 * monthly costs. Both facts are recorded, and reports read whichever one they
 * actually need.
 */

function toCategory(row: ApiExpenseCategory): ExpenseCategory {
  return {
    id: row.categoryId,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    accountCode: row.accountCode,
    status: row.status ?? (row.isActive === false ? 'inactive' : 'active'),
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

/** One expense's share of one month, as the server split it (net of VAT). */
export type RecognisedExpense = ApiExpenseRecognitionItem;

export interface ExpenseInput {
  categoryId: string;
  amountH: number;
  vatH: number;
  paymentMethod: Expense['paymentMethod'];
  paidOn: string;
  recognition: Expense['recognition'];
  periodStart: string;
  periodEnd: string;
  note: string;
  attachmentName: string | null;
  actor: string;
  branchId: string | null;
}

export const expenseCategoryService = {
  /** Active categories unless `includeInactive` is set. */
  async list(options: { includeInactive?: boolean } = {}): Promise<ExpenseCategory[]> {
    const rows = await expenseCategoryApi.list({ includeInactive: options.includeInactive });
    return rows.map(toCategory);
  },

  /**
   * The server checks the names and that the account is an expense account
   * (not 5100, cost of goods), answering per field.
   */
  async create(input: {
    nameAr: string;
    nameEn: string;
    accountCode: string;
  }): Promise<ExpenseCategory> {
    if (!input.nameAr.trim() || !input.nameEn.trim()) {
      throw validationFailed({
        nameAr: input.nameAr.trim() ? [] : ['Arabic name is required.'],
        nameEn: input.nameEn.trim() ? [] : ['English name is required.'],
      });
    }

    const created = await expenseCategoryApi.create({
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      accountCode: input.accountCode,
    });
    invalidate('expenses');
    return toCategory(created);
  },

  /** 409 category_in_use when deactivating one that recurring schedules use. */
  async update(
    id: string,
    input: { nameAr: string; nameEn: string; accountCode: string; status?: 'active' | 'inactive' },
  ): Promise<ExpenseCategory> {
    const updated = await expenseCategoryApi.update(id, {
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      accountCode: input.accountCode,
      status: input.status,
    });
    invalidate('expenses');
    return toCategory(updated);
  },

  async setStatus(id: string, status: 'active' | 'inactive'): Promise<ExpenseCategory> {
    await activationApi.set('expenseCategory', id, status === 'active');
    invalidate('expenses');

    const after = (await expenseCategoryService.list({ includeInactive: true })).find(
      (category) => category.id === id,
    );
    if (!after) throw notFound('Expense category', id);
    return after;
  },
};

export const expenseService = {
  async list(): Promise<Expense[]> {
    const page = await expenseApi.list({ pageSize: 200 });
    return page.items.map(toExpense);
  },

  async get(id: string): Promise<Expense> {
    /* No single-expense route; the list is already scoped and small. */
    const page = await expenseApi.list({ pageSize: 200 });
    const found = page.items.map(toExpense).find((e) => e.id === id);
    if (!found) throw notFound('Expense', id);
    return found;
  },

  /**
   * Record an expense and post it.
   *
   * The procedure records the payment and spreads the cost across the months
   * it covers, in one transaction. A year of rent paid up front is one cash
   * movement and twelve monthly charges.
   */
  async create(input: ExpenseInput): Promise<Expense> {
    const created = await expenseApi.record({
      categoryId: input.categoryId,
      branchId: input.branchId,
      descriptionEn: input.note,
      descriptionAr: input.note,
      amountH: input.amountH,
      vatH: input.vatH,
      paymentMethod: input.paymentMethod,
      paidOn: input.paidOn,
      recognition: input.recognition,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      attachmentName: input.attachmentName,
    });

    invalidate('expenses');
    return expenseService.get(created.expenseId);
  },

  /**
   * Reverse rather than delete, so the trail stays intact.
   *
   * Posts the mirror entries and marks the expense reversed. The server takes
   * the actor from the session.
   */
  async reverse(id: string, reason: string, _actor?: string): Promise<Expense> {
    await reversalApi.expense(id, reason);
    invalidate('expenses');
    return expenseService.get(id);
  },

  /**
   * How much of each posted expense belongs to a given month, net of VAT —
   * the server's own split, so reports and this agree. With a branch, the
   * business-wide (no-branch) expenses are included alongside it.
   */
  async recognitionFor(month: string, branchId?: string | null): Promise<RecognisedExpense[]> {
    const result = await expenseCategoryApi.recognition({ month, branchId });
    return result.items;
  },
};
