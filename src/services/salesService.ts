import { customerApi, salesApi } from './api';
import type { CreditNoteRow } from './api/salesApi';
import { invalidate } from './dataVersion';
import { num, str, toCustomer, toSale } from './mappers/saleMappers';
import type { ListQuery, Paginated } from '@/types';
import type {
  CreditNote,
  CustomerPayment,
  StatementEntry,
  StatementEntryKind,
  Customer,
  PaymentMethod,
  ReturnReason,
  Sale,
  SaleLine,
  SalePayment,
} from '@/types/sales';
import { buildStatement } from '@/types/sales';
import type { OrderType } from '@/types/kitchen';
import { HttpError } from './http';
import { utc } from './mappers/time';

/**
 * Sales service.
 *
 * `commit` is the one write in the application that changes several things at
 * once: it creates the sale, moves stock, and bills a credit customer. The
 * server does all of it in one transaction, which is why it is one call here —
 * no caller should be able to do half of it.
 */

export interface CommitSaleInput {
  /** Branch the sale is made at. Scopes the sale, its stock, and its ledger. */
  branchId?: string | null;
  /** Who performed the work, when the branch records it. Earns commission. */
  servedByUserId?: string | null;
  lines: SaleLine[];
  payments: SalePayment[];
  customerId: string | null;
  discountH: number;
  /**
   * The discount rule applied, if any. The commit procedure counts its usage,
   * so passing it is what makes a usage limit hold.
   */
  discountId?: string | null;
  /** Cash handed over. Null when nothing was tendered in cash. */
  tenderedH: number | null;
  /**
   * The approver of a discount above its threshold. The server answers 422
   * discount_approval_required, approver_not_allowed or approval_invalid
   * (fieldErrors.approverPassword) when this does not hold.
   */
  approvedByUserId?: string | null;
  approverPassword?: string | null;
  /** How the order is served; shown on the kitchen board. */
  orderType?: OrderType | null;
  /**
   * The signed-in user's display name. The server records the cashier from the
   * token; this only fills the receipt if the stored name comes back empty.
   */
  cashierName?: string;
}

export const salesService = {
  async commit(input: CommitSaleInput): Promise<Sale> {
    /*
     * One key for this attempt, generated before the first call.
     *
     * If the request times out, the retry below sends the SAME key and the
     * server returns the original sale rather than creating a second one.
     * Generating it per call would defeat the purpose entirely.
     */
    const idempotencyKey =
      globalThis.crypto?.randomUUID?.() ??
      `sal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const result = await salesApi.commit({
      idempotencyKey,
      branchId: input.branchId ?? '',
      customerId: input.customerId,
      servedByUserId: input.servedByUserId,
      discountId: input.discountId ?? null,
      discountH: input.discountH ?? 0,
      tenderedH: input.tenderedH,
      approvedByUserId: input.approvedByUserId ?? null,
      approverPassword: input.approverPassword ?? null,
      orderType: input.orderType ?? null,
      lines: input.lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitPriceH: line.unitPriceH,
        lineDiscountH: line.discountH ?? 0,
        note: null,
      })),
      payments: input.payments.map((payment) => ({
        method: payment.method,
        amountH: payment.amountH,
        reference: null,
      })),
    });

    /* Fetch the committed sale in full.
     *
     * The commit call returns only ids, and the caller needs a whole Sale —
     * the receipt reads its lines. Returning the header alone left `lines`
     * undefined, which surfaced as "Cannot read properties of undefined
     * (reading '0')" on the confirmation screen rather than as a clear error. */
    const committed = await salesApi.get(result.saleId);

    /* A sale moved stock, may have taken credit, and posted to the ledger.
       The cascade in dataVersion.ts turns this one call into all of them. */
    invalidate('sales');

    /* One mapper for both paths, so the commit result and the detail view
       cannot disagree about a sale's shape. */
    const header = committed.sale as Record<string, unknown>;
    const storedCashier = str(header.cashierName ?? header.CashierName);

    return toSale(
      {
        ...header,
        saleId: result.saleId,
        invoiceNumber: result.invoiceNumber,
        cashierName: storedCashier || input.cashierName || '',
        tenderedH: input.tenderedH ?? null,
      },
      committed.lines,
      committed.payments,
    );
  },

  async list(query?: ListQuery & { branchId?: string | null }): Promise<Paginated<Sale>> {
    const page = await salesApi.list({
      branchId: query?.branchId ?? undefined,
      search: query?.search,
      page: query?.page ?? 1,
      pageSize: query?.pageSize ?? 25,
    });

    /* Headers only. Fetching lines for every row of every page would be an
       N+1 the list does not need — the detail view fetches them. */
    return {
      items: page.items.map((row) => toSale(row)),
      page: page.page,
      pageSize: page.pageSize,
      total: page.totalCount,
    } as Paginated<Sale>;
  },

  async get(id: string): Promise<Sale> {
    /* The detail view needs lines and payments, so this is the one place
       they are fetched. */
    const detail = await salesApi.get(id);
    return toSale(detail.sale, detail.lines, detail.payments);
  },

  /**
   * Void a sale outright. Unlike a return this is a reversal: the invoice
   * should never have existed, so stock and balances go back in full and the
   * sale is excluded from revenue entirely.
   *
   * The server does the reversal and records who voided it from the token,
   * so no actor is passed.
   */
  async voidSale(id: string, reason: string): Promise<Sale> {
    /* Checked here as well as on the server, so the form can attach the
       message to the field rather than show a generic failure. */
    if (!reason.trim()) {
      throw new HttpError({
        status: 422,
        code: 'reason_required',
        message: 'A void needs a reason on the record.',
        fieldErrors: { reason: ['Explain why this sale is being voided.'] },
      });
    }

    await salesApi.void(id, reason.trim());

    /* Stock, the customer's balance and the ledger all moved back. */
    invalidate('sales');

    return salesService.get(id);
  },

  /**
   * Aggregates for the dashboard over a rolling window, with the equivalent
   * figure for the preceding window so a trend can be shown honestly.
   */
  async analytics(days: number, branchId?: string | null): Promise<{
    salesH: number;
    transactions: number;
    averageH: number;
    grossProfitH: number;
    previous: { salesH: number; transactions: number; averageH: number; grossProfitH: number };
    daily: { date: string; salesH: number }[];
    byMethod: { method: string; amountH: number }[];
    topItems: { itemId: string; nameAr: string; nameEn: string; quantity: number; revenueH: number }[];
  }> {
    const a = await salesApi.analytics({ branchId, days });

    /* Aggregated in SQL, so this only renames. Every figure goes through
       num(), because a period with no sales returns nulls the arithmetic
       downstream would turn into NaN. */
    return {
      salesH: num(a.current.salesH),
      transactions: num(a.current.transactions),
      averageH: num(a.current.averageH),
      grossProfitH: num(a.current.grossProfitH),
      previous: {
        salesH: num(a.previous.salesH),
        transactions: num(a.previous.transactions),
        averageH: num(a.previous.averageH),
        grossProfitH: num(a.previous.grossProfitH),
      },
      daily: a.daily.map((d) => ({
        date: String(d.date).slice(0, 10),
        salesH: num(d.salesH),
      })),
      byMethod: a.byMethod.map((m) => ({
        method: String(m.method),
        amountH: num(m.amountH),
      })),
      topItems: a.topItems.map((i) => ({
        itemId: String(i.itemId),
        nameAr: String(i.nameAr),
        nameEn: String(i.nameEn),
        quantity: num(i.quantity),
        revenueH: num(i.revenueH),
      })),
    };
  },

  /** Most recent invoices, for the dashboard feed. */
  async recent(limit = 5, branchId?: string | null): Promise<Sale[]> {
    const page = await salesApi.list({
      branchId: branchId ?? undefined, page: 1, pageSize: limit,
    });
    return page.items.map((row) => toSale(row));
  },

  /**
   * Headline figures for the last day, used by the POS strip and the dashboard.
   *
   * The analytics route works in rolling days, so this is the last 24 hours
   * rather than since midnight — close enough for a strip, and computed by the
   * same query as the dashboard so the two cannot disagree.
   */
  async todaySummary(
    branchId?: string | null,
  ): Promise<{ salesH: number; transactions: number; averageH: number }> {
    const a = await salesApi.analytics({ branchId, days: 1 });

    return {
      salesH: num(a.current.salesH),
      transactions: num(a.current.transactions),
      averageH: num(a.current.averageH),
    };
  },
};

export interface ReturnInput {
  saleId: string;
  /** Only lines with a quantity above zero are credited. */
  lines: { saleLineId: string; quantity: number }[];
  reason: ReturnReason;
  note: string;
  refundMethod: PaymentMethod;
}

function toCreditNote(row: CreditNoteRow): CreditNote {
  return {
    id: row.id,
    noteNumber: row.noteNumber,
    saleId: row.saleId,
    saleInvoiceNumber: row.saleInvoiceNumber,
    lines: (row.lines ?? []).map((line) => ({
      saleLineId: String(line.saleLineId),
      itemId: line.itemId,
      nameAr: line.nameAr,
      nameEn: line.nameEn,
      quantity: Number(line.quantity),
      unitPriceH: line.unitPriceH,
    })),
    reason: row.reason as ReturnReason,
    note: row.note ?? '',
    subtotalH: row.subtotalH,
    taxH: row.taxH,
    totalH: row.totalH,
    refundMethod: row.refundMethod as PaymentMethod,
    issuedBy: row.issuedBy ?? '',
    issuedAt: utc(row.issuedAt),
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

export const returnsService = {
  /** Credit notes already raised against a sale, newest first. */
  async notesFor(saleId: string): Promise<CreditNote[]> {
    return (await salesApi.returns(saleId)).map(toCreditNote);
  },

  /** What is still returnable on a sale, line by line (all zero if voided). */
  async remaining(saleId: string): Promise<Record<string, number>> {
    const remaining = await salesApi.returnsRemaining(saleId);
    return Object.fromEntries(
      Object.entries(remaining).map(([lineId, quantity]) => [lineId, Number(quantity)]),
    );
  },

  /**
   * Issue a credit note. In one transaction the server puts stock back,
   * refunds (or credits the customer's account), posts the reversal and marks
   * the sale returned or partially returned. Cash, card and bank refunds need
   * sales.refund as well as sales.return (else 403 refund_forbidden).
   */
  async issue(input: ReturnInput): Promise<CreditNote> {
    if (input.reason === 'other' && !input.note.trim()) {
      throw new HttpError({
        status: 422,
        code: 'note_required',
        message: 'Describe the reason when choosing "Other".',
        fieldErrors: { note: ['A short explanation is required.'] },
      });
    }

    const lines = input.lines.filter((entry) => entry.quantity > 0);

    if (lines.length === 0) {
      throw new HttpError({
        status: 422,
        code: 'nothing_to_return',
        message: 'Choose at least one item to return.',
      });
    }

    const note = await salesApi.issueReturn(input.saleId, {
      lines: lines.map((entry) => ({ saleLineId: entry.saleLineId, quantity: entry.quantity })),
      reason: input.reason,
      note: input.note.trim() || null,
      refundMethod: input.refundMethod,
    });

    /* Stock, the customer's balance and the ledger all moved. */
    invalidate('sales');

    return toCreditNote(note);
  },
};

export interface CustomerInput {
  nameAr: string;
  nameEn: string;
  phone: string;
  email: string;
  /** Credit ceiling in halalas. Zero means cash only. */
  creditLimitH: number;
  /** Balance the customer already owed before joining the system. */
  openingBalanceH: number;
}

export interface RecordPaymentInput {
  customerId: string;
  amountH: number;
  method: 'cash' | 'card';
  note: string;
  receivedBy: string;
}

/** The statement route's words for each entry kind, in the domain's words. */
const STATEMENT_KINDS: Record<string, StatementEntryKind> = {
  credit_sale: 'credit_sale',
  collection: 'payment',
  payment: 'payment',
  credit_note: 'credit_note',
};

export const customerService = {
  async list(): Promise<Customer[]> {
    /* The screens expect the whole list, not a page, so ask for a large one
       rather than changing a signature every caller relies on. */
    const page = await customerApi.list({ pageSize: 200 });
    return page.items.map(toCustomer);
  },

  async get(id: string): Promise<Customer> {
    return toCustomer(await customerApi.get(id));
  },

  async create(input: CustomerInput): Promise<Customer> {
    /* The server validates names and uniqueness and answers per field. An
       opening balance is not sent: there is no route that posts one, and a
       balance with no ledger entry behind it would not reconcile. */
    const created = await customerApi.create({
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      vatNumber: null,
      customerType: 'individual',
      creditLimitH: input.creditLimitH,
    });

    invalidate('customers');

    return customerService.get(created.customerId);
  },

  /**
   * Edit a customer. The server refuses a limit below what is owed
   * (422 limit_below_balance on creditLimitH).
   */
  async update(id: string, input: Omit<CustomerInput, 'openingBalanceH'>): Promise<Customer> {
    /* The route replaces the VAT number with what is sent and the form does
       not edit it, so the stored one is carried over rather than cleared. */
    const existing = await customerApi.get(id);

    const updated = await customerApi.update(id, {
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      vatNumber: str(existing.vatNumber ?? existing.VatNumber) || null,
      creditLimitH: input.creditLimitH,
    });

    invalidate('customers');
    return toCustomer(updated);
  },

  /** Take a payment against an outstanding balance. */
  async recordPayment(input: RecordPaymentInput): Promise<CustomerPayment> {
    /* Goes through the collection procedure, which reduces the balance and
       posts to the ledger in one transaction. Updating the balance alone
       would leave the books disagreeing with the customer's account. */
    const posted = await customerApi.collect(input.customerId, {
      amountH: input.amountH,
      method: input.method,
      /* The form collects a note, which is what the reference column is
         for here. No branch is captured, so the collection is recorded
         against the business rather than a branch. */
      reference: input.note.trim() || null,
      branchId: null,
    });

    invalidate('customers', 'ledger');

    const now = new Date().toISOString();

    return {
      id: posted.entryId,
      /* The route returns the journal entry only; its id is the receipt's
         reference on the customer statement. */
      receiptNumber: posted.entryId,
      customerId: input.customerId,
      amountH: input.amountH,
      method: input.method,
      note: input.note.trim(),
      receivedBy: input.receivedBy,
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  },

  /**
   * Full statement for a customer: credit sales and collections, in date
   * order with a running balance.
   */
  async statement(id: string): Promise<StatementEntry[]> {
    const rows = await customerApi.statement(id);

    /* The route returns entries signed from the customer's side already —
       positive owed, negative paid — so the running balance is a plain sum. */
    return buildStatement(
      rows.map((row) => ({
        id: str(row.id ?? row.Id),
        kind: STATEMENT_KINDS[str(row.kind ?? row.Kind)] ?? 'credit_sale',
        reference: str(row.reference ?? row.Reference),
        date: utc(str(row.occurredAtUtc ?? row.OccurredAtUtc)),
        amountH: num(row.amountH ?? row.AmountH),
      })),
    );
  },

  /** Aggregate figures for the receivables cards. */
  async receivablesSummary(period: { from?: string; to?: string } = {}): Promise<{
    outstandingH: number;
    withBalance: number;
    overLimit: number;
    collectedH: number;
  }> {
    try {
      const summary = await customerApi.receivablesSummary(period);
      return {
        outstandingH: summary.outstandingH,
        withBalance: summary.withBalance,
        overLimit: summary.overLimit,
        collectedH: summary.collectedH,
      };
    } catch (caught) {
      /* The summary route needs finance.view. Without it, the receivables
         rows carry the same figures (collections are lifetime there). */
      if (!(caught instanceof HttpError) || caught.status !== 403) throw caught;
    }

    const rows = await customerApi.receivables();

    return {
      outstandingH: rows.reduce((sum, r) => sum + num(r.balanceH), 0),
      withBalance: rows.filter((r) => num(r.balanceH) > 0).length,
      overLimit: rows.filter((r) => num(r.balanceH) > num(r.creditLimitH)).length,
      collectedH: rows.reduce((sum, r) => sum + num(r.collectedH), 0),
    };
  },
};
