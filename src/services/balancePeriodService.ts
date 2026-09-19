import { USE_MOCKS } from '@/config/env';
import { periodApi } from './api';
import { num, str } from './mappers/saleMappers';
import type { BalancePeriod, MethodBalances } from '@/types/finance';
import { EMPTY_METHOD_BALANCES, methodTotalH } from '@/types/finance';
import { credit, debit, ledgerService } from './ledgerService';
import { HttpError } from './http';
import { delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

/**
 * Balance periods, per branch.
 *
 * One branch can be mid-period while another is closed, so periods are keyed
 * by branch rather than being a single business-wide state. A branch that has
 * never opened one simply has no history, which is a valid answer.
 */

let periods: BalancePeriod[] = [];
let sequence = 0;

export interface OpenPeriodInput {
  branchId: string | null;
  label: string;
  openedOn: string;
  opening: MethodBalances;
  openedBy: string;
  note: string;
}

export interface ClosePeriodInput {
  id: string;
  closedOn: string;
  closing: MethodBalances;
  closedBy: string;
  note: string;
}

export const balancePeriodService = {
  async list(branchId?: string | null): Promise<BalancePeriod[]> {
    if (!USE_MOCKS) {
      const rows = await periodApi.list(null);
      return rows.map((row) => ({
        id: str(row.periodId),
        branchId: (row.branchId as string | null) ?? null,
        label: str(row.label),
        openedOn: str(row.openedOn).slice(0, 10),
        closedOn: row.closedOn ? str(row.closedOn).slice(0, 10) : null,
        status: str(row.status, 'open'),
        openingCashH: num(row.openingCashH),
        openingCardH: num(row.openingCardH),
        openingCreditH: num(row.openingCreditH),
        openingBankH: num(row.openingBankH),
        openingInventoryH: num(row.openingInventoryH),
        openingPayablesH: num(row.openingPayablesH),
        closingCashH: row.closingCashH === null ? null : num(row.closingCashH),
        closingCardH: row.closingCardH === null ? null : num(row.closingCardH),
        closingCreditH: row.closingCreditH === null ? null : num(row.closingCreditH),
        closingBankH: row.closingBankH === null ? null : num(row.closingBankH),
        closingInventoryH: row.closingInventoryH === null ? null : num(row.closingInventoryH),
        closingPayablesH: row.closingPayablesH === null ? null : num(row.closingPayablesH),
        openedBy: str(row.openedBy, 'System'),
        closedBy: (row.closedBy as string | null) ?? null,
        note: str(row.note),
        createdAt: str(row.createdAtUtc),
        updatedAt: str(row.updatedAtUtc),
      })) as unknown as Awaited<ReturnType<typeof balancePeriodService.list>>;
    }

    await delay(180);

    return periods
      .filter((period) => !branchId || period.branchId === branchId)
      .sort((a, b) => b.openedOn.localeCompare(a.openedOn));
  },

  async get(id: string): Promise<BalancePeriod> {
    await delay(120);
    const period = periods.find((candidate) => candidate.id === id);
    if (!period) throw notFound('Balance period', id);
    return period;
  },

  /** The period currently open at a branch, if any. */
  async current(branchId: string | null): Promise<BalancePeriod | null> {
    await delay(120);
    return (
      periods.find((period) => period.branchId === branchId && period.status === 'open') ?? null
    );
  },

  /**
   * Open a period and post the starting position.
   *
   * Only one can be open per branch: two overlapping periods would each claim
   * the same movements, and neither closing figure would mean anything.
   */
  async open(input: OpenPeriodInput): Promise<BalancePeriod> {
    await delay(380);

    const existing = periods.find(
      (period) => period.branchId === input.branchId && period.status === 'open',
    );
    if (existing) {
      throw new HttpError({
        status: 409,
        code: 'period_already_open',
        message: 'This branch already has an open period. Close it before opening another.',
      });
    }

    const negative = Object.entries(input.opening).find(([, value]) => value < 0);
    if (negative) {
      throw validationFailed({ [negative[0]]: ['A balance cannot be negative.'] });
    }

    sequence += 1;
    const now = timestamp();

    const period: BalancePeriod = {
      id: nextId('bpd'),
      branchId: input.branchId,
      label: input.label.trim() || `Period ${sequence}`,
      openedOn: input.openedOn,
      closedOn: null,
      opening: input.opening,
      closing: null,
      status: 'open',
      openedBy: input.openedBy,
      closedBy: null,
      note: input.note.trim(),
      createdAt: now,
      updatedAt: now,
    };

    /* The opening position enters the ledger, with the residual to suspense so
       the entry balances without demanding the owner state their capital. */
    const equityH = methodTotalH(input.opening);

    await ledgerService.post({
      kind: 'opening_balance',
      sourceReference: period.id,
      description: `Opening position — ${period.label}`,
      postedAt: new Date(`${input.openedOn}T00:00:00.000Z`).toISOString(),
      actor: input.openedBy,
      branchId: input.branchId,
      lines: [
        debit('1000', input.opening.cashH, 'Opening cash'),
        debit('1150', input.opening.cardH, 'Opening card clearing'),
        debit('1400', input.opening.creditH, 'Opening receivables'),
        debit('1100', input.opening.bankH, 'Opening bank'),
        debit('1200', input.opening.inventoryH, 'Opening inventory'),
        credit('2000', input.opening.payablesH, 'Opening payables'),
        equityH >= 0
          ? credit('3900', equityH, 'Opening equity')
          : debit('3900', Math.abs(equityH), 'Opening equity'),
      ],
    });

    periods = [period, ...periods];
    return period;
  },

  /**
   * What the ledger says the position should be right now.
   *
   * Derived on every read rather than stored, so a figure counted against it
   * is never measured against a stale expectation.
   */
  async expected(period: BalancePeriod): Promise<MethodBalances> {
    await delay(200);

    const entries = await ledgerService.list({
      from: `${period.openedOn}T00:00:00.000Z`,
      to: (period.closedOn ?? new Date().toISOString()).slice(0, 10),
      branchId: period.branchId,
    });

    const balanceFor = (code: string) =>
      entries
        .flatMap((entry) => entry.lines)
        .filter((line) => line.accountCode === code)
        .reduce((sum, line) => sum + line.debitH - line.creditH, 0);

    return {
      cashH: balanceFor('1000'),
      cardH: balanceFor('1150'),
      creditH: balanceFor('1400'),
      bankH: balanceFor('1100'),
      inventoryH: balanceFor('1200'),
      /* Payables is credit-normal, so flip it to read as a positive debt. */
      payablesH: -balanceFor('2000'),
    };
  },

  /**
   * Close the period with a counted position.
   *
   * Any gap between counted and expected posts as a variance rather than being
   * absorbed — an unexplained difference is a fact about the business, and
   * quietly swallowing it is how a problem survives for months.
   */
  async close(input: ClosePeriodInput): Promise<BalancePeriod> {
    await delay(420);

    const period = periods.find((candidate) => candidate.id === input.id);
    if (!period) throw notFound('Balance period', input.id);

    if (period.status === 'closed') {
      throw new HttpError({
        status: 409,
        code: 'already_closed',
        message: 'This period is already closed.',
      });
    }

    const expected = await balancePeriodService.expected(period);
    const varianceH = methodTotalH(input.closing) - methodTotalH(expected);

    if (varianceH !== 0) {
      await ledgerService.post({
        kind: 'manual',
        sourceReference: period.id,
        description: varianceH > 0 ? 'Closing overage' : 'Closing shortage',
        postedAt: new Date(`${input.closedOn}T23:59:00.000Z`).toISOString(),
        actor: input.closedBy,
        branchId: period.branchId,
        lines:
          varianceH > 0
            ? [debit('1000', varianceH, 'Overage'), credit('6000', varianceH, 'Closing variance')]
            : [
                debit('6000', Math.abs(varianceH), 'Closing variance'),
                credit('1000', Math.abs(varianceH), 'Shortage'),
              ],
      });
    }

    const now = timestamp();
    const closed: BalancePeriod = {
      ...period,
      status: 'closed',
      closedOn: input.closedOn,
      closing: input.closing,
      closedBy: input.closedBy,
      note: input.note.trim() || period.note,
      updatedAt: now,
    };

    periods = periods.map((candidate) => (candidate.id === input.id ? closed : candidate));
    return closed;
  },

  /** Carry a closed period's closing position into a new opening one. */
  async rollForward(id: string, openedOn: string, actor: string): Promise<BalancePeriod> {
    const previous = await balancePeriodService.get(id);

    if (!previous.closing) {
      throw new HttpError({
        status: 409,
        code: 'not_closed',
        message: 'Close the previous period before rolling it forward.',
      });
    }

    return balancePeriodService.open({
      branchId: previous.branchId,
      label: '',
      openedOn,
      opening: previous.closing ?? EMPTY_METHOD_BALANCES,
      openedBy: actor,
      note: `Rolled forward from ${previous.label}`,
    });
  },
};
