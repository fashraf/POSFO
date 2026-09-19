import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChefHat, Circle, Clock, Flag } from 'lucide-react';
import {
  EmptyState,
  Input,
  PageHeader,
  SearchableSelect,
  Skeleton,
} from '@/components/ui';
import { KitchenOrderModal } from '@/features/kitchen/KitchenOrderModal';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { kitchenService, safeCall } from '@/services';
import {
  LATE_AFTER_SECONDS,
  WARNING_AFTER_SECONDS,
  elapsedSeconds,
  formatElapsed,
  progressOf,
  urgencyOf,
} from '@/types/kitchen';
import type { KitchenOrder, KitchenOrderStatus, UrgencyBand } from '@/types/kitchen';


const COLUMNS: KitchenOrderStatus[] = ['open', 'preparing', 'ready'];

/* Urgency is an indicator, not a paint job: a border tint and a coloured dot,
   never a card that shouts across the room. */
const URGENCY_CARD: Record<UrgencyBand, string> = {
  normal: 'border-ink-200',
  warning: 'border-warning-100 ring-1 ring-warning-100',
  late: 'border-danger-100 ring-1 ring-danger-100',
};

const URGENCY_TEXT: Record<UrgencyBand, string> = {
  normal: 'text-ink-500',
  warning: 'text-warning-600',
  late: 'text-danger-600',
};

export default function KitchenPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();

  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>('all');
  const [timeFilter, setTimeFilter] = useState<string | null>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>('all');
  const [selected, setSelected] = useState<KitchenOrder | null>(null);
  const [busy, setBusy] = useState(false);

  /* A ticking clock in state, so every card's elapsed time and urgency band
     recompute together once a second without any of them storing a timer. */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await safeCall(() => kitchenService.list());
    if (result.ok) setOrders(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();

    return orders.filter((order) => {
      if (statusFilter && statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (typeFilter && typeFilter !== 'all' && order.orderType !== typeFilter) return false;

      if (timeFilter && timeFilter !== 'all') {
        const seconds = elapsedSeconds(order, now);
        if (timeFilter === 'under5' && seconds >= WARNING_AFTER_SECONDS) return false;
        if (
          timeFilter === 'between' &&
          (seconds < WARNING_AFTER_SECONDS || seconds >= LATE_AFTER_SECONDS)
        ) {
          return false;
        }
        if (timeFilter === 'over10' && seconds < LATE_AFTER_SECONDS) return false;
      }

      if (needle) {
        const haystack = [
          order.orderNumber,
          order.customerName ?? '',
          ...order.items.map((item) => `${item.nameAr} ${item.nameEn}`),
        ]
          .join(' ')
          .toLocaleLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [orders, search, statusFilter, timeFilter, typeFilter, now]);

  async function applyStatus(status: KitchenOrderStatus) {
    if (!selected) return;
    setBusy(true);

    const result = await safeCall(() => kitchenService.setStatus(selected.id, status));
    if (result.ok) {
      toast.success(t('kitchen.toast.updated'));
      setSelected(result.data);
      await load();
    } else {
      toast.error(t('kitchen.toast.failed'), result.error.message);
    }

    setBusy(false);
  }

  async function toggleItem(itemId: string) {
    if (!selected) return;

    const item = selected.items.find((candidate) => candidate.id === itemId);
    if (!item) return;

    const done = item.completedQuantity >= item.quantity;
    const result = await safeCall(() =>
      kitchenService.setItemProgress(selected.id, itemId, done ? 0 : item.quantity),
    );

    if (result.ok) {
      setSelected(result.data);
      setOrders((current) =>
        current.map((candidate) => (candidate.id === result.data.id ? result.data : candidate)),
      );
    }
  }

  async function completeAllItems() {
    if (!selected) return;
    setBusy(true);

    /* Sequential rather than parallel: the service returns the whole order
       each time, so racing them would let an earlier result overwrite a
       later one. */
    for (const item of selected.items) {
      if (item.completedQuantity >= item.quantity) continue;
      const result = await safeCall(() =>
        kitchenService.setItemProgress(selected.id, item.id, item.quantity),
      );
      if (result.ok) setSelected(result.data);
    }

    await load();
    setBusy(false);
    toast.success(t('kitchen.toast.updated'));
  }

  return (
    <div className="flex h-[calc(100svh-4.5rem)] min-h-[32rem] flex-col gap-2">
      <PageHeader title={t('kitchen.title')} description={t('kitchen.description')} />

      {/* Compact filter bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Input
          inputSize="sm"
          className="w-full sm:max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('kitchen.filters.search')}
        />

        <SearchableSelect
          size="sm"
          className="w-36"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: t('kitchen.filters.allStatuses') },
            { value: 'open', label: t('kitchen.status.open') },
            { value: 'preparing', label: t('kitchen.status.preparing') },
            { value: 'ready', label: t('kitchen.status.ready') },
            { value: 'completed', label: t('kitchen.status.completed') },
          ]}
        />

        <SearchableSelect
          size="sm"
          className="w-36"
          value={timeFilter}
          onChange={setTimeFilter}
          options={[
            { value: 'all', label: t('kitchen.filters.allTimes') },
            { value: 'under5', label: t('kitchen.filters.under5') },
            { value: 'between', label: t('kitchen.filters.between') },
            { value: 'over10', label: t('kitchen.filters.over10') },
          ]}
        />

        <SearchableSelect
          size="sm"
          className="w-36"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: t('kitchen.orderType.all') },
            { value: 'dine_in', label: t('kitchen.orderType.dine_in') },
            { value: 'takeaway', label: t('kitchen.orderType.takeaway') },
            { value: 'delivery', label: t('kitchen.orderType.delivery') },
          ]}
        />
      </div>

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex-1 rounded-lg border border-dashed border-ink-300 bg-surface">
          <EmptyState
            icon={<ChefHat />}
            title={orders.length === 0 ? t('kitchen.empty.title') : t('kitchen.empty.filtered')}
            description={
              orders.length === 0 ? t('kitchen.empty.description') : t('kitchen.empty.filteredHint')
            }
          />
        </div>
      ) : (
        /* Board columns on wide screens; a single dense grid below that, so a
           kitchen tablet is not stuck with three near-empty columns. */
        <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const columnOrders = visible.filter((order) => order.status === column);

            return (
              <section key={column} className="flex min-h-0 flex-col gap-2">
                <header className="flex shrink-0 items-center justify-between rounded-md bg-ink-100 px-2.5 py-1.5">
                  <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-600">
                    {t(`kitchen.columns.${column}`)}
                  </h2>
                  <span className="numeric text-2xs font-semibold text-ink-500">
                    {columnOrders.length}
                  </span>
                </header>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-0.5">
                  {columnOrders.map((order) => {
                    const seconds = elapsedSeconds(order, now);
                    const urgency = urgencyOf(seconds);
                    const progress = progressOf(order);
                    const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0);

                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelected(order)}
                        className={cn(
                          'w-full rounded-md border bg-surface p-2.5 text-start shadow-xs transition-colors hover:border-brand-300',
                          URGENCY_CARD[urgency],
                        )}
                      >
                        <header className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="numeric text-sm font-semibold text-ink-900">
                              {order.orderNumber}
                            </p>
                            <p className="truncate text-2xs text-ink-400">
                              {order.customerName ?? t(`kitchen.orderType.${order.orderType}`)}
                            </p>
                          </div>

                          <span
                            className={cn(
                              'flex shrink-0 items-center gap-1 text-xs font-medium',
                              URGENCY_TEXT[urgency],
                            )}
                          >
                            {urgency === 'late' ? (
                              <Flag aria-hidden className="h-3 w-3" />
                            ) : urgency === 'warning' ? (
                              <Circle aria-hidden className="h-2 w-2 fill-current" />
                            ) : (
                              <Clock aria-hidden className="h-3 w-3" />
                            )}
                            <span className="numeric">{formatElapsed(seconds)}</span>
                          </span>
                        </header>

                        <ul className="mt-2 space-y-0.5">
                          {order.items.map((item) => {
                            const done = item.completedQuantity >= item.quantity;
                            return (
                              <li key={item.id} className="flex items-center gap-2 px-1 py-0.5">
                                <span
                                  aria-hidden
                                  className={cn(
                                    'flex h-3 w-3 shrink-0 items-center justify-center rounded-full border',
                                    done
                                      ? 'border-success-500 bg-success-500 text-white'
                                      : 'border-ink-300',
                                  )}
                                >
                                  {done && <Check className="h-2 w-2" strokeWidth={3} />}
                                </span>
                                <span
                                  className={cn(
                                    'min-w-0 flex-1 truncate text-xs',
                                    done ? 'text-ink-400 line-through' : 'text-ink-800',
                                  )}
                                >
                                  {nameOf(item)}
                                </span>
                                <span className="numeric shrink-0 text-2xs font-semibold text-ink-500">
                                  ×{item.quantity}
                                </span>
                              </li>
                            );
                          })}
                        </ul>

                        {/* Thin progress bar, not a big component */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                progress === 1 ? 'bg-success-500' : 'bg-brand-500',
                              )}
                              style={{ width: `${progress * 100}%` }}
                            />
                          </div>
                          <span className="numeric text-2xs text-ink-400">
                            {Math.round(progress * 100)}%
                          </span>
                        </div>


                        <p className="mt-1.5 text-2xs text-ink-400">
                          {t('kitchen.items', { count: totalUnits })}
                        </p>
                      </button>
                    );
                  })}

                  {columnOrders.length === 0 && (
                    <p className="rounded-md border border-dashed border-ink-200 px-2 py-6 text-center text-2xs text-ink-400">
                      —
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <KitchenOrderModal
        order={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onToggleItem={(itemId) => void toggleItem(itemId)}
        onCompleteAll={completeAllItems}
        onSetStatus={applyStatus}
        onPrint={() => {
          toast.info(t('kitchen.toast.printing'));
          window.print();
        }}
        busy={busy}
      />
    </div>
  );
}
