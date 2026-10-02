import { expenseApi, recurringApi } from './api';
import { num, str } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type { Frequency, RecurringPayment } from '@/types/finance';
import type { SaveRecurringPayload } from './api/financeApi';
import { utc } from './mappers/time';
import { validationFailed } from './util';

/**
 * Recurring payments.
 *
 * A schedule, not a ledger. Recording an instalment creates a real expense —
 * which posts — and then rolls the schedule forward. Keeping the two separate
 * means a missed month shows as an overdue schedule rather than a silent gap
 * in the accounts.
 */

export interface RecurringInput {
  description: string;
  categoryId: string;
  amountH: number;
  frequency: Frequency;
  nextDueOn: string;
  paymentMethod: RecurringPayment['paymentMethod'];
  note: string;
  branchId: string | null;
}

function toRecurringPayment(row: Record<string, unknown>): RecurringPayment {
  return {
    id: str(row.recurringId),
    description: str(row.descriptionEn ?? row.descriptionAr),
    categoryId: str(row.categoryId),
    branchId: (row.branchId as string | null) ?? null,
    amountH: num(row.amountH),
    frequency: str(row.frequency, 'monthly') as Frequency,
    nextDueOn: str(row.nextDueOn).slice(0, 10),
    lastPaidOn: row.lastPaidOn ? str(row.lastPaidOn).slice(0, 10) : null,
    paymentMethod: str(row.paymentMethod, 'bank') as RecurringPayment['paymentMethod'],
    status: str(row.status) === 'paused' ? 'paused' : 'active',
    note: str(row.note),
    createdAt: utc(str(row.createdAtUtc ?? row.createdAt)),
    updatedAt: utc(str(row.updatedAtUtc ?? row.updatedAt)),
  };
}

function toPayload(input: RecurringInput): SaveRecurringPayload {
  return {
    descriptionEn: input.description.trim(),
    categoryId: input.categoryId,
    branchId: input.branchId,
    amountH: input.amountH,
    frequency: input.frequency,
    nextDueOn: input.nextDueOn,
    paymentMethod: input.paymentMethod,
    note: input.note.trim() || null,
  };
}

export const recurringService = {
  /** Soonest due first. No branch means every branch the caller can see. */
  async list(branchId?: string | null): Promise<RecurringPayment[]> {
    const rows = await expenseApi.recurring({ branchId: branchId ?? null });
    return rows.map(toRecurringPayment);
  },

  /** Commitments falling due within a horizon. Drives Available Cash. */
  async upcoming(horizonDays = 30, branchId?: string | null): Promise<RecurringPayment[]> {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + horizonDays);
    const limit = horizon.toISOString().slice(0, 10);

    /* Overdue payments are included: they are still owed. */
    return (await recurringService.list(branchId))
      .filter((payment) => payment.status === 'active' && payment.nextDueOn <= limit)
      .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn));
  },

  async get(id: string): Promise<RecurringPayment> {
    return toRecurringPayment(await recurringApi.get(id));
  },

  /** Saving a schedule posts nothing; recording an instalment does. */
  async create(input: RecurringInput): Promise<RecurringPayment> {
    const errors: Record<string, string[]> = {};
    if (!input.description.trim()) errors.description = ['Give the payment a description.'];
    if (input.amountH <= 0) errors.amountH = ['Enter an amount above zero.'];
    if (!input.nextDueOn) errors.nextDueOn = ['When is the next payment due?'];
    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    const created = await recurringApi.create(toPayload(input));
    invalidate('expenses');
    return toRecurringPayment(created);
  },

  async update(
    id: string,
    input: RecurringInput & { status?: 'active' | 'paused' },
  ): Promise<RecurringPayment> {
    const updated = await recurringApi.update(id, { ...toPayload(input), status: input.status });
    invalidate('expenses');
    return toRecurringPayment(updated);
  },

  async setStatus(id: string, status: 'active' | 'paused'): Promise<RecurringPayment> {
    const updated = await recurringApi.setStatus(id, status);
    invalidate('expenses');
    return toRecurringPayment(updated);
  },

  /**
   * Record this instalment.
   *
   * Creates the expense — which posts to the ledger — then rolls the schedule
   * forward from the date that was actually due, not from today. Paying late
   * must not shift every future instalment later with it.
   */
  async recordInstalment(input: {
    id: string;
    paidOn: string;
    actor?: string;
  }): Promise<RecurringPayment> {
    /* Creates a real expense, then rolls the schedule forward from the DUE
       date, not today — paying late must not drag every future instalment. */
    await recurringApi.recordInstalment(input.id, input.paidOn);
    invalidate('expenses');

    return recurringService.get(input.id);
  },
};
