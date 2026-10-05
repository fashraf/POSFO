import { financeApi, reversalApi, type FinanceSummary } from './api';
import type { FinanceFigures } from './api/salesApi';
import { num, str, toJournalEntry } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type { JournalEntry, TransactionKind } from '@/types/finance';

/**
 * The ledger.
 *
 * Reads come from the API, which posts every entry inside the procedure that
 * caused it — the balance rule is enforced there, in the database.
 */

export interface LedgerQuery {
  from?: string;
  to?: string;
  accountCode?: string;
  kind?: TransactionKind;
  search?: string;
  branchId?: string | null;
}

export const ledgerService = {
  /**
   * One entry with its lines — the debits and credits behind the totals —
   * and, when it was reversed, why.
   */
  async get(entryId: string): Promise<JournalEntry & { reversalReason: string | null }> {
    const row = await financeApi.entry(entryId);
    return {
      ...toJournalEntry(row as unknown as Record<string, unknown>),
      lines: (row.lines ?? []).map((line) => ({
        accountCode: line.accountCode,
        debitH: line.debitH,
        creditH: line.creditH,
        memo: line.memo ?? '',
      })),
      reversalReason: row.reversalReason ?? null,
    };
  },

  /**
   * Reverse an entry.
   *
   * Corrections are made by posting the opposite, never by editing or removing
   * the original — an audit trail with a hole in it is not an audit trail.
   * Resolves to the id of the reversing entry.
   */
  async reverse(entryId: string, reason: string, _actor?: string): Promise<string> {
    /* The server records the actor from the session; the parameter stays so
       callers need not change. */
    const reversed = await reversalApi.ledgerEntry(entryId, reason);
    invalidate('ledger');
    return reversed.entryId;
  },

  async list(query: LedgerQuery = {}): Promise<JournalEntry[]> {
    /* Filtering happens in SQL, where the indexes are. Pulling everything
       and filtering here would work at seed scale and fall over at a year
       of real trading. The route caps a page at 200. */
    const page = await financeApi.ledger({
      branchId: query.branchId ?? undefined,
      accountCode: query.accountCode ?? undefined,
      kind: query.kind ?? undefined,
      search: query.search?.trim() || undefined,
      from: query.from,
      to: query.to,
      pageSize: 200,
    });

    return page.items.map(toJournalEntry);
  },

  /** Balance of one account, in its natural direction. */
  async balance(accountCode: string): Promise<number> {
    const rows = await financeApi.accounts();
    const row = rows.find((candidate) => str(candidate.accountCode) === accountCode);
    return row ? num(row.balanceH) : 0;
  },

  /**
   * Debit and credit totals for every account that has movement.
   *
   * Business-wide: the balance view is not branch-scoped, and a trial balance
   * that only covered one branch would not be expected to balance anyway.
   */
  async trialBalance(): Promise<{ code: string; debitH: number; creditH: number }[]> {
    const rows = await financeApi.accounts();

    return rows
      .map((row) => ({
        code: str(row.accountCode),
        debitH: num(row.totalDebitH),
        creditH: num(row.totalCreditH),
      }))
      .filter((row) => row.debitH !== 0 || row.creditH !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  },

  /** Every account balance at once, for the money screens. */
  async balances(): Promise<Record<string, number>> {
    const rows = await financeApi.accounts();
    return Object.fromEntries(rows.map((row) => [str(row.accountCode), num(row.balanceH)]));
  },

  /**
   * The month's headline figures, computed from the ledger on the server.
   *
   * With a branch, the top-level figures are that branch's own entries only;
   * entries tagged to no branch arrive separately as `businessWide`. Revenue is
   * net of returns, which are also given on their own as `returnsH`.
   */
  async monthSummary(month: string, branchId?: string | null): Promise<FinanceSummary> {
    const row = await financeApi.summary({ branchId: branchId ?? undefined, month });

    return {
      ...toFigures(row),
      paymentMix: {
        cashH: num(row.paymentMix?.cashH),
        cardH: num(row.paymentMix?.cardH),
        creditH: num(row.paymentMix?.creditH),
        bankH: num(row.paymentMix?.bankH),
        totalH: num(row.paymentMix?.totalH),
        saleCount: num(row.paymentMix?.saleCount),
      },
      refunds: {
        cashH: num(row.refunds?.cashH),
        cardH: num(row.refunds?.cardH),
        creditH: num(row.refunds?.creditH),
        bankH: num(row.refunds?.bankH),
        totalH: num(row.refunds?.totalH),
        noteCount: num(row.refunds?.noteCount),
      },
      businessWide: row.businessWide ? toFigures(row.businessWide) : null,
    };
  },

  /** Several months at once, in the order asked for. */
  async monthSummaries(
    months: string[],
    branchId?: string | null,
  ): Promise<(FinanceSummary & { month: string })[]> {
    const summaries = await Promise.all(
      months.map((month) => ledgerService.monthSummary(month, branchId)),
    );
    return summaries.map((summary, index) => ({ ...summary, month: months[index] }));
  },
};

function toFigures(row: Partial<FinanceFigures>): FinanceFigures {
  return {
    revenueH: num(row.revenueH),
    returnsH: num(row.returnsH),
    cogsH: num(row.cogsH),
    goodsCostH: num(row.goodsCostH),
    serviceCostH: num(row.serviceCostH),
    grossProfitH: num(row.grossProfitH),
    grossMargin: row.grossMargin === null || row.grossMargin === undefined ? null : Number(row.grossMargin),
    expensesH: num(row.expensesH),
    expensesByAccount: (row.expensesByAccount ?? []).map((account) => ({
      accountCode: str(account.accountCode),
      nameAr: str(account.nameAr),
      nameEn: str(account.nameEn),
      name: str(account.name),
      amountH: num(account.amountH),
    })),
    cashH: num(row.cashH),
    receivableH: num(row.receivableH),
    payableH: num(row.payableH),
    prepaidH: num(row.prepaidH),
    cardClearingH: num(row.cardClearingH),
  };
}
