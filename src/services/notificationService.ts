import { utc } from './mappers/time';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, isLanguage } from '@/i18n/config';
import type {
  AppNotification,
  NotificationKind,
  NotificationSeverity,
} from '@/types/notifications';
import { notificationApi } from './api/financeApi';
import { str } from './mappers/saleMappers';

/**
 * Notifications.
 *
 * Every entry points at a place in the app that can actually resolve it —
 * a notification you cannot act on is just noise, so `href` is close to
 * mandatory in practice.
 */

type Row = Record<string, unknown>;

const KINDS: NotificationKind[] = [
  'low_stock',
  'credit_limit',
  'recurring_due',
  'cash_drawer',
  'kitchen_delay',
  'shift',
  'system',
];
const SEVERITIES: NotificationSeverity[] = ['info', 'warning', 'danger', 'success'];

/*
 * The server stores a finished title in each language rather than a
 * dictionary key. The bell renders `t(titleKey, values)`, and a key that is not
 * in the dictionary renders as itself — so a bare `{title}` placeholder
 * interpolates the stored title unchanged.
 */
const STORED_TITLE_KEY = '{title}';

/** The language the interface is showing, read the way the provider reads it. */
function currentLanguage(): 'ar' | 'en' {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function iso(value: unknown): string {
  return typeof value === 'string' ? utc(value) : '';
}

function toNotification(row: Row, language: 'ar' | 'en'): AppNotification {
  const kind = str(row.kind) as NotificationKind;
  const severity = str(row.severity) as NotificationSeverity;
  const titleAr = str(row.titleAr);
  const titleEn = str(row.titleEn);
  const created = iso(row.createdAtUtc);

  return {
    id: str(row.notificationId),
    /* An unknown kind would have no icon; 'system' is the neutral one. */
    kind: KINDS.includes(kind) ? kind : 'system',
    severity: SEVERITIES.includes(severity) ? severity : 'info',
    titleKey: STORED_TITLE_KEY,
    values: { title: (language === 'ar' ? titleAr : titleEn) || titleEn || titleAr },
    href: str(row.linkPath) || null,
    read: row.readAtUtc !== null && row.readAtUtc !== undefined,
    occurredAt: created,
    createdAt: created,
    updatedAt: iso(row.readAtUtc ?? row.createdAtUtc),
  };
}

export const notificationService = {
  async list(): Promise<AppNotification[]> {
    const rows = await notificationApi.list();
    const language = currentLanguage();

    return rows
      .map((row) => toNotification(row, language))
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  },

  async markRead(id: string): Promise<void> {
    await notificationApi.markRead(id);
  },

  async markAllRead(): Promise<void> {
    await notificationApi.markAllRead();
  },
};
