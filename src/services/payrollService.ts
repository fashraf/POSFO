import { commissionRuleApi, financeApi, payrollApi, type ApiCommissionRule } from './api';
import { openingBalanceApi, type ApiOpeningBalances } from './api/financeApi';
import type { ApiCommissionEntry } from './api/salesApi';
import { num, str } from './mappers/saleMappers';
import { invalidate } from './dataVersion';
import type {
  CommissionEntry,
  CommissionRule,
  OpeningBalances,
  PayrollLine,
  PayrollRun,
} from '@/types/finance';
import { utc } from './mappers/time';
import { validationFailed } from './util';

/* ------------------------------------------------------------------ */
/* Opening balances                                                    */
/* ------------------------------------------------------------------ */

export type PostedOpeningBalances = OpeningBalances & {
  postedAt: string;
  actor: string;
  /** The journal entry; reverse it in the ledger to allow a new posting. */
  entryId: string | null;
};

function toPosted(response: ApiOpeningBalances): PostedOpeningBalances | null {
  if (!response.posted) return null;
  const current = response.current;

  return {
    cashH: response.cashH ?? current?.cashH ?? 0,
    bankH: response.bankH ?? current?.bankH ?? 0,
    inventoryH: response.inventoryH ?? current?.inventoryH ?? 0,
    receivablesH: response.receivablesH ?? current?.receivablesH ?? 0,
    payablesH: response.payablesH ?? current?.payablesH ?? 0,
    vatH: response.vatH ?? current?.vatH ?? 0,
    asOf: (response.asOf ?? current?.asOf ?? '').slice(0, 10),
    postedAt: utc(response.postedAt ?? current?.postedAt),
    actor: response.actor ?? current?.actor ?? '',
    entryId: response.entryId ?? current?.entryId ?? null,
  };
}

export const openingBalanceService = {
  /** The standing posting for the business (or one branch); null if none. */
  async get(branchId?: string | null): Promise<PostedOpeningBalances | null> {
    return toPosted(await openingBalanceApi.get(branchId));
  },

  /**
   * Post the starting position.
   *
   * Once only: opening balances are the line before which nothing is recorded,
   * and posting a second set would double every asset. Correcting one means
   * reversing the entry in the ledger, like any other mistake (the server
   * answers 409 already_posted otherwise). Whatever does not net out lands in
   * opening equity, so the entry balances.
   */
  async post(
    input: OpeningBalances & { branchId?: string | null },
  ): Promise<PostedOpeningBalances | null> {
    const negative = Object.entries(input).find(
      ([key, value]) => typeof value === 'number' && value < 0 && key !== 'vatH',
    );
    if (negative) {
      throw validationFailed({ [negative[0]]: ['Opening balances cannot be negative.'] });
    }

    const posted = await openingBalanceApi.post({
      branchId: input.branchId ?? null,
      asOf: input.asOf,
      cashH: input.cashH,
      bankH: input.bankH,
      inventoryH: input.inventoryH,
      receivablesH: input.receivablesH,
      payablesH: input.payablesH,
      vatH: input.vatH,
    });

    invalidate('ledger');
    return toPosted(posted);
  },
};

/* ------------------------------------------------------------------ */
/* Commission                                                          */
/* ------------------------------------------------------------------ */

function toRule(row: ApiCommissionRule): CommissionRule {
  return {
    id: row.id,
    userIds: row.userIds,
    basis: row.basis,
    value: row.value,
    itemIds: row.itemIds,
    status: row.status,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

function toRulePayload(input: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    userIds: input.userIds,
    basis: input.basis,
    value: input.value,
    itemIds: input.itemIds,
    status: input.status,
  };
}

function toCommissionEntry(row: ApiCommissionEntry): CommissionEntry {
  const earnedAt = utc(row.earnedAt);
  return {
    id: row.id,
    saleId: row.saleId,
    invoiceNumber: row.invoiceNumber,
    userId: row.userId,
    itemId: row.itemId,
    itemNameAr: row.itemNameAr,
    itemNameEn: row.itemNameEn,
    lineGrossH: row.lineGrossH,
    amountH: row.amountH,
    basis: row.basis,
    rateAtSale: row.rateAtSale,
    earnedAt,
    payrollRunId: row.payrollRunId ?? null,
    /* The entry is written once, at the sale, and never edited. */
    createdAt: earnedAt,
    updatedAt: earnedAt,
  };
}

/** Commission per employee for one month, as the server totals it. */
export interface CommissionSummary {
  userId: string;
  nameAr: string;
  nameEn: string;
  /** YYYY-MM. */
  period: string;
  /** Sale lines that earned commission. */
  saleLines: number;
  earnedH: number;
  /** Settled by a payroll run. */
  paidH: number;
  outstandingH: number;
}

export const commissionService = {
  async rules(): Promise<CommissionRule[]> {
    const rows = await commissionRuleApi.list();
    return rows.map(toRule);
  },

  async saveRule(input: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<CommissionRule> {
    const created = toRule(await commissionRuleApi.create(toRulePayload(input)));
    invalidate('commission');
    return created;
  },

  /* Editing a rule changes future sales only. Commission already earned was
     frozen at the moment of sale and the server leaves it alone. */
  async updateRule(
    id: string,
    input: Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CommissionRule> {
    const updated = toRule(await commissionRuleApi.update(id, toRulePayload(input)));
    invalidate('commission');
    return updated;
  },

  async removeRule(id: string): Promise<void> {
    await commissionRuleApi.remove(id);
    invalidate('commission');
  },

  /**
   * The frozen commission lines behind the totals — one per sale line that
   * earned, with the rate that applied at the time.
   */
  async entries(query: {
    userId?: string;
    period?: string;
    saleId?: string;
    branchId?: string | null;
    paid?: boolean;
  } = {}): Promise<CommissionEntry[]> {
    const rows = await financeApi.commissionEntries({
      userId: query.userId,
      month: query.period,
      saleId: query.saleId,
      branchId: query.branchId,
      paid: query.paid,
    });
    return rows.map(toCommissionEntry);
  },

  /**
   * Commission earned per employee, optionally for one person or month.
   *
   * Totals; `entries` has the sale lines behind each figure.
   */
  async list(userId?: string, period?: string): Promise<CommissionSummary[]> {
    const rows = await financeApi.commission({ userId, month: period });

    return rows.map((row) => ({
      userId: str(row.userId),
      nameAr: str(row.nameAr),
      nameEn: str(row.nameEn),
      period: str(row.periodMonth),
      saleLines: num(row.saleLines),
      earnedH: num(row.earnedH),
      paidH: num(row.paidH),
      outstandingH: num(row.outstandingH),
    }));
  },
};

/* ------------------------------------------------------------------ */
/* Payroll                                                             */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

function toPayrollLine(row: Row): PayrollLine {
  return {
    userId: str(row.userId),
    nameAr: str(row.nameAr),
    nameEn: str(row.nameEn),
    baseSalaryH: num(row.baseSalaryH),
    commissionH: num(row.commissionH),
    allowancesH: num(row.allowancesH),
    deductionsH: num(row.deductionsH),
    netPayH: num(row.netPayH),
  };
}

function toPayrollRun(run: Row, lines: Row[]): PayrollRun {
  return {
    id: str(run.runId),
    reference: str(run.reference),
    period: str(run.periodMonth),
    lines: lines.map(toPayrollLine),
    totalH: num(run.totalH),
    /* "approved" is a server state with no screen of its own; until paid it
       is still a draft as far as anyone here is concerned. */
    status: str(run.status) === 'paid' ? 'paid' : 'draft',
    paidOn: run.paidOn ? str(run.paidOn).slice(0, 10) : null,
    actor: str(run.updatedBy ?? run.createdBy, 'System'),
    createdAt: utc(str(run.createdAtUtc ?? run.createdAt)),
    updatedAt: utc(str(run.updatedAtUtc ?? run.updatedAt)),
  };
}

export const payrollService = {
  /** Every run, newest period first, with its lines. */
  async list(branchId?: string | null): Promise<PayrollRun[]> {
    const rows = await payrollApi.runs(branchId ?? null);
    /* The list route carries totals only; the screens count heads and split
       salary from commission, so read each run. Runs are monthly, so this
       stays a handful of requests. */
    return Promise.all(rows.map((row) => payrollService.get(str(row.runId))));
  },

  async get(runId: string): Promise<PayrollRun> {
    const { run, lines } = await payrollApi.run(runId);
    return toPayrollRun(run, lines);
  },

  /**
   * Build a draft for a period.
   *
   * The server takes each active employee's base salary from their record and
   * commission from what was actually frozen at each sale, not recalculated —
   * which is the whole reason it was frozen. Re-drafting replaces any earlier
   * draft for the same period.
   */
  async draft(input: { period: string; branchId?: string | null }): Promise<PayrollRun> {
    const drafted = await payrollApi.draft(input.period, input.branchId ?? null);
    return payrollService.get(drafted.runId);
  },

  /**
   * Save any edits to the lines, then pay the run: salaries and commission
   * become an expense and cash goes out.
   */
  async pay(input: { runId: string; lines: PayrollLine[]; paidOn: string }): Promise<PayrollRun> {
    for (const line of input.lines) {
      await payrollApi.updateLine(input.runId, line.userId, {
        baseSalaryH: line.baseSalaryH,
        allowancesH: line.allowancesH,
        deductionsH: line.deductionsH,
      });
    }

    await payrollApi.pay(input.runId, input.paidOn);
    /* Paying settles the commission it covers, as well as posting. */
    invalidate('ledger', 'commission');

    return payrollService.get(input.runId);
  },
};
