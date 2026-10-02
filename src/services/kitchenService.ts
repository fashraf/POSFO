import type { KitchenOrder, KitchenOrderItem, KitchenOrderStatus, OrderType } from '@/types/kitchen';
import { isFullyPrepared } from '@/types/kitchen';
import { kitchenApi } from './api';
import { activeBranchForStock } from './apiCatalogService';
import { num, str } from './mappers/saleMappers';
import { utc } from './mappers/time';
import { notFound } from './util';

/**
 * The kitchen board.
 *
 * Preparation orders are created by the server inside the sale commit, so this
 * service only reads them and moves them along. There is no way to raise one
 * from here — a ticket with no sale behind it is exactly what the board must
 * never show.
 */

type Row = Record<string, unknown>;

const STATUSES: KitchenOrderStatus[] = ['open', 'preparing', 'ready', 'completed'];

const ORDER_TYPES: OrderType[] = ['dine_in', 'takeaway', 'delivery', 'other'];

function iso(value: unknown): string {
  return typeof value === 'string' ? utc(value) : '';
}

function toItem(row: Row): KitchenOrderItem {
  return {
    /* A bigint identity on the server; the domain keeps ids as strings. */
    id: String(row.preparationItemId ?? ''),
    productId: str(row.itemId),
    nameAr: str(row.nameAr),
    nameEn: str(row.nameEn),
    quantity: num(row.quantity),
    completedQuantity: num(row.completedQty),
    note: str(row.note),
  };
}

function toOrder(row: Row, items: Row[]): KitchenOrder {
  const id = str(row.preparationId);
  const status = str(row.status, 'open') as KitchenOrderStatus;

  return {
    id,
    orderNumber: str(row.orderNumber),
    /* Stored in UTC without a zone marker; read as UTC so a ticket's age is
       not off by the browser's offset. */
    createdAt: iso(row.createdAtUtc),
    updatedAt: iso(row.updatedAtUtc),
    status: STATUSES.includes(status) ? status : 'open',
    customerName: str(row.customerName) || null,
    /* Null when the sale did not say how it is served; 'other' says that
       rather than guessing takeaway. */
    orderType: ORDER_TYPES.includes(str(row.orderType) as OrderType)
      ? (str(row.orderType) as OrderType)
      : 'other',
    totalH: num(row.totalH),
    items: items.filter((item) => item.preparationId === id).map(toItem),
  };
}

async function fetchOrders(includeCompleted = false): Promise<KitchenOrder[]> {
  const result = await kitchenApi.orders({ branchId: activeBranchForStock(), includeCompleted });
  return result.orders
    .map((order) => toOrder(order, result.items))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function fetchOrder(id: string): Promise<KitchenOrder> {
  /* Completed orders are off the board, but a status change may just have
     completed this one — include them so it can still be returned. */
  const result = await kitchenApi.orders({
    branchId: activeBranchForStock(),
    includeCompleted: true,
  });
  const row = result.orders.find((order) => order.preparationId === id);
  if (!row) throw notFound('Order', id);
  return toOrder(row, result.items);
}

export const kitchenService = {
  /** Completed orders are off the board unless asked for. */
  async list(options: { includeCompleted?: boolean } = {}): Promise<KitchenOrder[]> {
    return fetchOrders(options.includeCompleted ?? false);
  },

  async setStatus(id: string, status: KitchenOrderStatus): Promise<KitchenOrder> {
    /* Completing from the board marks every line done, so the progress bar
       never disagrees with the status badge. The route sets the status only,
       so the lines are brought up first. */
    if (status === 'completed' || status === 'ready') {
      const existing = await fetchOrder(id);
      await Promise.all(
        existing.items
          .filter((item) => item.completedQuantity < item.quantity)
          .map((item) => kitchenApi.setItemProgress(id, Number(item.id), item.quantity)),
      );
    }

    await kitchenApi.setStatus(id, status);
    return fetchOrder(id);
  },

  /** Tick one line's completed count up or down. */
  async setItemProgress(
    orderId: string,
    itemId: string,
    completedQuantity: number,
  ): Promise<KitchenOrder> {
    /* The server clamps to the ordered quantity as well; clamping here keeps
       the request meaningful. */
    await kitchenApi.setItemProgress(orderId, Number(itemId), Math.max(0, completedQuantity));

    const candidate = await fetchOrder(orderId);

    /* Finishing the last line moves the order to ready by itself — nobody
       should have to tick every item and then press a button as well. */
    const next: KitchenOrderStatus =
      isFullyPrepared(candidate) && candidate.status === 'preparing'
        ? 'ready'
        : candidate.status === 'open' && candidate.items.some((item) => item.completedQuantity > 0)
          ? 'preparing'
          : candidate.status;

    if (next === candidate.status) return candidate;

    await kitchenApi.setStatus(orderId, next);
    return { ...candidate, status: next };
  },
};
