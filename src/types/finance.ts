import type { ID, Timestamped } from './common';

/* ------------------------------------------------------------------ */
/* Chart of accounts                                                   */
/* ------------------------------------------------------------------ */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  code: string;
  type: AccountType;
  nameAr: string;
  nameEn: string;
}

/**
 * The chart of accounts.
 *
 * Deliberately small. Every operation the POS performs maps onto one of these,
 * and the detail that would otherwise justify a sprawl of sub-accounts lives as
 * a field on the transaction instead — an expense category, a customer id.
 */
export const ACCOUNTS: Record<string, Account> = {
  '1000': { code: '1000', type: 'asset', nameAr: 'الصندوق', nameEn: 'Cash' },
  '1100': { code: '1100', type: 'asset', nameAr: 'البنك', nameEn: 'Bank' },
  '1150': {
    code: '1150',
    type: 'asset',
    nameAr: 'متحصلات الشبكة تحت التحصيل',
    nameEn: 'Card clearing',
  },
  '1200': { code: '1200', type: 'asset', nameAr: 'المخزون', nameEn: 'Inventory' },
  '1300': { code: '1300', type: 'asset', nameAr: 'ضريبة المدخلات', nameEn: 'Input VAT' },
  '1400': {
    code: '1400',
    type: 'asset',
    nameAr: 'ذمم العملاء',
    nameEn: 'Accounts receivable',
  },
  /* Rent paid for a year sits here and releases monthly. */
  '1500': {
    code: '1500',
    type: 'asset',
    nameAr: 'مصروفات مدفوعة مقدمًا',
    nameEn: 'Prepaid expenses',
  },

  '2000': { code: '2000', type: 'liability', nameAr: 'الموردون', nameEn: 'Accounts payable' },
  '2050': {
    code: '2050',
    type: 'liability',
    nameAr: 'بضاعة مستلمة غير مفوترة',
    nameEn: 'Goods received not invoiced',
  },
  '2100': {
    code: '2100',
    type: 'liability',
    nameAr: 'ضريبة المخرجات',
    nameEn: 'Output VAT',
  },
  /* An expense recognised before it is paid. */
  '2200': {
    code: '2200',
    type: 'liability',
    nameAr: 'مصروفات مستحقة',
    nameEn: 'Accrued expenses',
  },
  '2300': {
    code: '2300',
    type: 'liability',
    nameAr: 'عمولات مستحقة للموظفين',
    nameEn: 'Commission payable',
  },

  '3000': { code: '3000', type: 'equity', nameAr: 'رأس مال المالك', nameEn: 'Owner capital' },
  '3200': {
    code: '3200',
    type: 'equity',
    nameAr: 'حساب جاري المالك',
    nameEn: 'Owner current account',
  },
  '3900': {
    code: '3900',
    type: 'equity',
    nameAr: 'تسوية الأرصدة الافتتاحية',
    nameEn: 'Opening balance suspense',
  },

  '4100': { code: '4100', type: 'revenue', nameAr: 'المبيعات', nameEn: 'Sales' },
  '4200': {
    code: '4200',
    type: 'revenue',
    nameAr: 'مردودات المبيعات',
    nameEn: 'Sales returns',
  },

  '5100': {
    code: '5100',
    type: 'expense',
    nameAr: 'تكلفة البضاعة المباعة',
    nameEn: 'Cost of goods sold',
  },
  '5200': {
    code: '5200',
    type: 'expense',
    nameAr: 'فروقات وتلف المخزون',
    nameEn: 'Stock variance',
  },
  '6000': {
    code: '6000',
    type: 'expense',
    nameAr: 'مصروفات تشغيلية',
    nameEn: 'Operating expenses',
  },
  '6100': {
    code: '6100',
    type: 'expense',
    nameAr: 'رسوم وعمولات الشبكة',
    nameEn: 'Card fees',
  },
  '6200': { code: '6200', type: 'expense', nameAr: 'الرواتب', nameEn: 'Salaries' },
  '6300': { code: '6300', type: 'expense', nameAr: 'العمولات', nameEn: 'Commissions' },
};

export const ACCOUNT_LIST: Account[] = Object.values(ACCOUNTS);

/** Assets and expenses grow on the debit side; everything else on the credit side. */
export function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

export type TransactionKind =
  | 'sale'
  | 'return'
  | 'void'
  | 'expense'
  | 'expense_recognition'
  | 'customer_collection'
  /** A customer's opening receivable, posted when they were created. */
  | 'customer_opening'
  | 'supplier_payment'
  | 'purchase'
  | 'card_settlement'
  | 'stock_adjustment'
  | 'owner_contribution'
  | 'owner_withdrawal'
  | 'payroll'
  | 'commission'
  | 'opening_balance'
  | 'manual';

/**
 * One side of an entry.
 *
 * A line is a debit **or** a credit, never both and never neither. Modelling
 * it as two nullable columns invites a line that is silently zero on both
 * sides and balances by accident.
 */
export interface JournalLine {
  accountCode: string;
  debitH: number;
  creditH: number;
  /** Free-text detail: the expense category, the customer, the item. */
  memo: string;
}

export interface JournalEntry extends Timestamped {
  id: ID;
  /** Sequential, human-readable: JE-1042. */
  reference: string;
  kind: TransactionKind;
  /** The document this came from — an invoice number, a receipt number. */
  sourceReference: string;
  description: string;
  postedAt: string;
  lines: JournalLine[];
  actor: string;
  branchId: ID | null;
  /** Set when this entry reverses another. */
  reversesEntryId: ID | null;
  reversedByEntryId: ID | null;
  /** The server's totals — present on list rows, which carry no lines. */
  totalDebitH?: number;
  totalCreditH?: number;
}

/** Totals for an entry. Used for display and for the balance check. */
export function entryTotals(entry: JournalEntry): { debitH: number; creditH: number } {
  if (entry.lines.length === 0 && entry.totalDebitH !== undefined) {
    return { debitH: entry.totalDebitH, creditH: entry.totalCreditH ?? 0 };
  }
  return entry.lines.reduce(
    (totals, line) => ({
      debitH: totals.debitH + line.debitH,
      creditH: totals.creditH + line.creditH,
    }),
    { debitH: 0, creditH: 0 },
  );
}

/**
 * Whether an entry is postable.
 *
 * Three rules, all of which have to hold: every line is one-sided, every
 * account exists, and the two sides are equal. An unbalanced entry is not a
 * warning to show later — it must never enter the ledger at all.
 */
export function validateEntry(lines: JournalLine[]): string | null {
  if (lines.length < 2) return 'An entry needs at least two lines.';

  for (const line of lines) {
    if (!ACCOUNTS[line.accountCode]) return `Unknown account ${line.accountCode}.`;
    if (line.debitH < 0 || line.creditH < 0) return 'Amounts cannot be negative.';
    if (line.debitH > 0 && line.creditH > 0) {
      return 'A line is either a debit or a credit, not both.';
    }
    if (line.debitH === 0 && line.creditH === 0) return 'A line cannot be zero on both sides.';
  }

  const debitH = lines.reduce((sum, line) => sum + line.debitH, 0);
  const creditH = lines.reduce((sum, line) => sum + line.creditH, 0);

  if (debitH !== creditH) {
    return `Entry does not balance: debits ${debitH} vs credits ${creditH}.`;
  }

  return null;
}

/** Flip every line, to reverse an entry rather than delete it. */
export function reverseLines(lines: JournalLine[]): JournalLine[] {
  return lines.map((line) => ({
    ...line,
    debitH: line.creditH,
    creditH: line.debitH,
  }));
}

/** Running balance for an account, in its natural direction. */
export function accountBalanceH(entries: JournalEntry[], accountCode: string): number {
  const account = ACCOUNTS[accountCode];
  if (!account) return 0;

  const raw = entries
    .flatMap((entry) => entry.lines)
    .filter((line) => line.accountCode === accountCode)
    .reduce((sum, line) => sum + line.debitH - line.creditH, 0);

  return isDebitNormal(account.type) ? raw : -raw;
}

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export interface ExpenseCategory extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  /** Which expense account this category posts to. */
  accountCode: string;
  status: 'active' | 'inactive';
}

/** How the cost is spread across time, independent of when it was paid. */
export type RecognitionMode = 'one_time' | 'monthly' | 'yearly' | 'custom';

export type ExpenseStatus = 'posted' | 'reversed';

export interface Expense extends Timestamped {
  id: ID;
  reference: string;
  categoryId: ID;
  /** VAT-inclusive amount paid, in halalas. */
  amountH: number;
  vatH: number;
  paymentMethod: 'cash' | 'card' | 'bank' | 'credit';
  /** When the money actually left. Drives the cash report. */
  paidOn: string;
  recognition: RecognitionMode;
  /** First month the cost belongs to. */
  periodStart: string;
  /** Last month the cost belongs to. */
  periodEnd: string;
  note: string;
  attachmentName: string | null;
  status: ExpenseStatus;
  actor: string;
  branchId: ID | null;
}

/** One month's share of an expense. */
export interface RecognitionSlice {
  /** YYYY-MM. */
  period: string;
  amountH: number;
}

/**
 * Spread an expense across the months it covers.
 *
 * The distinction that makes monthly profit meaningful: paying 120,000 of rent
 * on 1 January is one cash movement in January, but twelve recognitions of
 * 10,000. Reporting the whole cost in January would make January look
 * catastrophic and the other eleven months look better than they were.
 *
 * Rounding remainders land on the final month so the slices always sum back to
 * the amount paid — never a halala more or less.
 */
export function recogniseExpense(expense: Pick<
  Expense,
  'amountH' | 'recognition' | 'periodStart' | 'periodEnd' | 'paidOn'
>): RecognitionSlice[] {
  const net = expense.amountH;

  if (expense.recognition === 'one_time') {
    return [{ period: monthKey(expense.paidOn), amountH: net }];
  }

  const months = monthsBetween(expense.periodStart, expense.periodEnd);
  if (months.length === 0) return [{ period: monthKey(expense.paidOn), amountH: net }];

  const per = Math.floor(net / months.length);
  const slices = months.map((period) => ({ period, amountH: per }));

  const remainder = net - per * months.length;
  if (remainder !== 0) {
    slices[slices.length - 1].amountH += remainder;
  }

  return slices;
}

/** YYYY-MM for a date. */
export function monthKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 7);
}

/** Every month from start to end inclusive. */
export function monthsBetween(startIso: string, endIso: string): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < start) return [];

  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cursor <= last) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

/* ------------------------------------------------------------------ */
/* Cash drawer                                                         */
/* ------------------------------------------------------------------ */

export interface DrawerSession extends Timestamped {
  id: ID;
  branchId: ID | null;
  openedAt: string;
  closedAt: string | null;
  openingCashH: number;
  /** Counted at close. Null while the session is open. */
  countedCashH: number | null;
  /** What the ledger said should be there, frozen at close. Null while open. */
  expectedCashH: number | null;
  /** Counted minus expected: positive is over, negative is short. Null while open. */
  varianceH: number | null;
  openedBy: string;
  closedBy: string | null;
  note: string;
}

/**
 * What should physically be in the drawer.
 *
 * Only cash movements count. Card takings sit in clearing until the bank
 * settles them, and a credit sale never touches the drawer at all — including
 * either would make every count look short.
 */
export interface DrawerExpectation {
  openingCashH: number;
  cashSalesH: number;
  cashCollectionsH: number;
  ownerContributionsH: number;
  cashExpensesH: number;
  ownerWithdrawalsH: number;
  cashRefundsH: number;
  expectedH: number;
}

export function expectedDrawerH(parts: Omit<DrawerExpectation, 'expectedH'>): number {
  return (
    parts.openingCashH +
    parts.cashSalesH +
    parts.cashCollectionsH +
    parts.ownerContributionsH -
    parts.cashExpensesH -
    parts.ownerWithdrawalsH -
    parts.cashRefundsH
  );
}

/** Positive means over, negative means short. */
export function drawerVarianceH(expectedH: number, countedH: number): number {
  return countedH - expectedH;
}

/* ------------------------------------------------------------------ */
/* Card settlement                                                     */
/* ------------------------------------------------------------------ */

export interface CardSettlement extends Timestamped {
  id: ID;
  reference: string;
  /** Card takings this batch covers. */
  cardSalesH: number;
  /** What the bank actually deposited. */
  depositH: number;
  /** The difference, which is the network's fee. */
  feeH: number;
  settledOn: string;
  status: 'pending' | 'reconciled';
  note: string;
}

export function settlementFeeH(cardSalesH: number, depositH: number): number {
  return Math.max(0, cardSalesH - depositH);
}

/* ------------------------------------------------------------------ */
/* Recurring payments                                                  */
/* ------------------------------------------------------------------ */

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringPayment extends Timestamped {
  id: ID;
  description: string;
  categoryId: ID;
  amountH: number;
  frequency: Frequency;
  /** When the next instalment falls due. Recomputed after each payment. */
  nextDueOn: string;
  lastPaidOn: string | null;
  paymentMethod: 'cash' | 'card' | 'bank' | 'credit';
  status: 'active' | 'paused';
  note: string;
  branchId: ID | null;
}

/** Months in a given year, so month-end can be clamped correctly. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Move a due date forward by one interval.
 *
 * Month arithmetic clamps to the end of the target month rather than
 * overflowing. Rent due on the 31st must fall on 28 February, not skip
 * February and land on 3 March — which is what a naive `setMonth` does.
 */
export function advanceDueDate(from: string, frequency: Frequency): string {
  const date = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);

  if (frequency === 'daily' || frequency === 'weekly') {
    date.setUTCDate(date.getUTCDate() + (frequency === 'daily' ? 1 : 7));
    return date.toISOString().slice(0, 10);
  }

  const step = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;

  const day = date.getUTCDate();
  const targetMonthIndex = date.getUTCMonth() + step;
  const year = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;

  const clampedDay = Math.min(day, daysInMonth(year, month));

  return new Date(Date.UTC(year, month, clampedDay)).toISOString().slice(0, 10);
}

export type DueUrgency = 'normal' | 'soon' | 'today' | 'overdue';

/**
 * How pressing a payment is.
 *
 * Derived from the date every time it is read, so a payment that becomes
 * overdue overnight is red the moment anyone looks, with nothing to refresh.
 */
export function dueUrgency(dueOn: string, now: Date = new Date()): DueUrgency {
  const due = new Date(`${dueOn.slice(0, 10)}T00:00:00.000Z`);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 5) return 'soon';
  return 'normal';
}

export function daysUntil(dueOn: string, now: Date = new Date()): number {
  const due = new Date(`${dueOn.slice(0, 10)}T00:00:00.000Z`);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Cash the owner can actually spend.
 *
 * Cash on hand minus what is already committed within the horizon. This is
 * emphatically **not** profit — an owner who treats a healthy cash balance as
 * earnings and spends it will be short when the rent falls due, which is the
 * single most common way a profitable shop runs out of money.
 */
export function availableCashH(
  cashOnHandH: number,
  obligations: { amountH: number; dueOn: string }[],
  horizonDays = 30,
  now: Date = new Date(),
): { committedH: number; availableH: number } {
  const committedH = obligations
    .filter((obligation) => {
      const days = daysUntil(obligation.dueOn, now);
      /* Overdue commitments still have to be paid, so they count too. */
      return days <= horizonDays;
    })
    .reduce((sum, obligation) => sum + obligation.amountH, 0);

  return { committedH, availableH: cashOnHandH - committedH };
}

/* ------------------------------------------------------------------ */
/* Aging                                                               */
/* ------------------------------------------------------------------ */

export type AgeBucket = 'current' | 'd30' | 'd60' | 'd90';

/**
 * How old a debt is.
 *
 * Standard 30/60/90 buckets. The value of aging is that it separates "owed but
 * recent" from "owed and going stale" — a single outstanding total hides the
 * difference, and the difference is what decides who to chase.
 */
export function ageBucket(oldestIso: string, now: Date = new Date()): AgeBucket {
  const days = ageInDays(oldestIso, now);

  if (days <= 30) return 'current';
  if (days <= 60) return 'd30';
  if (days <= 90) return 'd60';
  return 'd90';
}

export function ageInDays(oldestIso: string, now: Date = new Date()): number {
  const then = new Date(oldestIso).getTime();
  /* No date known: not aged, rather than NaN days. */
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

export interface AgingRow {
  id: string;
  nameAr: string;
  nameEn: string;
  balanceH: number;
  /** When the oldest unsettled item was raised. */
  oldestIso: string | null;
  bucket: AgeBucket;
  ageDays: number;
}

/** Totals per bucket, for the summary strip. */
export function agingTotals(rows: AgingRow[]): Record<AgeBucket, number> {
  return rows.reduce(
    (totals, row) => ({ ...totals, [row.bucket]: totals[row.bucket] + row.balanceH }),
    { current: 0, d30: 0, d60: 0, d90: 0 } as Record<AgeBucket, number>,
  );
}

/* ------------------------------------------------------------------ */
/* Opening balances                                                    */
/* ------------------------------------------------------------------ */

/**
 * A balance period: one branch, from an opening position to a closing one.
 *
 * Modelled as a period rather than a single opening snapshot because the
 * question an owner asks is not "what did I start with" but "what did I start
 * with, what did I end with, and where did the difference go".
 */
export interface BalancePeriod extends Timestamped {
  id: ID;
  branchId: ID | null;
  label: string;
  openedOn: string;
  closedOn: string | null;
  opening: MethodBalances;
  /** Counted at close. Null while the period is open. */
  closing: MethodBalances | null;
  status: 'open' | 'closed';
  openedBy: string;
  closedBy: string | null;
  note: string;
}

/** Money split by where it sits, which is how an owner counts it. */
export interface MethodBalances {
  cashH: number;
  cardH: number;
  creditH: number;
  bankH: number;
  inventoryH: number;
  payablesH: number;
}

export const EMPTY_METHOD_BALANCES: MethodBalances = {
  cashH: 0,
  cardH: 0,
  creditH: 0,
  bankH: 0,
  inventoryH: 0,
  payablesH: 0,
};

/** Net worth of a position: what is held, less what is owed. */
export function methodTotalH(balances: MethodBalances): number {
  return (
    balances.cashH +
    balances.cardH +
    balances.creditH +
    balances.bankH +
    balances.inventoryH -
    balances.payablesH
  );
}

export type MethodKey = keyof MethodBalances;

export const METHOD_KEYS: MethodKey[] = [
  'cashH',
  'cardH',
  'creditH',
  'bankH',
  'inventoryH',
  'payablesH',
];

/**
 * The movement between two positions, line by line.
 *
 * Showing the difference per method rather than one net figure is the whole
 * point: a period that ends flat overall might have converted a pile of cash
 * into a pile of unpaid customer credit, which is not the same business.
 */
export function periodMovement(
  opening: MethodBalances,
  closing: MethodBalances,
): { key: MethodKey; openingH: number; closingH: number; deltaH: number }[] {
  return METHOD_KEYS.map((key) => ({
    key,
    openingH: opening[key],
    closingH: closing[key],
    deltaH: closing[key] - opening[key],
  }));
}

export interface OpeningBalances {
  cashH: number;
  bankH: number;
  inventoryH: number;
  receivablesH: number;
  payablesH: number;
  /** Net VAT position. Positive means owed to the authority. */
  vatH: number;
  asOf: string;
}

/**
 * Whether an opening position balances, and by how much.
 *
 * Assets minus liabilities is the owner's equity. Rather than demand the owner
 * work that figure out, whatever is left over is posted to the opening suspense
 * account — an honest placeholder that an accountant can reclassify later,
 * instead of blocking a shop from starting because it cannot state its capital.
 */
export function openingEquityH(balances: OpeningBalances): {
  assetsH: number;
  liabilitiesH: number;
  equityH: number;
} {
  const assetsH =
    balances.cashH + balances.bankH + balances.inventoryH + balances.receivablesH;
  const liabilitiesH = balances.payablesH + Math.max(0, balances.vatH);

  return { assetsH, liabilitiesH, equityH: assetsH - liabilitiesH };
}

/* ------------------------------------------------------------------ */
/* Payroll and commission                                              */
/* ------------------------------------------------------------------ */

export type CommissionBasis = 'percentage' | 'fixed';

export interface CommissionRule extends Timestamped {
  id: ID;
  /**
   * Who earns it. An empty list applies to everyone without their own rule.
   *
   * A list rather than one id because a rate usually belongs to a group — the
   * three barbers, the two stylists — and forcing one rule per person means
   * changing the rate is five edits and four chances to miss someone.
   */
  userIds: ID[];
  basis: CommissionBasis;
  /** Basis points of a percent (2000 = 20%), or halalas for a fixed rule. */
  value: number;
  /** Services this covers. Empty applies to every service they perform. */
  itemIds: ID[];
  status: 'active' | 'inactive';
}

/**
 * Commission earned on a line.
 *
 * Computed once, at the moment of sale, and stored. If the rule changes next
 * month the old sale keeps the figure it was earned at — recomputing history
 * from current rules would silently rewrite what people were owed.
 */
/**
 * How specific a rule is, for resolving conflicts.
 *
 * Named people beat "everyone"; named services beat "everything". Scoring it
 * rather than checking four cases in order means adding a dimension later does
 * not mean rewriting the resolver.
 */
export function ruleSpecificity(rule: CommissionRule): number {
  return (rule.userIds.length > 0 ? 2 : 0) + (rule.itemIds.length > 0 ? 1 : 0);
}

/** Whether a rule covers this person performing this service. */
export function ruleApplies(rule: CommissionRule, userId: ID, itemId: ID): boolean {
  if (rule.status !== 'active') return false;
  if (rule.userIds.length > 0 && !rule.userIds.includes(userId)) return false;
  if (rule.itemIds.length > 0 && !rule.itemIds.includes(itemId)) return false;
  return true;
}

export function commissionForH(rule: CommissionRule, lineGrossH: number): number {
  return rule.basis === 'percentage'
    ? Math.round((lineGrossH * rule.value) / 10_000)
    : rule.value;
}

export interface CommissionEntry extends Timestamped {
  id: ID;
  saleId: ID;
  invoiceNumber: string;
  userId: ID;
  itemId: ID;
  itemNameAr: string;
  itemNameEn: string;
  lineGrossH: number;
  /** Frozen at the time of sale. Never recomputed. */
  amountH: number;
  basis: CommissionBasis;
  rateAtSale: number;
  earnedAt: string;
  /** Set once paid out through payroll. */
  payrollRunId: ID | null;
}

export interface PayrollLine {
  userId: ID;
  nameAr: string;
  nameEn: string;
  baseSalaryH: number;
  commissionH: number;
  /** Added to pay on top of salary and commission (housing, transport, …). */
  allowancesH: number;
  deductionsH: number;
  netPayH: number;
}

export interface PayrollRun extends Timestamped {
  id: ID;
  reference: string;
  /** YYYY-MM the run covers. */
  period: string;
  lines: PayrollLine[];
  totalH: number;
  status: 'draft' | 'paid';
  paidOn: string | null;
  actor: string;
}

export function netPayH(line: Omit<PayrollLine, 'netPayH'>): number {
  return line.baseSalaryH + line.commissionH + line.allowancesH - line.deductionsH;
}
