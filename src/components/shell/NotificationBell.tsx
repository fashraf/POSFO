import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCheck, Info, PackageOpen, Wallet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useTranslation } from '@/i18n';
import { notificationService, safeCall } from '@/services';
import type { AppNotification, NotificationKind, NotificationSeverity } from '@/types/notifications';
import type { TranslationKey } from '@/i18n';

const ICONS: Record<NotificationKind, typeof Info> = {
  low_stock: PackageOpen,
  credit_limit: Wallet,
  kitchen_delay: AlertTriangle,
  shift: Info,
  system: Info,
};

const TONES: Record<NotificationSeverity, string> = {
  info: 'bg-info-50 text-info-600',
  success: 'bg-success-50 text-success-500',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
};

/** "4m", "2h", "3d" — enough to judge freshness without a full timestamp. */
function shortAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setOpen(false), open);

  const load = useCallback(async () => {
    const result = await safeCall(() => notificationService.list());
    if (result.ok) setItems(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = items.filter((item) => !item.read).length;

  async function openItem(item: AppNotification) {
    await safeCall(() => notificationService.markRead(item.id));
    await load();
    setOpen(false);
    if (item.href) navigate(item.href);
  }

  async function markAll() {
    await safeCall(() => notificationService.markAllRead());
    await load();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('notifications.title')}
        className="relative rounded p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <Bell aria-hidden className="h-4 w-4" />
        {unread > 0 && (
          <span className="numeric absolute end-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger-500 px-1 text-[9px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-[calc(100%+0.375rem)] z-overlay w-80 overflow-hidden rounded-md border border-ink-200 bg-surface shadow-md animate-scale-in">
          <header className="flex items-center justify-between gap-2 border-b border-dashed border-ink-200 px-3 py-2">
            <span className="text-sm font-medium text-ink-800">{t('notifications.title')}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 text-2xs font-medium text-brand-600 transition-colors hover:text-brand-700"
              >
                <CheckCheck aria-hidden className="h-3 w-3" />
                {t('notifications.markAllRead')}
              </button>
            )}
          </header>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-ink-700">{t('notifications.empty')}</p>
              <p className="mt-0.5 text-2xs text-ink-400">{t('notifications.emptyHint')}</p>
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto">
              {items.map((item) => {
                const Icon = ICONS[item.kind];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void openItem(item)}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-ink-50',
                        !item.read && 'bg-brand-50/40',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                          TONES[item.severity],
                        )}
                      >
                        <Icon className="h-3 w-3" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block text-xs leading-snug',
                            item.read ? 'text-ink-500' : 'font-medium text-ink-900',
                          )}
                        >
                          {t(item.titleKey as TranslationKey, item.values)}
                        </span>
                        <span className="numeric mt-0.5 block text-2xs text-ink-400">
                          {shortAgo(item.occurredAt)}
                        </span>
                      </span>

                      {!item.read && (
                        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
