import type { ID, Timestamped } from './common';

export type NotificationKind =
  | 'low_stock'
  | 'credit_limit'
  | 'recurring_due'
  | 'cash_drawer'
  | 'kitchen_delay'
  | 'shift'
  | 'system';

export type NotificationSeverity = 'info' | 'warning' | 'danger' | 'success';

export interface AppNotification extends Timestamped {
  id: ID;
  kind: NotificationKind;
  severity: NotificationSeverity;
  /** Dictionary key, so notifications translate like everything else. */
  titleKey: string;
  /** Values interpolated into the title. */
  values: Record<string, string>;
  /** Where clicking it takes you. Null when there is nowhere useful to go. */
  href: string | null;
  read: boolean;
  occurredAt: string;
}
