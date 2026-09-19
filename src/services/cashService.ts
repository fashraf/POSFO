import { USE_MOCKS } from '@/config/env';
import { drawerApi, settlementApi } from './api';
import { num, toCardSettlement, toDrawerSession } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type { CardSettlement, DrawerExpectation, DrawerSession } from '@/types/finance';
import { expectedDrawerH, settlementFeeH } from '@/types/finance';
import { credit, debit, ledgerService } from './ledgerService';
import { HttpError } from './http';
import { delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

/**
 * Cash drawer sessions.
 *
 * The expected figure is derived from the ledger every time it is asked for,
 * never stored. A stored expectation goes stale the moment anything posts
 * behind it, and a cashier counting against a stale number will "find" a
 * variance that is not there.
 */

let sessions: DrawerSession[] = [];

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
    if (!USE_MOCKS) {
      const row = await drawerApi.current(branchId);
      /* Null is a normal state — no drawer is open — not a failure. */
      return row ? toDrawerSession(row) : null;
    }

    await delay(120);
    return (
      sessions.find((session) => session.branchId === branchId && session.closedAt === null) ?? null
    );
  },

  async history(branchId: string | null, limit = 20): Promise<DrawerSession[]> {
    if (!USE_MOCKS) {
      const rows = await drawerApi.history(branchId, limit);
      return rows.map(toDrawerSession);
    }

    await delay(160);
    return sessions
      .filter((session) => session.branchId === branchId && session.closedAt !== null)
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
      .slice(0, limit);
  },

  async open(input: OpenDrawerInput): Promise<DrawerSession> {
    if (!USE_MOCKS) {
      if (!input.branchId) {
        throw validationFailed({ branchId: ['Select a branch before opening the drawer.'] });
      }

      await drawerApi.open(input.branchId, input.openingCashH);
      invalidate('ledger');

      const opened = await drawerApi.current(input.branchId);
      if (!opened) throw new Error('The drawer was opened but could not be read back.');
      return toDrawerSession(opened);
    }

    await delay(280);

    const existing = sessions.find(
      (session) => session.branchId === input.branchId && session.closedAt === null,
    );
    if (existing) {
      throw new HttpError({
        status: 409,
        code: 'drawer_already_open',
        message: 'A drawer session is already open. Close it before opening another.',
      });
    }

    if (input.openingCashH < 0) {
      throw validationFailed({ openingCashH: ['An opening float cannot be negative.'] });
    }

    const now = timestamp();
    const session: DrawerSession = {
      id: nextId('drw'),
      branchId: input.branchId,
      openedAt: now,
      closedAt: null,
      openingCashH: input.openingCashH,
      countedCashH: null,
      openedBy: input.openedBy,
      closedBy: null,
      note: '',
      createdAt: now,
      updatedAt: now,
    };

    sessions = [session, ...sessions];
    return session;
  },

  /**
   * What should be in the drawer right now.
   *
   * Only cash moves the drawer. Card takings sit in clearing until the bank
   * settles, and a credit sale never touches it — counting either would make
   * every close look short by the day's card total.
   */
  async expectation(session: DrawerSession): Promise<DrawerExpectation> {
    if (!USE_MOCKS) {
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
    }

    await delay(200);

    /* The window runs from when the drawer opened to now (or when it closed).
       Using a date-only `to` truncated the day and silently dropped entries
       posted later the same day, which made every close look short. */
    const from = session.openedAt;
    const to = (session.closedAt ?? timestamp()).slice(0, 10);

    const entries = (await ledgerService.list({ from, to })).filter(
      (entry) =>
        entry.postedAt >= from &&
        entry.postedAt <= (session.closedAt ?? new Date().toISOString()),
    );

    /* Read the cash account directly: every path that touches cash already
       posts there, so nothing can be missed by forgetting a case here. */
    const sum = (predicate: (kind: string) => boolean, side: 'debit' | 'credit') =>
      entries
        .filter((entry) => predicate(entry.kind))
        .flatMap((entry) => entry.lines)
        .filter((line) => line.accountCode === '1000')
        .reduce((total, line) => total + (side === 'debit' ? line.debitH : line.creditH), 0);

    const parts = {
      openingCashH: session.openingCashH,
      cashSalesH: sum((kind) => kind === 'sale', 'debit'),
      cashCollectionsH: sum((kind) => kind === 'customer_collection', 'debit'),
      ownerContributionsH: sum((kind) => kind === 'owner_contribution', 'debit'),
      cashExpensesH: sum((kind) => kind === 'expense', 'credit'),
      ownerWithdrawalsH: sum((kind) => kind === 'owner_withdrawal', 'credit'),
      cashRefundsH: sum((kind) => kind === 'return' || kind === 'void', 'credit'),
    };

    return { ...parts, expectedH: expectedDrawerH(parts) };
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
    await delay(160);

    const from = session.openedAt;
    const to = (session.closedAt ?? timestamp()).slice(0, 10);

    const sales = (await ledgerService.list({ from, to })).filter(
      (entry) => entry.kind === 'sale',
    );

    const sumDebits = (code: string) =>
      sales
        .flatMap((entry) => entry.lines)
        .filter((line) => line.accountCode === code)
        .reduce((total, line) => total + line.debitH, 0);

    const cashH = sumDebits('1000');
    const cardH = sumDebits('1150');
    const creditH = sumDebits('1400');

    return { cashH, cardH, creditH, totalH: cashH + cardH + creditH };
  },

  /**
   * Close and record the count.
   *
   * A variance posts to the ledger as its own entry rather than being quietly
   * absorbed — an unexplained 40 riyals is a fact about the business, and
   * hiding it is how a drawer problem goes unnoticed for months.
   */
  async close(input: CloseDrawerInput): Promise<DrawerSession> {
    if (!USE_MOCKS) {
      /* Any variance posts its own ledger entry. Absorbing it silently is how
         a drawer problem survives for months. */
      await drawerApi.close(input.sessionId, input.countedCashH, input.note);
      invalidate('ledger');

      const history = await drawerApi.history(null, 5);
      const closed = history.map(toDrawerSession).find((s) => s.id === input.sessionId);
      if (!closed) throw new Error('The drawer was closed but could not be read back.');
      return closed;
    }

    await delay(400);

    const session = sessions.find((candidate) => candidate.id === input.sessionId);
    if (!session) throw notFound('Drawer session', input.sessionId);

    if (session.closedAt) {
      throw new HttpError({
        status: 409,
        code: 'already_closed',
        message: 'This session is already closed.',
      });
    }

    if (input.countedCashH < 0) {
      throw validationFailed({ countedCashH: ['A count cannot be negative.'] });
    }

    const expectation = await drawerService.expectation(session);
    const varianceH = input.countedCashH - expectation.expectedH;

    if (varianceH !== 0) {
      await ledgerService.post({
        kind: 'manual',
        sourceReference: session.id,
        description:
          varianceH > 0 ? 'Cash drawer overage' : 'Cash drawer shortage',
        actor: input.closedBy,
        branchId: session.branchId,
        lines:
          varianceH > 0
            ? [debit('1000', varianceH, 'Overage'), credit('6000', varianceH, 'Drawer variance')]
            : [
                debit('6000', Math.abs(varianceH), 'Drawer variance'),
                credit('1000', Math.abs(varianceH), 'Shortage'),
              ],
      });
    }

    const now = timestamp();
    const closed: DrawerSession = {
      ...session,
      closedAt: now,
      countedCashH: input.countedCashH,
      closedBy: input.closedBy,
      note: input.note.trim(),
      updatedAt: now,
    };

    sessions = sessions.map((candidate) =>
      candidate.id === input.sessionId ? closed : candidate,
    );
    return closed;
  },
};

/* ------------------------------------------------------------------ */
/* Card settlement                                                     */
/* ------------------------------------------------------------------ */

let settlements: CardSettlement[] = [];
let settlementSequence = 300;

export const settlementService = {
  async list(): Promise<CardSettlement[]> {
    if (!USE_MOCKS) {
      const rows = await settlementApi.list(null);
      return rows.map(toCardSettlement);
    }

    await delay(160);
    return [...settlements].sort((a, b) => b.settledOn.localeCompare(a.settledOn));
  },

  /** Card takings still sitting in clearing, waiting for the bank. */
  async outstandingH(): Promise<number> {
    if (!USE_MOCKS) {
      return (await settlementApi.outstanding()).outstandingH;
    }

    return ledgerService.balance('1150');
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
    if (!USE_MOCKS) {
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
    }

    await delay(360);

    if (input.cardSalesH <= 0) {
      throw validationFailed({ cardSalesH: ['Enter the card takings this batch covers.'] });
    }
    if (input.depositH < 0) {
      throw validationFailed({ depositH: ['A deposit cannot be negative.'] });
    }
    if (input.depositH > input.cardSalesH) {
      throw validationFailed({
        depositH: ['The deposit is more than the takings. Check the figures.'],
      });
    }

    const feeH = settlementFeeH(input.cardSalesH, input.depositH);
    settlementSequence += 1;
    const now = timestamp();

    const settlement: CardSettlement = {
      id: nextId('set'),
      reference: `SET-${settlementSequence}`,
      cardSalesH: input.cardSalesH,
      depositH: input.depositH,
      feeH,
      settledOn: input.settledOn,
      status: 'reconciled',
      note: input.note.trim(),
      createdAt: now,
      updatedAt: now,
    };

    await ledgerService.post({
      kind: 'card_settlement',
      sourceReference: settlement.reference,
      description: 'Card settlement',
      postedAt: new Date(input.settledOn).toISOString(),
      actor: input.actor,
      lines: [
        debit('1100', input.depositH, 'Bank deposit'),
        debit('6100', feeH, 'Card fees'),
        credit('1150', input.cardSalesH, 'Card clearing'),
      ],
    });

    settlements = [settlement, ...settlements];
    return settlement;
  },
};
