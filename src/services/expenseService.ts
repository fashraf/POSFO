import { USE_MOCKS } from '@/config/env';
import { expenseApi, reversalApi } from './api';
import { toExpense } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type { Expense, ExpenseCategory, RecognitionSlice } from '@/types/finance';
import { ACCOUNTS, monthKey, recogniseExpense } from '@/types/finance';
import { credit, debit, ledgerService } from './ledgerService';
import { HttpError } from './http';
import { delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

/**
 * Expenses.
 *
 * The design decision that matters: **when money left is not when the cost
 * belongs.** A year of rent paid in January is one cash movement and twelve
 * monthly costs. Both facts are recorded, and reports read whichever one they
 * actually need.
 */

let categories: ExpenseCategory[] = [
  { id: 'exc_rent', nameAr: 'الإيجار', nameEn: 'Rent', accountCode: '6000', status: 'active', ...stamp() },
  { id: 'exc_util', nameAr: 'المرافق', nameEn: 'Utilities', accountCode: '6000', status: 'active', ...stamp() },
  { id: 'exc_sal', nameAr: 'الرواتب', nameEn: 'Salaries', accountCode: '6200', status: 'active', ...stamp() },
  { id: 'exc_ins', nameAr: 'التأمين', nameEn: 'Insurance', accountCode: '6000', status: 'active', ...stamp() },
  { id: 'exc_sub', nameAr: 'الاشتراكات', nameEn: 'Subscriptions', accountCode: '6000', status: 'active', ...stamp() },
  { id: 'exc_main', nameAr: 'الصيانة', nameEn: 'Maintenance', accountCode: '6000', status: 'active', ...stamp() },
  { id: 'exc_gov', nameAr: 'رسوم حكومية', nameEn: 'Government fees', accountCode: '6000', status: 'active', ...stamp() },
  { id: 'exc_mkt', nameAr: 'التسويق', nameEn: 'Marketing', accountCode: '6000', status: 'active', ...stamp() },
  { id: 'exc_other', nameAr: 'أخرى', nameEn: 'Other', accountCode: '6000', status: 'active', ...stamp() },
];

function stamp() {
  const now = '2026-08-01T00:00:00.000Z';
  return { createdAt: now, updatedAt: now };
}

let expenses: Expense[] = [];
let sequence = 400;

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

const PAYMENT_ACCOUNTS: Record<Expense['paymentMethod'], string> = {
  cash: '1000',
  card: '1100',
  bank: '1100',
  credit: '2000',
};

function validate(input: ExpenseInput): void {
  const errors: Record<string, string[]> = {};

  if (input.amountH <= 0) errors.amountH = ['Enter an amount above zero.'];
  if (input.vatH < 0) errors.vatH = ['VAT cannot be negative.'];
  if (input.vatH > input.amountH) {
    errors.vatH = ['VAT cannot be more than the total amount.'];
  }
  if (!categories.find((category) => category.id === input.categoryId)) {
    errors.categoryId = ['Choose a category.'];
  }
  if (!input.paidOn) errors.paidOn = ['When did the money leave?'];

  if (input.recognition !== 'one_time') {
    if (!input.periodStart || !input.periodEnd) {
      errors.periodEnd = ['Set the period this cost covers.'];
    } else if (new Date(input.periodEnd) < new Date(input.periodStart)) {
      errors.periodEnd = ['The period must end after it starts.'];
    }
  }

  if (Object.keys(errors).length > 0) throw validationFailed(errors);
}

export const expenseCategoryService = {
  async list(): Promise<ExpenseCategory[]> {
    await delay(120);
    return categories;
  },

  async create(input: {
    nameAr: string;
    nameEn: string;
    accountCode: string;
  }): Promise<ExpenseCategory> {
    await delay(280);

    if (!input.nameAr.trim() || !input.nameEn.trim()) {
      throw validationFailed({
        nameAr: input.nameAr.trim() ? [] : ['Arabic name is required.'],
        nameEn: input.nameEn.trim() ? [] : ['English name is required.'],
      });
    }
    if (!ACCOUNTS[input.accountCode]) {
      throw validationFailed({ accountCode: ['Choose an expense account.'] });
    }

    const now = timestamp();
    const created: ExpenseCategory = {
      id: nextId('exc'),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      accountCode: input.accountCode,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    categories = [...categories, created];
    return created;
  },

  async setStatus(id: string, status: 'active' | 'inactive'): Promise<ExpenseCategory> {
    await delay(200);

    const existing = categories.find((category) => category.id === id);
    if (!existing) throw notFound('Expense category', id);

    const updated = { ...existing, status, updatedAt: timestamp() };
    categories = categories.map((category) => (category.id === id ? updated : category));
    return updated;
  },
};

export const expenseService = {
  async list(): Promise<Expense[]> {
    if (!USE_MOCKS) {
      const page = await expenseApi.list({ pageSize: 200 });
      return page.items.map(toExpense);
    }

    await delay(200);
    return [...expenses].sort(
      (a, b) => new Date(b.paidOn).getTime() - new Date(a.paidOn).getTime(),
    );
  },

  async get(id: string): Promise<Expense> {
    if (!USE_MOCKS) {
      /* No single-expense route; the list is already scoped and small. */
      const page = await expenseApi.list({ pageSize: 200 });
      const found = page.items.map(toExpense).find((e) => e.id === id);
      if (!found) throw notFound('Expense', id);
      return found;
    }

    await delay(120);
    const expense = expenses.find((candidate) => candidate.id === id);
    if (!expense) throw notFound('Expense', id);
    return expense;
  },

  /**
   * Record an expense and post it.
   *
   * A one-time expense hits the expense account directly. Anything spread over
   * time is parked in prepaid and released month by month, so January's profit
   * carries January's share and no more.
   */
  async create(input: ExpenseInput): Promise<Expense> {
    if (!USE_MOCKS) {
      /* The procedure records the payment and spreads the cost across the
         months it covers, in one transaction. A year of rent paid up front is
         one cash movement and twelve monthly charges. */
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
    }

    await delay(400);
    validate(input);

    const category = categories.find((candidate) => candidate.id === input.categoryId)!;
    const netH = input.amountH - input.vatH;
    const paymentAccount = PAYMENT_ACCOUNTS[input.paymentMethod];

    sequence += 1;
    const now = timestamp();

    const expense: Expense = {
      id: nextId('exp'),
      reference: `EXP-${sequence}`,
      categoryId: input.categoryId,
      amountH: input.amountH,
      vatH: input.vatH,
      paymentMethod: input.paymentMethod,
      paidOn: input.paidOn,
      recognition: input.recognition,
      periodStart: input.recognition === 'one_time' ? input.paidOn : input.periodStart,
      periodEnd: input.recognition === 'one_time' ? input.paidOn : input.periodEnd,
      note: input.note.trim(),
      attachmentName: input.attachmentName,
      status: 'posted',
      actor: input.actor,
      branchId: input.branchId,
      createdAt: now,
      updatedAt: now,
    };

    const spreadsOverTime = input.recognition !== 'one_time';

    /* The payment itself: money leaves on the date it left, whatever period
       the cost belongs to. */
    await ledgerService.post({
      kind: 'expense',
      sourceReference: expense.reference,
      description: `${category.nameEn}${expense.note ? ` — ${expense.note}` : ''}`,
      postedAt: new Date(input.paidOn).toISOString(),
      actor: input.actor,
      branchId: input.branchId,
      lines: [
        debit(spreadsOverTime ? '1500' : category.accountCode, netH, category.nameEn),
        debit('1300', input.vatH, 'Input VAT'),
        credit(paymentAccount, input.amountH, input.paymentMethod),
      ],
    });

    /* Then one recognition entry per month it covers, releasing prepaid into
       the expense account as each month arrives. */
    if (spreadsOverTime) {
      for (const slice of recogniseExpense(expense)) {
        await ledgerService.post({
          kind: 'expense_recognition',
          sourceReference: expense.reference,
          description: `${category.nameEn} — ${slice.period}`,
          postedAt: `${slice.period}-01T00:00:00.000Z`,
          actor: input.actor,
          branchId: input.branchId,
          lines: [
            debit(category.accountCode, slice.amountH, slice.period),
            credit('1500', slice.amountH, 'Prepaid release'),
          ],
        });
      }
    }

    expenses = [expense, ...expenses];
    return expense;
  },

  /** Reverse rather than delete, so the trail stays intact. */
  async reverse(id: string, reason: string, actor: string): Promise<Expense> {
    if (!USE_MOCKS) {
      /* Posts the mirror entries and marks the expense reversed. The original
         stays — a correction that deletes the record is not an audit trail. */
      await reversalApi.expense(id, reason);
      invalidate('expenses');
      return expenseService.get(id);
    }

    await delay(360);

    const existing = expenses.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Expense', id);

    if (existing.status === 'reversed') {
      throw new HttpError({
        status: 409,
        code: 'already_reversed',
        message: 'This expense has already been reversed.',
      });
    }

    const related = (await ledgerService.list({ search: existing.reference })).filter(
      (entry) => entry.sourceReference === existing.reference && !entry.reversesEntryId,
    );

    for (const entry of related) {
      if (entry.reversedByEntryId) continue;
      await ledgerService.reverse(entry.id, reason, actor);
    }

    const updated: Expense = { ...existing, status: 'reversed', updatedAt: timestamp() };
    expenses = expenses.map((expense) => (expense.id === id ? updated : expense));
    return updated;
  },

  /** How much of each expense belongs to a given month. */
  async recognitionFor(month: string): Promise<{ expense: Expense; amountH: number }[]> {
    await delay(160);

    return expenses
      .filter((expense) => expense.status === 'posted')
      .map((expense) => {
        const slice = recogniseExpense(expense).find(
          (candidate: RecognitionSlice) => candidate.period === month,
        );
        return slice ? { expense, amountH: slice.amountH } : null;
      })
      .filter((entry): entry is { expense: Expense; amountH: number } => entry !== null);
  },

  /** Cash actually spent in a month, which is a different question. */
  async cashOutIn(month: string): Promise<number> {
    await delay(120);

    return expenses
      .filter((expense) => expense.status === 'posted' && monthKey(expense.paidOn) === month)
      .reduce((sum, expense) => sum + expense.amountH, 0);
  },
};
