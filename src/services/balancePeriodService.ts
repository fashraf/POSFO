import { periodApi } from './api';
import { num, str } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type { BalancePeriod, MethodBalances } from '@/types/finance';
import { HttpError } from './http';

/**
 * Balance periods, per branch.
 *
 * One branch can be mid-period while another is closed, so periods are keyed
 * by branch rather than being a single business-wide state. A branch that has
 * never opened one simply has no history, which is a valid answer.
 */

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

type Row = Record<string, unknown>;

/** The closing columns are all null until the period is counted. */
function closingOf(row: Row): MethodBalances | null {
  if (row.closingCashH === null || row.closingCashH === undefined) return null;

  return {
    cashH: num(row.closingCashH),
    cardH: num(row.closingCardH),
    creditH: num(row.closingCreditH),
    bankH: num(row.closingBankH),
    inventoryH: num(row.closingInventoryH),
    payablesH: num(row.closingPayablesH),
  };
}

function toBalancePeriod(row: Row): BalancePeriod {
  return {
    id: str(row.periodId),
    branchId: (row.branchId as string | null) ?? null,
    label: str(row.label),
    openedOn: str(row.openedOn).slice(0, 10),
    closedOn: row.closedOn ? str(row.closedOn).slice(0, 10) : null,
    opening: {
      cashH: num(row.openingCashH),
      cardH: num(row.openingCardH),
      creditH: num(row.openingCreditH),
      bankH: num(row.openingBankH),
      inventoryH: num(row.openingInventoryH),
      payablesH: num(row.openingPayablesH),
    },
    closing: closingOf(row),
    status: str(row.status) === 'closed' ? 'closed' : 'open',
    openedBy: str(row.openedBy, 'System'),
    closedBy: (row.closedBy as string | null) ?? null,
    note: str(row.note),
    createdAt: str(row.createdAtUtc),
    updatedAt: str(row.updatedAtUtc),
  };
}

export const balancePeriodService = {
  /** Newest first. No branch means every branch the caller can see. */
  async list(branchId?: string | null): Promise<BalancePeriod[]> {
    const rows = await periodApi.list(branchId ?? null);
    return rows.map(toBalancePeriod);
  },

  async get(id: string): Promise<BalancePeriod> {
    return toBalancePeriod(await periodApi.get(id));
  },

  /** The period currently open at a branch, if any. */
  async current(branchId: string | null): Promise<BalancePeriod | null> {
    const periods = await balancePeriodService.list(branchId);
    return (
      periods.find((period) => period.branchId === branchId && period.status === 'open') ?? null
    );
  },

  /**
   * Open a period and post the starting position.
   *
   * Only one can be open per branch: two overlapping periods would each claim
   * the same movements, and neither closing figure would mean anything. The
   * procedure enforces that and posts the opening entry.
   */
  async open(input: OpenPeriodInput): Promise<BalancePeriod> {
    if (!input.branchId) {
      throw new HttpError({
        status: 422,
        code: 'validation_failed',
        message: 'Some fields need attention.',
        fieldErrors: { branchId: ['Select a branch before opening a period.'] },
      });
    }

    const opened = await periodApi.open({
      branchId: input.branchId,
      label: input.label.trim(),
      openedOn: input.openedOn,
      openingCashH: input.opening.cashH,
      openingCardH: input.opening.cardH,
      openingCreditH: input.opening.creditH,
      openingBankH: input.opening.bankH,
      openingInventoryH: input.opening.inventoryH,
      openingPayablesH: input.opening.payablesH,
      note: input.note.trim() || null,
    });

    invalidate('ledger');
    return balancePeriodService.get(opened.periodId);
  },

  /**
   * What the ledger says the position should be right now.
   *
   * Derived on every read rather than stored, so a figure counted against it
   * is never measured against a stale expectation.
   */
  async expected(period: BalancePeriod): Promise<MethodBalances> {
    const row = await periodApi.expectation(period.id);

    return {
      cashH: num(row.cashH),
      cardH: num(row.cardH),
      creditH: num(row.creditH),
      bankH: num(row.bankH),
      inventoryH: num(row.inventoryH),
      /* Already credit-normal from the server, so it reads as a positive debt. */
      payablesH: num(row.payablesH),
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
    await periodApi.close(input.id, {
      closedOn: input.closedOn,
      closingCashH: input.closing.cashH,
      closingCardH: input.closing.cardH,
      closingCreditH: input.closing.creditH,
      closingBankH: input.closing.bankH,
      closingInventoryH: input.closing.inventoryH,
      closingPayablesH: input.closing.payablesH,
      note: input.note.trim() || null,
    });

    invalidate('ledger');
    return balancePeriodService.get(input.id);
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
      /* Named by its start date; the note records where it came from. */
      label: openedOn,
      openedOn,
      opening: previous.closing,
      openedBy: actor,
      note: `Rolled forward from ${previous.label}`,
    });
  },
};
