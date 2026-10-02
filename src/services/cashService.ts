import { drawerApi, settlementApi } from './api';
import { num, toCardSettlement, toDrawerSession } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type { CardSettlement, DrawerExpectation, DrawerSession } from '@/types/finance';
import { HttpError } from './http';

/**
 * Cash drawer sessions.
 *
 * The expected figure is derived from the ledger every time it is asked for,
 * never stored. A stored expectation goes stale the moment anything posts
 * behind it, and a cashier counting against a stale number will "find" a
 * variance that is not there.
 */

export interface OpenDrawerInput {
  branchId: string | null;
  openingCashH: number;
  openedBy: string;
}

export interface CloseDrawerInput {
  sessionId: string;
  countedCashH: number;
  closedBy: string;
  note: string;
}

export const drawerService = {
  /** The session currently open at a branch, if any. */
  async current(branchId: string | null): Promise<DrawerSession | null> {
    const row = await drawerApi.current(branchId);
    /* Null is a normal state — no drawer is open — not a failure. */
    return row ? toDrawerSession(row) : null;
  },

  async history(branchId: string | null, limit = 20): Promise<DrawerSession[]> {
    const rows = await drawerApi.history(branchId, limit);
    return rows.map(toDrawerSession);
  },

  async open(input: OpenDrawerInput): Promise<DrawerSession> {
    if (!input.branchId) {
      throw new HttpError({
        status: 422,
        code: 'validation_failed',
        message: 'Some fields need attention.',
        fieldErrors: { branchId: ['Select a branch before opening the drawer.'] },
      });
    }

    await drawerApi.open(input.branchId, input.openingCashH);
    invalidate('ledger');

    const opened = await drawerApi.current(input.branchId);
    if (!opened) throw new Error('The drawer was opened but could not be read back.');
    return toDrawerSession(opened);
  },

  /**
   * What should be in the drawer right now.
   *
   * Only cash moves the drawer. Card takings sit in clearing until the bank
   * settles, and a credit sale never touches it — counting either would make
   * every close look short by the day's card total.
   */
  async expectation(session: DrawerSession): Promise<DrawerExpectation> {
    /* Derived from the ledger on every call. A stored figure goes stale the
       moment anything posts behind it, and counting against a stale number
       invents a variance that is not there. */
    const e = await drawerApi.expectation(session.id);
    return {
      openingCashH: num(e.openingCashH),
      cashSalesH: num(e.cashSalesH),
      cashCollectionsH: num(e.cashCollectionsH),
      ownerContributionsH: num(e.ownerContributionsH),
      cashExpensesH: num(e.cashExpensesH),
      ownerWithdrawalsH: num(e.ownerWithdrawalsH),
      cashRefundsH: num(e.cashRefundsH),
      expectedH: num(e.expectedH),
    };
  },

  /**
   * What the shift took, split by how it was paid.
   *
   * Shown before closing so the cashier can sanity-check the day against the
   * terminal before committing to a count. Card and credit are listed but do
   * not affect the drawer — that distinction is the point.
   */
  async dayTakings(session: DrawerSession): Promise<{
    cashH: number;
    cardH: number;
    creditH: number;
    totalH: number;
  }> {
    const takings = await drawerApi.takings(session.id);
    return {
      cashH: num(takings.cashH),
      cardH: num(takings.cardH),
      creditH: num(takings.creditH),
      totalH: num(takings.totalH),
    };
  },

  /**
   * Close and record the count.
   *
   * A variance posts to the ledger as its own entry rather than being quietly
   * absorbed — an unexplained 40 riyals is a fact about the business, and
   * hiding it is how a drawer problem goes unnoticed for months.
   */
  async close(input: CloseDrawerInput): Promise<DrawerSession> {
    /* Any variance posts its own ledger entry. Absorbing it silently is how
       a drawer problem survives for months. */
    await drawerApi.close(input.sessionId, input.countedCashH, input.note);
    invalidate('ledger');

    const history = await drawerApi.history(null, 5);
    const closed = history.map(toDrawerSession).find((s) => s.id === input.sessionId);
    if (!closed) throw new Error('The drawer was closed but could not be read back.');
    return closed;
  },
};

/* ------------------------------------------------------------------ */
/* Card settlement                                                     */
/* ------------------------------------------------------------------ */

export const settlementService = {
  async list(): Promise<CardSettlement[]> {
    const rows = await settlementApi.list(null);
    return rows.map(toCardSettlement);
  },

  /** Card takings still sitting in clearing, waiting for the bank. */
  async outstandingH(): Promise<number> {
    return (await settlementApi.outstanding()).outstandingH;
  },

  /**
   * Record what the bank actually deposited.
   *
   * The gap between card takings and the deposit is the network's fee, and it
   * is a real cost — recognising it here is why the card clearing account
   * returns to zero instead of drifting down by the fee every month.
   */
  async record(input: {
    cardSalesH: number;
    depositH: number;
    settledOn: string;
    note: string;
    actor: string;
  }): Promise<CardSettlement> {
    const recorded = await settlementApi.record({
      branchId: null,
      cardSalesH: input.cardSalesH,
      depositH: input.depositH,
      settledOn: input.settledOn,
      note: input.note,
    });

    invalidate('ledger');

    const rows = await settlementApi.list(null);
    const saved = rows.map(toCardSettlement).find((r) => r.id === recorded.settlementId);
    if (!saved) throw new Error('The settlement was recorded but could not be read back.');
    return saved;
  },
};
