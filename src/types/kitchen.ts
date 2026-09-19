import type { ID, Timestamped } from './common';

/**
 * Kitchen orders.
 *
 * Only items flagged `requiresPreparation` reach this screen, so a grocery
 * that sells nothing prepared never sees it populate. The board is a view of
 * work in progress, not a second sales ledger.
 */
export type KitchenOrderStatus = 'open' | 'preparing' | 'ready' | 'completed';

export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'other';

export interface KitchenOrderItem {
  id: ID;
  productId: ID;
  nameAr: string;
  nameEn: string;
  quantity: number;
  /** How many of this line have been made. Drives the progress bar. */
  completedQuantity: number;
  note: string;
}

export interface KitchenOrder extends Timestamped {
  id: ID;
  orderNumber: string;
  createdAt: string;
  status: KitchenOrderStatus;
  customerName: string | null;
  orderType: OrderType;
  items: KitchenOrderItem[];
  totalH: number;
}

/** Elapsed seconds since the order was raised. */
export function elapsedSeconds(order: KitchenOrder, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 1000));
}

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Urgency band, computed from elapsed time rather than stored.
 *
 * Storing it would mean something has to tick it over; deriving it means a
 * card that has been sitting for eleven minutes is red the moment anyone
 * looks, with no background job involved.
 */
export type UrgencyBand = 'normal' | 'warning' | 'late';

export const WARNING_AFTER_SECONDS = 5 * 60;
export const LATE_AFTER_SECONDS = 10 * 60;

export function urgencyOf(seconds: number): UrgencyBand {
  if (seconds >= LATE_AFTER_SECONDS) return 'late';
  if (seconds >= WARNING_AFTER_SECONDS) return 'warning';
  return 'normal';
}

/** Share of units completed, 0–1. */
export function progressOf(order: KitchenOrder): number {
  const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
  if (total === 0) return 0;
  const done = order.items.reduce((sum, item) => sum + item.completedQuantity, 0);
  return Math.min(1, done / total);
}

export function isFullyPrepared(order: KitchenOrder): boolean {
  return order.items.every((item) => item.completedQuantity >= item.quantity);
}

/** The action that moves an order forward, or null when it is finished. */
export function nextStatus(status: KitchenOrderStatus): KitchenOrderStatus | null {
  switch (status) {
    case 'open':
      return 'preparing';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'completed';
    default:
      return null;
  }
}
