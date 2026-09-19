import type { AppNotification } from '@/types/notifications';
import { delay, timestamp } from './mock/store';

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString();

/**
 * Notifications.
 *
 * Every entry points at a place in the app that can actually resolve it —
 * a notification you cannot act on is just noise, so `href` is close to
 * mandatory in practice.
 */
let notifications: AppNotification[] = [
  {
    id: 'ntf_001',
    kind: 'low_stock',
    severity: 'warning',
    titleKey: 'notifications.items.lowStock',
    values: { count: '3' },
    href: '/inventory',
    read: false,
    occurredAt: minutesAgo(12),
    createdAt: minutesAgo(12),
    updatedAt: minutesAgo(12),
  },
  {
    id: 'ntf_002',
    kind: 'kitchen_delay',
    severity: 'danger',
    titleKey: 'notifications.items.kitchenDelay',
    values: { order: 'INV-1044' },
    href: '/kitchen',
    read: false,
    occurredAt: minutesAgo(4),
    createdAt: minutesAgo(4),
    updatedAt: minutesAgo(4),
  },
  {
    id: 'ntf_003',
    kind: 'credit_limit',
    severity: 'warning',
    titleKey: 'notifications.items.creditLimit',
    values: { customer: 'Al Nukhba Est.' },
    href: '/customers',
    read: false,
    occurredAt: minutesAgo(48),
    createdAt: minutesAgo(48),
    updatedAt: minutesAgo(48),
  },
  {
    id: 'ntf_004',
    kind: 'system',
    severity: 'info',
    titleKey: 'notifications.items.billSaved',
    values: {},
    href: '/bill-builder',
    read: true,
    occurredAt: minutesAgo(180),
    createdAt: minutesAgo(180),
    updatedAt: minutesAgo(180),
  },
];

export const notificationService = {
  async list(): Promise<AppNotification[]> {
    await delay(140);
    return [...notifications].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  },

  async markRead(id: string): Promise<void> {
    await delay(80);
    notifications = notifications.map((entry) =>
      entry.id === id ? { ...entry, read: true, updatedAt: timestamp() } : entry,
    );
  },

  async markAllRead(): Promise<void> {
    await delay(160);
    const now = timestamp();
    notifications = notifications.map((entry) =>
      entry.read ? entry : { ...entry, read: true, updatedAt: now },
    );
  },
};
