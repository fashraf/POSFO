import type { KitchenOrder, KitchenOrderStatus } from '@/types/kitchen';
import { isFullyPrepared } from '@/types/kitchen';
import { delay, nextId, notFound, timestamp } from './mock/store';
import { SEED_KITCHEN_ORDERS } from './mock/seed';

let orders: KitchenOrder[] = [...SEED_KITCHEN_ORDERS];

export const kitchenService = {
  async list(): Promise<KitchenOrder[]> {
    await delay(160);
    return [...orders].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  },

  async setStatus(id: string, status: KitchenOrderStatus): Promise<KitchenOrder> {
    await delay(220);

    const existing = orders.find((order) => order.id === id);
    if (!existing) throw notFound('Order', id);

    /* Completing from the board marks every line done, so the progress bar
       never disagrees with the status badge. */
    const items =
      status === 'completed' || status === 'ready'
        ? existing.items.map((item) => ({ ...item, completedQuantity: item.quantity }))
        : existing.items;

    const updated: KitchenOrder = { ...existing, status, items, updatedAt: timestamp() };
    orders = orders.map((order) => (order.id === id ? updated : order));
    return updated;
  },

  /** Tick one line's completed count up or down. */
  async setItemProgress(
    orderId: string,
    itemId: string,
    completedQuantity: number,
  ): Promise<KitchenOrder> {
    await delay(140);

    const existing = orders.find((order) => order.id === orderId);
    if (!existing) throw notFound('Order', orderId);

    const items = existing.items.map((item) =>
      item.id === itemId
        ? { ...item, completedQuantity: Math.max(0, Math.min(item.quantity, completedQuantity)) }
        : item,
    );

    const candidate: KitchenOrder = { ...existing, items, updatedAt: timestamp() };

    /* Finishing the last line moves the order to ready by itself — nobody
       should have to tick every item and then press a button as well. */
    const status: KitchenOrderStatus =
      isFullyPrepared(candidate) && candidate.status === 'preparing'
        ? 'ready'
        : candidate.status === 'open' && items.some((item) => item.completedQuantity > 0)
          ? 'preparing'
          : candidate.status;

    const updated = { ...candidate, status };
    orders = orders.map((order) => (order.id === orderId ? updated : order));
    return updated;
  },

  /** Called by the POS when a sale contains anything needing preparation. */
  async createFromSale(input: {
    orderNumber: string;
    customerName: string | null;
    totalH: number;
    items: { productId: string; nameAr: string; nameEn: string; quantity: number }[];
  }): Promise<KitchenOrder | null> {
    if (input.items.length === 0) return null;

    const now = timestamp();
    const order: KitchenOrder = {
      id: nextId('kor'),
      orderNumber: input.orderNumber,
      createdAt: now,
      status: 'open',
      customerName: input.customerName,
      orderType: 'takeaway',
      totalH: input.totalH,
      items: input.items.map((item) => ({
        id: nextId('koi'),
        productId: item.productId,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        quantity: item.quantity,
        completedQuantity: 0,
        note: '',
      })),
      updatedAt: now,
    };

    orders = [...orders, order];
    return order;
  },
};

