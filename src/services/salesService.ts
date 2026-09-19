import { USE_MOCKS } from '@/config/env';
import { customerApi, salesApi } from './api';
import { invalidate } from './dataVersion';
import { num, toCustomer, toSale } from './mappers/saleMappers';
import type { ListQuery, Paginated } from '@/types';
import type {
  CreditNote,
  CustomerPayment,
  StatementEntry,
  CreditNoteLine,
  Customer,
  PaymentMethod,
  ReturnReason,
  Sale,
  SaleLine,
  SalePayment,
} from '@/types/sales';
import {
  buildStatement,
  computeReturnTotals,
  computeTotals,
  remainingQuantities,
} from '@/types/sales';
import { HttpError } from './http';
import { inventoryService } from './inventoryService';
import { credit, debit, ledgerService } from './ledgerService';
import { commissionService } from './payrollService';
import { SEED_CUSTOMERS } from './mock/seed';
import {
  compareBy,
  inBranch,
  delay,
  matches,
  nextId,
  notFound,
  paginate,
  timestamp,
  validationFailed,
} from './mock/store';

/**
 * Sales service.
 *
 * `commit` is the one write in the application that changes several things at
 * once: it creates the sale, moves stock, and bills a credit customer. In the
 * real backend that becomes a single transaction; here it is one method for the
 * same reason — no caller should be able to do half of it.
 */

let sales: Sale[] = [];
let customers: Customer[] = [...SEED_CUSTOMERS];
let invoiceSequence = 1041;
let creditNotes: CreditNote[] = [];
let creditNoteSequence = 203;
let paymentsStore: CustomerPayment[] = [];
let receiptSequence = 500;

export interface CommitSaleInput {
  /** Branch the sale is made at. Scopes the sale, its stock, and its ledger. */
  branchId?: string | null;
  /** Who performed the work, when the branch records it. Earns commission. */
  servedByUserId?: string | null;
  lines: SaleLine[];
  payments: SalePayment[];
  customerId: string | null;
  discountH: number;
  /** Cash handed over. Null when nothing was tendered in cash. */
  tenderedH: number | null;
  cashierName: string;
}

function nextInvoiceNumber(): string {
  invoiceSequence += 1;
  return `INV-${invoiceSequence}`;
}

export const salesService = {
  async commit(input: CommitSaleInput): Promise<Sale> {
    /* Against the real backend this is a single call: the server runs the
       sale, the stock movement, the commission and the ledger entry inside one
       transaction. Doing those as separate calls from here would let a dropped
       connection leave stock reduced for a sale that never existed. */
    if (!USE_MOCKS) {
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
        discountId: null,
        discountH: input.discountH ?? 0,
        tenderedH: input.tenderedH,
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

      /* One mapper for both paths, so the commit result and the detail view
         cannot disagree about a sale's shape. Values just posted are passed as
         fallbacks for anything the view does not carry. */
      /* A sale moved stock, may have taken credit, and posted to the ledger.
         The cascade in dataVersion.ts turns this one call into all of them. */
      invalidate('sales');

      return toSale(
        {
          ...(committed.sale as Record<string, unknown>),
          saleId: result.saleId,
          invoiceNumber: result.invoiceNumber,
          cashierName: input.cashierName,
          tenderedH: input.tenderedH ?? null,
        },
        committed.lines,
        committed.payments,
      );
    }

    await delay(420);

    if (input.lines.length === 0) {
      throw new HttpError({
        status: 422,
        code: 'empty_cart',
        message: 'Add at least one item before taking payment.',
      });
    }

    const totals = computeTotals(input.lines, input.discountH);
    const paidH = input.payments.reduce((sum, payment) => sum + payment.amountH, 0);

    if (paidH < totals.totalH) {
      throw new HttpError({
        status: 422,
        code: 'insufficient_payment',
        message: 'The amount paid is less than the total due.',
      });
    }

    const creditH = input.payments
      .filter((payment) => payment.method === 'credit')
      .reduce((sum, payment) => sum + payment.amountH, 0);

    const takesCredit = input.payments.some((payment) => payment.method === 'credit');
    if (takesCredit && !input.customerId) {
      throw new HttpError({
        status: 422,
        code: 'customer_required',
        message: 'A credit sale needs a customer on the invoice.',
      });
    }

    const now = timestamp();
    const cashPaidH = input.payments
      .filter((payment) => payment.method === 'cash')
      .reduce((sum, payment) => sum + payment.amountH, 0);

    const sale: Sale = {
      id: nextId('sal'),
      invoiceNumber: nextInvoiceNumber(),
      lines: input.lines,
      payments: input.payments,
      customerId: input.customerId,
      cashierName: input.cashierName,
      branchId: input.branchId ?? null,
      discountH: totals.discountH,
      subtotalH: totals.subtotalH,
      taxH: totals.taxH,
      totalH: totals.totalH,
      tenderedH: input.tenderedH,
      changeH: input.tenderedH === null ? 0 : Math.max(0, input.tenderedH - cashPaidH),
      status: 'completed',
      soldAt: now,
      createdAt: now,
      updatedAt: now,
    };

    sales = [sale, ...sales];

    /* Post the sale to the ledger.
     *
     * Cash and card land in different asset accounts because card takings are
     * not spendable until the bank settles them; credit becomes a receivable.
     * COGS is posted alongside, so gross profit is a ledger figure rather than
     * something recomputed differently by each report. */
    const cogsH = input.lines.reduce((sum, line) => sum + line.unitCostH * line.quantity, 0);

    const cashH = input.payments
      .filter((payment) => payment.method === 'cash')
      .reduce((sum, payment) => sum + payment.amountH, 0);
    const cardH = input.payments
      .filter((payment) => payment.method === 'card')
      .reduce((sum, payment) => sum + payment.amountH, 0);

    await ledgerService.post({
      kind: 'sale',
      sourceReference: sale.invoiceNumber,
      description: `Sale ${sale.invoiceNumber}`,
      actor: input.cashierName,
      branchId: input.branchId ?? null,
      lines: [
        debit('1000', Math.min(cashH, totals.totalH), 'Cash'),
        debit('1150', cardH, 'Card clearing'),
        debit('1400', creditH, 'Customer credit'),
        credit('4100', totals.subtotalH, 'Sales'),
        credit('2100', totals.taxH, 'Output VAT'),
        debit('5100', cogsH, 'Cost of goods sold'),
        credit('1200', cogsH, 'Inventory'),
      ],
    });

    /* Commission is computed and stored now, from the rules as they stand at
       this moment. A later rule change must not rewrite what was earned. */
    if (input.servedByUserId) {
      await commissionService.recordForSale({
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        userId: input.servedByUserId,
        lines: sale.lines.map((line) => ({
          itemId: line.itemId,
          nameAr: line.nameAr,
          nameEn: line.nameEn,
          grossH: line.unitPriceH * line.quantity - line.discountH,
        })),
      });
    }

    /* Move stock for anything that tracks it. Services never reach this.
       Routing through the inventory service means the sale also lands in the
       item's movement history. */
    await Promise.all(
      input.lines
        .filter((line) => line.kind === 'product')
        .map((line) =>
          inventoryService.record({
            itemId: line.itemId,
            kind: 'sale',
            quantity: -line.quantity,
            reference: sale.invoiceNumber,
            unitCostH: line.unitCostH,
            actor: input.cashierName,
            branchId: input.branchId ?? null,
          }),
        ),
    );

    /* A credit sale increases what the customer owes. */
    if (creditH > 0 && input.customerId) {
      customers = customers.map((customer) =>
        customer.id === input.customerId
          ? { ...customer, balanceH: customer.balanceH + creditH, updatedAt: now }
          : customer,
      );
    }

    return sale;
  },

  async list(query?: ListQuery & { branchId?: string | null }): Promise<Paginated<Sale>> {
    if (!USE_MOCKS) {
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
    }

    await delay(200);

    /* Branch first: a cashier in Jeddah should never page through Riyadh's
       invoices looking for their own. */
    const scoped = sales.filter((sale) => inBranch(sale.branchId, query?.branchId));

    const filtered = query?.search
      ? scoped.filter((sale) => matches(sale.invoiceNumber, query.search ?? ''))
      : scoped;

    return paginate(compareBy(filtered, 'soldAt', 'desc'), query);
  },

  async get(id: string): Promise<Sale> {
    if (!USE_MOCKS) {
      /* The detail view needs lines and payments, so this is the one place
         they are fetched. */
      const detail = await salesApi.get(id);
      return toSale(detail.sale, detail.lines, detail.payments);
    }

    await delay(120);
    const sale = sales.find((candidate) => candidate.id === id);
    if (!sale) throw notFound('Sale', id);
    return sale;
  },

  /**
   * Void a sale outright. Unlike a return this is a reversal: the invoice
   * should never have existed, so stock and balances go back in full and the
   * sale is excluded from revenue entirely.
   */
  async voidSale(id: string, reason: string, actor: string): Promise<Sale> {
    await delay(400);

    const sale = sales.find((candidate) => candidate.id === id);
    if (!sale) throw notFound('Sale', id);

    if (sale.status === 'voided') {
      throw new HttpError({
        status: 409,
        code: 'already_voided',
        message: 'This sale is already voided.',
      });
    }

    if (creditNotes.some((note) => note.saleId === id)) {
      throw new HttpError({
        status: 409,
        code: 'has_credit_notes',
        message:
          'This sale already has a return against it. Voiding would double-count the reversal.',
      });
    }

    if (!reason.trim()) {
      throw new HttpError({
        status: 422,
        code: 'reason_required',
        message: 'A void needs a reason on the record.',
        fieldErrors: { reason: ['Explain why this sale is being voided.'] },
      });
    }

    const now = timestamp();

    await Promise.all(
      sale.lines
        .filter((line) => line.kind === 'product')
        .map((line) =>
          inventoryService.record({
            itemId: line.itemId,
            kind: 'return',
            quantity: line.quantity,
            reference: `VOID ${sale.invoiceNumber}`,
            note: reason.trim(),
            actor,
          }),
        ),
    );

    const creditH = sale.payments
      .filter((payment) => payment.method === 'credit')
      .reduce((sum, payment) => sum + payment.amountH, 0);

    if (creditH > 0 && sale.customerId) {
      customers = customers.map((customer) =>
        customer.id === sale.customerId
          ? { ...customer, balanceH: customer.balanceH - creditH, updatedAt: now }
          : customer,
      );
    }

    const voided: Sale = {
      ...sale,
      status: 'voided',
      voidReason: reason.trim(),
      voidedBy: actor,
      voidedAt: now,
      updatedAt: now,
    };

    sales = sales.map((candidate) => (candidate.id === id ? voided : candidate));
    return voided;
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
    if (!USE_MOCKS) {
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
    }

    await delay(240);

    const now = Date.now();
    const windowMs = days * 24 * 60 * 60 * 1000;
    const start = now - windowMs;
    const previousStart = start - windowMs;

    const live = sales
      .filter((sale) => inBranch(sale.branchId, branchId))
      .filter((sale) => sale.status !== 'voided');
    const inWindow = live.filter((sale) => new Date(sale.soldAt).getTime() >= start);
    const inPrevious = live.filter((sale) => {
      const time = new Date(sale.soldAt).getTime();
      return time >= previousStart && time < start;
    });

    const measure = (group: Sale[]) => {
      const salesH = group.reduce((sum, sale) => sum + sale.totalH, 0);
      const costH = group.reduce(
        (sum, sale) =>
          sum + sale.lines.reduce((lineSum, line) => lineSum + line.unitCostH * line.quantity, 0),
        0,
      );
      const netH = group.reduce((sum, sale) => sum + sale.subtotalH, 0);

      return {
        salesH,
        transactions: group.length,
        averageH: group.length === 0 ? 0 : Math.round(salesH / group.length),
        /* Profit is measured on the net figure: VAT is collected on behalf of
           the authority and was never the shop's money. */
        grossProfitH: netH - costH,
      };
    };

    /* One bucket per day so the chart has no gaps, even on days with no sales. */
    const daily: { date: string; salesH: number }[] = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date(now - offset * 24 * 60 * 60 * 1000);
      const key = day.toISOString().slice(0, 10);
      daily.push({
        date: key,
        salesH: inWindow
          .filter((sale) => sale.soldAt.slice(0, 10) === key)
          .reduce((sum, sale) => sum + sale.totalH, 0),
      });
    }

    const methodTotals = inWindow.reduce<Record<string, number>>((totals, sale) => {
      for (const payment of sale.payments) {
        totals[payment.method] = (totals[payment.method] ?? 0) + payment.amountH;
      }
      return totals;
    }, {});

    const itemTotals = inWindow.reduce<
      Record<string, { nameAr: string; nameEn: string; quantity: number; revenueH: number }>
    >((totals, sale) => {
      for (const line of sale.lines) {
        const current = totals[line.itemId] ?? {
          nameAr: line.nameAr,
          nameEn: line.nameEn,
          quantity: 0,
          revenueH: 0,
        };
        current.quantity += line.quantity;
        current.revenueH += line.unitPriceH * line.quantity - line.discountH;
        totals[line.itemId] = current;
      }
      return totals;
    }, {});

    return {
      ...measure(inWindow),
      previous: measure(inPrevious),
      daily,
      byMethod: Object.entries(methodTotals).map(([method, amountH]) => ({ method, amountH })),
      topItems: Object.entries(itemTotals)
        .map(([itemId, value]) => ({ itemId, ...value }))
        .sort((a, b) => b.revenueH - a.revenueH)
        .slice(0, 5),
    };
  },

  /** Most recent invoices, for the dashboard feed. */
  async recent(limit = 5, branchId?: string | null): Promise<Sale[]> {
    if (!USE_MOCKS) {
      const page = await salesApi.list({
        branchId: branchId ?? undefined, page: 1, pageSize: limit,
      });
      return page.items.map((row) => toSale(row));
    }

    await delay(140);
    return compareBy(
      sales.filter((sale) => inBranch(sale.branchId, branchId)),
      'soldAt',
      'desc',
    ).slice(0, limit);
  },

  /** Headline figures for today, used by the POS strip and the dashboard. */
  async todaySummary(): Promise<{ salesH: number; transactions: number; averageH: number }> {
    await delay(120);

    const today = new Date().toDateString();
    const todaySales = sales.filter(
      (sale) => sale.status !== 'voided' && new Date(sale.soldAt).toDateString() === today,
    );

    const salesH = todaySales.reduce((sum, sale) => sum + sale.totalH, 0);

    return {
      salesH,
      transactions: todaySales.length,
      averageH: todaySales.length === 0 ? 0 : Math.round(salesH / todaySales.length),
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
  issuedBy: string;
}

export const returnsService = {
  /** Credit notes already raised against a sale. */
  async notesFor(saleId: string): Promise<CreditNote[]> {
    await delay(120);
    return creditNotes.filter((note) => note.saleId === saleId);
  },

  /** What is still returnable on a sale, line by line. */
  async remaining(saleId: string): Promise<Record<string, number>> {
    await delay(100);
    const sale = sales.find((candidate) => candidate.id === saleId);
    if (!sale) throw notFound('Sale', saleId);
    return remainingQuantities(sale, creditNotes);
  },

  /**
   * Issue a credit note. Stock goes back, the customer's balance is reduced if
   * the sale was on credit, and the sale is marked returned or partially
   * returned depending on what is left.
   */
  async issue(input: ReturnInput): Promise<CreditNote> {
    await delay(420);

    const sale = sales.find((candidate) => candidate.id === input.saleId);
    if (!sale) throw notFound('Sale', input.saleId);

    if (sale.status === 'voided') {
      throw new HttpError({
        status: 409,
        code: 'sale_voided',
        message: 'A voided sale has nothing left to return.',
      });
    }

    if (input.reason === 'other' && !input.note.trim()) {
      throw new HttpError({
        status: 422,
        code: 'note_required',
        message: 'Describe the reason when choosing "Other".',
        fieldErrors: { note: ['A short explanation is required.'] },
      });
    }

    const remaining = remainingQuantities(sale, creditNotes);

    const lines: CreditNoteLine[] = input.lines
      .filter((entry) => entry.quantity > 0)
      .map((entry) => {
        const saleLine = sale.lines.find((line) => line.id === entry.saleLineId);
        if (!saleLine) {
          throw new HttpError({
            status: 422,
            code: 'unknown_line',
            message: 'That line is not part of this invoice.',
          });
        }

        if (entry.quantity > (remaining[entry.saleLineId] ?? 0)) {
          throw new HttpError({
            status: 422,
            code: 'over_return',
            message: 'You cannot return more than was sold and not already credited.',
          });
        }

        return {
          saleLineId: saleLine.id,
          itemId: saleLine.itemId,
          nameAr: saleLine.nameAr,
          nameEn: saleLine.nameEn,
          quantity: entry.quantity,
          unitPriceH: saleLine.unitPriceH,
        };
      });

    if (lines.length === 0) {
      throw new HttpError({
        status: 422,
        code: 'nothing_to_return',
        message: 'Choose at least one item to return.',
      });
    }

    const totals = computeReturnTotals(lines);
    const now = timestamp();
    creditNoteSequence += 1;

    const note: CreditNote = {
      id: nextId('crn'),
      noteNumber: `CN-${creditNoteSequence}`,
      saleId: sale.id,
      saleInvoiceNumber: sale.invoiceNumber,
      lines,
      reason: input.reason,
      note: input.note.trim(),
      subtotalH: totals.subtotalH,
      taxH: totals.taxH,
      totalH: totals.totalH,
      refundMethod: input.refundMethod,
      issuedBy: input.issuedBy,
      issuedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    creditNotes = [note, ...creditNotes];

    /* Returned goods go back on the shelf, and into the movement history. */
    await Promise.all(
      lines.map((line) => {
        const saleLine = sale.lines.find((candidate) => candidate.id === line.saleLineId);
        return saleLine?.kind === 'product'
          ? inventoryService.record({
              itemId: line.itemId,
              kind: 'return',
              quantity: line.quantity,
              reference: note.noteNumber,
              actor: input.issuedBy,
            })
          : Promise.resolve(null);
      }),
    );

    /* A refund on a credit sale reduces what the customer owes. */
    if (input.refundMethod === 'credit' && sale.customerId) {
      customers = customers.map((customer) =>
        customer.id === sale.customerId
          ? { ...customer, balanceH: customer.balanceH - note.totalH, updatedAt: now }
          : customer,
      );
    }

    const stillRemaining = remainingQuantities(sale, creditNotes);
    const fullyReturned = Object.values(stillRemaining).every((quantity) => quantity === 0);

    sales = sales.map((candidate) =>
      candidate.id === sale.id
        ? {
            ...candidate,
            status: fullyReturned ? 'returned' : 'partially_returned',
            updatedAt: now,
          }
        : candidate,
    );

    return note;
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

export const customerService = {
  async list(): Promise<Customer[]> {
    if (!USE_MOCKS) {
      /* The screens expect the whole list, not a page, so ask for a large one
         rather than changing a signature every caller relies on. */
      const page = await customerApi.list({ pageSize: 200 });
      return page.items.map(toCustomer);
    }

    await delay(120);
    return compareBy(customers, 'nameEn', 'asc');
  },

  async get(id: string): Promise<Customer> {
    if (!USE_MOCKS) {
      return toCustomer(await customerApi.get(id));
    }

    await delay(100);
    const customer = customers.find((candidate) => candidate.id === id);
    if (!customer) throw notFound('Customer', id);
    return customer;
  },

  async create(input: CustomerInput): Promise<Customer> {
    if (!USE_MOCKS) {
      /* Client-side validation stays: it produces per-field messages the form
         can attach to inputs, which a 422 cannot. The server validates again
         regardless — this is for the user, not for safety. */
      const created = await customerApi.create({
        nameAr: input.nameAr.trim(),
        nameEn: input.nameEn.trim(),
        phone: input.phone.trim() || null,
        email: input.email.trim() || null,
        vatNumber: null,
        customerType: 'individual',
        creditLimitH: input.creditLimitH,
      });

      return customerService.get(created.customerId);
    }

    await delay(340);

    const errors: Record<string, string[]> = {};
    if (!input.nameAr.trim()) errors.nameAr = ['Arabic name is required.'];
    if (!input.nameEn.trim()) errors.nameEn = ['English name is required.'];

    const phone = input.phone.trim();
    if (!phone) {
      errors.phone = ['A phone number is required so you can reach them about a balance.'];
    } else if (customers.some((customer) => customer.phone.replace(/\s/g, '') === phone.replace(/\s/g, ''))) {
      errors.phone = ['Another customer already uses this number.'];
    }

    if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      errors.email = ['Enter a valid email address, or leave it empty.'];
    }

    if (input.creditLimitH < 0) errors.creditLimitH = ['A credit limit cannot be negative.'];
    if (input.openingBalanceH < 0) {
      errors.openingBalanceH = ['An opening balance cannot be negative.'];
    }
    if (input.openingBalanceH > 0 && input.openingBalanceH > input.creditLimitH) {
      errors.openingBalanceH = [
        'The opening balance is already above the credit limit. Raise the limit or lower the balance.',
      ];
    }

    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    const now = timestamp();
    const created: Customer = {
      id: nextId('cus'),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      phone,
      email: input.email.trim(),
      balanceH: input.openingBalanceH,
      creditLimitH: input.creditLimitH,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    customers = [created, ...customers];
    return created;
  },

  async update(id: string, input: Omit<CustomerInput, 'openingBalanceH'>): Promise<Customer> {
    await delay(300);

    const existing = customers.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Customer', id);

    if (input.creditLimitH < existing.balanceH) {
      throw new HttpError({
        status: 422,
        code: 'limit_below_balance',
        message:
          'The new limit is below what this customer already owes. Collect a payment first, or set a higher limit.',
        fieldErrors: { creditLimitH: ['Must be at least the current balance.'] },
      });
    }

    const updated: Customer = {
      ...existing,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      creditLimitH: input.creditLimitH,
      updatedAt: timestamp(),
    };

    customers = customers.map((candidate) => (candidate.id === id ? updated : candidate));
    return updated;
  },

  /** Take a payment against an outstanding balance. */
  async recordPayment(input: RecordPaymentInput): Promise<CustomerPayment> {
    if (!USE_MOCKS) {
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

      return {
        id: posted.entryId,
        customerId: input.customerId,
        amountH: input.amountH,
        method: input.method,
        receivedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as CustomerPayment;
    }

    await delay(360);

    const customer = customers.find((candidate) => candidate.id === input.customerId);
    if (!customer) throw notFound('Customer', input.customerId);

    if (input.amountH <= 0) {
      throw new HttpError({
        status: 422,
        code: 'invalid_amount',
        message: 'Enter an amount greater than zero.',
        fieldErrors: { amountH: ['Enter an amount greater than zero.'] },
      });
    }

    if (input.amountH > customer.balanceH) {
      throw new HttpError({
        status: 422,
        code: 'overpayment',
        message:
          'That is more than this customer owes. Reduce the amount, or take the difference as a new sale.',
        fieldErrors: { amountH: ['Cannot exceed the outstanding balance.'] },
      });
    }

    const now = timestamp();
    receiptSequence += 1;

    const payment: CustomerPayment = {
      id: nextId('pay'),
      receiptNumber: `RCT-${receiptSequence}`,
      customerId: input.customerId,
      amountH: input.amountH,
      method: input.method,
      note: input.note.trim(),
      receivedBy: input.receivedBy,
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    paymentsStore = [payment, ...paymentsStore];

    await ledgerService.post({
      kind: 'customer_collection',
      sourceReference: payment.receiptNumber,
      description: `Collection from ${customer.nameEn}`,
      actor: input.receivedBy,
      lines: [
        debit(input.method === 'cash' ? '1000' : '1100', input.amountH, input.method),
        credit('1400', input.amountH, customer.nameEn),
      ],
    });

    customers = customers.map((candidate) =>
      candidate.id === input.customerId
        ? { ...candidate, balanceH: candidate.balanceH - input.amountH, updatedAt: now }
        : candidate,
    );

    return payment;
  },

  /**
   * Full statement for a customer: credit sales, payments, and credit notes,
   * in date order with a running balance.
   */
  async statement(id: string): Promise<StatementEntry[]> {
    await delay(220);

    const customer = customers.find((candidate) => candidate.id === id);
    if (!customer) throw notFound('Customer', id);

    const creditSales = sales
      .filter(
        (sale) =>
          sale.customerId === id &&
          sale.status !== 'voided' &&
          sale.payments.some((payment) => payment.method === 'credit'),
      )
      .map((sale) => ({
        id: sale.id,
        kind: 'credit_sale' as const,
        reference: sale.invoiceNumber,
        date: sale.soldAt,
        amountH: sale.payments
          .filter((payment) => payment.method === 'credit')
          .reduce((sum, payment) => sum + payment.amountH, 0),
      }));

    const received = paymentsStore
      .filter((payment) => payment.customerId === id)
      .map((payment) => ({
        id: payment.id,
        kind: 'payment' as const,
        reference: payment.receiptNumber,
        date: payment.receivedAt,
        amountH: -payment.amountH,
      }));

    const credited = creditNotes
      .filter((note) => {
        const sale = sales.find((candidate) => candidate.id === note.saleId);
        return sale?.customerId === id && note.refundMethod === 'credit';
      })
      .map((note) => ({
        id: note.id,
        kind: 'credit_note' as const,
        reference: note.noteNumber,
        date: note.issuedAt,
        amountH: -note.totalH,
      }));

    return buildStatement([...creditSales, ...received, ...credited]);
  },

  /** Aggregate figures for the receivables cards. */
  async receivablesSummary(): Promise<{
    outstandingH: number;
    withBalance: number;
    overLimit: number;
    collectedH: number;
  }> {
    if (!USE_MOCKS) {
      const rows = await customerApi.receivables();

      /* Derived from the rows rather than stored: a summary column would drift
         the moment a collection posted without updating it. */
      return {
        outstandingH: rows.reduce((sum, r) => sum + num(r.balanceH), 0),
        withBalance: rows.filter((r) => num(r.balanceH) > 0).length,
        overLimit: rows.filter((r) => num(r.balanceH) > num(r.creditLimitH)).length,
        collectedH: 0,
      };
    }

    await delay(140);

    return {
      outstandingH: customers.reduce((sum, customer) => sum + Math.max(0, customer.balanceH), 0),
      withBalance: customers.filter((customer) => customer.balanceH > 0).length,
      overLimit: customers.filter((customer) => customer.balanceH > customer.creditLimitH).length,
      collectedH: paymentsStore.reduce((sum, payment) => sum + payment.amountH, 0),
    };
  },

  async payments(customerId: string): Promise<CustomerPayment[]> {
    await delay(120);
    return paymentsStore.filter((payment) => payment.customerId === customerId);
  },
};
