import { USE_MOCKS } from '@/config/env';
import { expenseApi, recurringApi } from './api';
import { num, str } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type { Frequency, RecurringPayment } from '@/types/finance';
import { advanceDueDate } from '@/types/finance';
import { expenseService } from './expenseService';
import { delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

/**
 * Recurring payments.
 *
 * A schedule, not a ledger. Recording an instalment creates a real expense —
 * which posts — and then rolls the schedule forward. Keeping the two separate
 * means a missed month shows as an overdue schedule rather than a silent gap
 * in the accounts.
 */

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const daysAgo = (days: number) => daysFromNow(-days);

let recurring: RecurringPayment[] = [
  {
    id: 'rec_rent', description: 'Shop rent', categoryId: 'exc_rent',
    amountH: 800000, frequency: 'monthly', nextDueOn: daysFromNow(3),
    lastPaidOn: daysAgo(27), paymentMethod: 'bank', status: 'active',
    note: '', branchId: null, ...stamp(),
  },
  {
    id: 'rec_salary', description: 'Employee salaries', categoryId: 'exc_sal',
    amountH: 600000, frequency: 'monthly', nextDueOn: daysFromNow(9),
    lastPaidOn: daysAgo(21), paymentMethod: 'bank', status: 'active',
    note: '', branchId: null, ...stamp(),
  },
  {
    id: 'rec_elec', description: 'Electricity', categoryId: 'exc_util',
    amountH: 185000, frequency: 'monthly', nextDueOn: daysFromNow(5),
    lastPaidOn: daysAgo(25), paymentMethod: 'bank', status: 'active',
    note: '', branchId: null, ...stamp(),
  },
  {
    id: 'rec_net', description: 'Internet', categoryId: 'exc_util',
    amountH: 30000, frequency: 'monthly', nextDueOn: daysFromNow(22),
    lastPaidOn: daysAgo(8), paymentMethod: 'bank', status: 'active',
    note: '', branchId: null, ...stamp(),
  },
  {
    id: 'rec_ins', description: 'Business insurance', categoryId: 'exc_ins',
    amountH: 450000, frequency: 'yearly', nextDueOn: daysFromNow(18),
    lastPaidOn: null, paymentMethod: 'bank', status: 'active',
    note: '', branchId: null, ...stamp(),
  },
  {
    /* Deliberately overdue, so the red state is visible on first run. */
    id: 'rec_soft', description: 'Software subscription', categoryId: 'exc_sub',
    amountH: 45000, frequency: 'monthly', nextDueOn: daysAgo(2),
    lastPaidOn: daysAgo(32), paymentMethod: 'card', status: 'active',
    note: '', branchId: null, ...stamp(),
  },
];

function stamp() {
  const now = '2026-08-01T00:00:00.000Z';
  return { createdAt: now, updatedAt: now };
}

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

export const recurringService = {
  async list(): Promise<RecurringPayment[]> {
    if (!USE_MOCKS) {
      const rows = await expenseApi.recurring({ branchId: null });
      return rows.map((row) => ({
        id: str(row.recurringId),
        description: str(row.descriptionEn ?? row.descriptionAr),
        categoryId: str(row.categoryId),
        branchId: (row.branchId as string | null) ?? null,
        amountH: num(row.amountH),
        frequency: str(row.frequency, 'monthly'),
        nextDueOn: str(row.nextDueOn).slice(0, 10),
        lastPaidOn: row.lastPaidOn ? str(row.lastPaidOn).slice(0, 10) : null,
        paymentMethod: str(row.paymentMethod, 'bank'),
        status: str(row.status, 'active'),
        note: str(row.note),
        createdAt: str(row.createdAtUtc),
        updatedAt: str(row.updatedAtUtc),
      })) as unknown as Awaited<ReturnType<typeof recurringService.list>>;
    }

    await delay(160);
    return [...recurring].sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn));
  },

  /** Commitments falling due within a horizon. Drives Available Cash. */
  async upcoming(horizonDays = 30): Promise<RecurringPayment[]> {
    await delay(140);

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + horizonDays);
    const limit = horizon.toISOString().slice(0, 10);

    return recurring
      .filter((payment) => payment.status === 'active' && payment.nextDueOn <= limit)
      .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn));
  },

  async create(input: RecurringInput): Promise<RecurringPayment> {
    await delay(320);

    const errors: Record<string, string[]> = {};
    if (!input.description.trim()) errors.description = ['Give the payment a description.'];
    if (input.amountH <= 0) errors.amountH = ['Enter an amount above zero.'];
    if (!input.nextDueOn) errors.nextDueOn = ['When is the next payment due?'];
    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    const now = timestamp();
    const created: RecurringPayment = {
      id: nextId('rec'),
      description: input.description.trim(),
      categoryId: input.categoryId,
      amountH: input.amountH,
      frequency: input.frequency,
      nextDueOn: input.nextDueOn,
      lastPaidOn: null,
      paymentMethod: input.paymentMethod,
      status: 'active',
      note: input.note.trim(),
      branchId: input.branchId,
      createdAt: now,
      updatedAt: now,
    };

    recurring = [...recurring, created];
    return created;
  },

  async setStatus(id: string, status: 'active' | 'paused'): Promise<RecurringPayment> {
    await delay(220);

    const existing = recurring.find((payment) => payment.id === id);
    if (!existing) throw notFound('Recurring payment', id);

    const updated = { ...existing, status, updatedAt: timestamp() };
    recurring = recurring.map((payment) => (payment.id === id ? updated : payment));
    return updated;
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
    actor: string;
  }): Promise<RecurringPayment> {
    if (!USE_MOCKS) {
      /* Creates a real expense, then rolls the schedule forward from the DUE
         date, not today — paying late must not drag every future instalment. */
      await recurringApi.recordInstalment(input.id, input.paidOn);
      invalidate('expenses');
    }

    await delay(420);

    const existing = recurring.find((payment) => payment.id === input.id);
    if (!existing) throw notFound('Recurring payment', input.id);

    await expenseService.create({
      categoryId: existing.categoryId,
      amountH: existing.amountH,
      vatH: 0,
      paymentMethod: existing.paymentMethod,
      paidOn: input.paidOn,
      recognition: 'one_time',
      periodStart: input.paidOn,
      periodEnd: input.paidOn,
      note: existing.description,
      attachmentName: null,
      actor: input.actor,
      branchId: existing.branchId,
    });

    const now = timestamp();
    const updated: RecurringPayment = {
      ...existing,
      lastPaidOn: input.paidOn,
      nextDueOn: advanceDueDate(existing.nextDueOn, existing.frequency),
      updatedAt: now,
    };

    recurring = recurring.map((payment) => (payment.id === input.id ? updated : payment));
    return updated;
  },
};
