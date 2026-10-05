import type { ID } from '@/types';
import { utc } from './time';
import type { Sale, SaleLine, SalePayment, SaleStatus, PaymentMethod, SalePaymentKind } from '@/types/sales';
import { paymentKindOf } from '@/types/sales';

/**
 * API rows to domain objects.
 *
 * Every conversion is explicit and field by field. Casting a row straight to a
 * domain type satisfies the compiler and then fails at runtime — that is
 * exactly how "Sale undefined completed" and "reading '0'" happened. The cost
 * of writing these out is the reason those cannot recur.
 *
 * Every numeric field goes through `num`. A column the API did not send arrives
 * as undefined, arithmetic on undefined is NaN, and NaN reaches the screen as
 * "SARNaN" with nothing naming the missing field.
 */

type Row = Record<string, unknown>;

/**
 * Read a field regardless of how the serializer cased it.
 *
 * Typed DTOs come back camelCased. Raw database rows are dictionaries, and
 * whether the serializer applies its casing policy to those depends on the
 * runtime type it sees — so `method` may arrive as `Method`.
 *
 * The failure mode is silent: `row.method` is undefined, the default takes
 * over, and every card sale prints as cash. Reading both spellings makes the
 * mapper independent of that, which is worth more than assuming one.
 */
function pick(row: Row, name: string): unknown {
  if (row[name] !== undefined) return row[name];

  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  if (row[pascal] !== undefined) return row[pascal];

  return undefined;
}

/** A number, or the fallback. Never undefined, never NaN. */
export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A number or null — for fields where "not applicable" is meaningful. */
function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A server timestamp (UTC, no trailing Z) as ISO; empty when absent. */
function iso(value: unknown): string {
  return typeof value === 'string' ? utc(value) : '';
}

/*---------------------------------------------------------------------- sales */

export function toSaleLine(row: Row): SaleLine {
  return {
    id: String(pick(row, 'saleLineId') ?? pick(row, 'id') ?? ''),
    itemId: str(pick(row, 'itemId')),
    kind: (pick(row, 'kind') === 'service' ? 'service' : 'product') as SaleLine['kind'],
    nameAr: str(pick(row, 'nameAr')),
    nameEn: str(pick(row, 'nameEn')),
    quantity: num(pick(row, 'quantity')),
    unitPriceH: num(pick(row, 'unitPriceH')),
    unitCostH: num(pick(row, 'unitCostH')),
    discountH: num(pick(row, 'lineDiscountH') ?? pick(row, 'discountH')),
  };
}

export function toSalePayment(row: Row): SalePayment {
  return {
    method: str(pick(row, 'method'), 'cash') as PaymentMethod,
    amountH: num(pick(row, 'amountH')),
  };
}

/**
 * A sale header, plus its lines and payments when they were fetched.
 *
 * The list endpoint returns headers only — fetching lines for every row of
 * every page would be an N+1 the list does not need. Lines default to empty
 * rather than undefined, so a caller that reads `lines[0]` gets undefined
 * instead of throwing.
 */
const PAYMENT_KINDS: SalePaymentKind[] = ['cash', 'card', 'credit', 'bank', 'mixed'];

export function toSale(row: Row, lines: Row[] = [], payments: Row[] = []): Sale {
  const totalH = num(pick(row, 'totalH'));
  const tenderedH = numOrNull(pick(row, 'tenderedH'));
  const mappedLines = lines.map(toSaleLine);
  const mappedPayments = payments.map(toSalePayment);

  /* The server's word for how it was paid (the list has no payment rows);
     else worked out from the payments; else unknown — not cash. */
  const serverKind = str(pick(row, 'paymentMethod')) as SalePaymentKind;
  const paymentMethod = PAYMENT_KINDS.includes(serverKind)
    ? serverKind
    : paymentKindOf(mappedPayments);

  return {
    id: str(pick(row, 'saleId') ?? pick(row, 'id')),
    invoiceNumber: str(pick(row, 'invoiceNumber')),
    branchId: strOrNull(pick(row, 'branchId')) as ID | null,
    customerId: strOrNull(pick(row, 'customerId')) as ID | null,
    cashierName: str(pick(row, 'cashierName')),

    discountH: num(pick(row, 'discountH')),
    subtotalH: num(pick(row, 'subtotalH')),
    taxH: num(pick(row, 'taxH')),
    totalH,
    tenderedH,
    /* Derived when absent: nothing tendered means nothing given back. */
    changeH: num(pick(row, 'changeH'), tenderedH === null ? 0 : Math.max(0, tenderedH - totalH)),

    status: str(pick(row, 'status'), 'completed') as SaleStatus,
    soldAt: iso(pick(row, 'soldAt') ?? pick(row, 'soldAtUtc')),

    lines: mappedLines,
    payments: mappedPayments,
    paymentMethod,
    itemCount: num(
      pick(row, 'itemCount'),
      mappedLines.reduce((sum, line) => sum + line.quantity, 0),
    ),

    createdAt: iso(pick(row, 'createdAtUtc') ?? pick(row, 'soldAtUtc')),
    updatedAt: iso(pick(row, 'updatedAtUtc') ?? pick(row, 'soldAtUtc')),
  } as Sale;
}

/*------------------------------------------------------------------ customers */

export function toCustomer(row: Row): import('@/types/sales').Customer {
  return {
    id: str(pick(row, 'customerId') ?? pick(row, 'id')),
    nameAr: str(pick(row, 'nameAr')),
    nameEn: str(pick(row, 'nameEn')),
    /* The columns are nullable; the domain type is not. Empty string reads
       correctly in a table cell, where null renders as the word "null". */
    phone: str(pick(row, 'phone')),
    email: str(pick(row, 'email')),
    balanceH: num(pick(row, 'balanceH')),
    creditLimitH: num(pick(row, 'creditLimitH')),
    status: pick(row, 'isActive') === false ? 'inactive' : 'active',
    createdAt: iso(pick(row, 'createdAtUtc')),
    updatedAt: iso(pick(row, 'updatedAtUtc')),
  };
}

/*------------------------------------------------------------------ inventory */

/**
 * A stock movement.
 *
 * The API's MovementType and the domain's MovementKind use different words for
 * the same events, so the translation is explicit. An unrecognised value maps
 * to 'adjustment' rather than being passed through — an unknown kind would
 * render as a blank cell with nothing to explain it.
 */
export function toStockMovement(row: Row): import('@/types/inventory').StockMovement {
  const apiType = str(pick(row, 'movementType'), 'adjustment');

  const kind = (
    {
      purchase: 'purchase',
      sale: 'sale',
      return: 'return',
      adjustment: 'adjustment',
      stocktake: 'adjustment',
      opening: 'opening',
      transfer: 'adjustment',
    } as Record<string, string>
  )[apiType] ?? 'adjustment';

  return {
    id: String(pick(row, 'movementId') ?? pick(row, 'id') ?? ''),
    itemId: str(pick(row, 'itemId')),
    branchId: strOrNull(pick(row, 'branchId')) as ID | null,
    kind: kind as import('@/types/inventory').MovementKind,
    quantity: num(pick(row, 'quantity')),
    balanceAfter: num(pick(row, 'balanceAfter')),
    reference: str(pick(row, 'reference')),
    /* The API keeps a reason in both languages; the domain has one note. */
    note: str(pick(row, 'reasonEn') ?? pick(row, 'reasonAr')),
    unitCostH: num(pick(row, 'unitCostH')),
    actor: str(pick(row, 'actor'), 'System'),
    occurredAt: iso(pick(row, 'occurredAtUtc')),
    createdAt: iso(pick(row, 'occurredAtUtc')),
    updatedAt: iso(pick(row, 'occurredAtUtc')),
  };
}

/*-------------------------------------------------------------------- finance */

/**
 * A journal entry header.
 *
 * `lines` is empty: the ledger list endpoint returns headers, and fetching
 * lines for every row would be an N+1 for a screen that shows totals. Empty
 * rather than undefined, so a caller that maps over them gets nothing instead
 * of throwing.
 */
export function toJournalEntry(row: Row): import('@/types/finance').JournalEntry {
  return {
    id: str(pick(row, 'entryId') ?? pick(row, 'id')),
    reference: str(pick(row, 'reference')),
    kind: str(pick(row, 'kind'), 'manual') as import('@/types/finance').TransactionKind,
    sourceReference: str(pick(row, 'sourceReference')),
    /* The API carries both languages; the domain type has one description. */
    description: str(pick(row, 'descriptionEn') ?? pick(row, 'descriptionAr')),
    postedAt: iso(pick(row, 'postedAtUtc')),
    lines: [],
    actor: str(pick(row, 'actor'), 'System'),
    branchId: strOrNull(pick(row, 'branchId')) as ID | null,
    reversesEntryId: strOrNull(pick(row, 'reversesEntryId')) as ID | null,
    reversedByEntryId: strOrNull(pick(row, 'reversedByEntryId')) as ID | null,
    totalDebitH: numOrNull(pick(row, 'totalDebitH')) ?? undefined,
    totalCreditH: numOrNull(pick(row, 'totalCreditH')) ?? undefined,
    createdAt: iso(pick(row, 'createdAtUtc') ?? pick(row, 'postedAtUtc')),
    updatedAt: iso(pick(row, 'postedAtUtc')),
  };
}

/*-------------------------------------------------------------------- expenses */

export function toExpense(row: Row): import('@/types/finance').Expense {
  return {
    id: str(pick(row, 'expenseId') ?? pick(row, 'id')),
    reference: str(pick(row, 'reference')),
    categoryId: str(pick(row, 'categoryId')) as ID,
    amountH: num(pick(row, 'amountH')),
    vatH: num(pick(row, 'vatH')),
    paymentMethod: str(pick(row, 'paymentMethod'), 'cash') as
      import('@/types/finance').Expense['paymentMethod'],
    /* The API sends a date; the domain holds an ISO string. Taking only the
       date part keeps it comparable with the period bounds. */
    paidOn: str(pick(row, 'paidOn')).slice(0, 10),
    recognition: str(pick(row, 'recognition'), 'one_time') as
      import('@/types/finance').RecognitionMode,
    periodStart: str(pick(row, 'periodStart')).slice(0, 10),
    periodEnd: str(pick(row, 'periodEnd')).slice(0, 10),
    note: str(pick(row, 'descriptionEn') ?? pick(row, 'descriptionAr')),
    attachmentName: strOrNull(pick(row, 'attachmentName')),
    status: str(pick(row, 'status'), 'posted') as import('@/types/finance').ExpenseStatus,
    actor: str(pick(row, 'createdBy'), 'System'),
    branchId: strOrNull(pick(row, 'branchId')) as ID | null,
    createdAt: iso(pick(row, 'createdAtUtc')),
    updatedAt: iso(pick(row, 'updatedAtUtc')),
  };
}

/*---------------------------------------------------------------- cash drawer */

export function toDrawerSession(row: Row): import('@/types/finance').DrawerSession {
  return {
    id: str(pick(row, 'sessionId') ?? pick(row, 'id')),
    branchId: strOrNull(pick(row, 'branchId')) as ID | null,
    openedAt: iso(pick(row, 'openedAtUtc')),
    /* Null while the session is open — the screen distinguishes open from
       closed by this, so a fabricated timestamp would show every drawer shut. */
    closedAt: pick(row, 'closedAtUtc') ? iso(pick(row, 'closedAtUtc')) : null,
    openingCashH: num(pick(row, 'openingCashH')),
    countedCashH: numOrNull(pick(row, 'countedCashH')),
    expectedCashH: numOrNull(pick(row, 'expectedCashH')),
    varianceH: numOrNull(pick(row, 'varianceH')),
    openedBy: str(pick(row, 'openedBy'), 'System'),
    closedBy: strOrNull(pick(row, 'closedBy')),
    note: str(pick(row, 'note')),
    createdAt: iso(pick(row, 'openedAtUtc')),
    updatedAt: iso(pick(row, 'closedAtUtc') ?? pick(row, 'openedAtUtc')),
  };
}

export function toCardSettlement(row: Row): import('@/types/finance').CardSettlement {
  return {
    id: str(pick(row, 'settlementId') ?? pick(row, 'id')),
    reference: str(pick(row, 'reference')),
    cardSalesH: num(pick(row, 'cardSalesH')),
    depositH: num(pick(row, 'depositH')),
    /* The fee is the gap, and the database enforces that. Recomputing here
       would let the two disagree if a row were ever edited directly. */
    feeH: num(pick(row, 'feeH')),
    settledOn: str(pick(row, 'settledOn')).slice(0, 10),
    status: str(pick(row, 'status'), 'reconciled') as
      import('@/types/finance').CardSettlement['status'],
    note: str(pick(row, 'note')),
    createdAt: iso(pick(row, 'createdAtUtc')),
    updatedAt: iso(pick(row, 'createdAtUtc')),
  };
}
