import { useCallback, useEffect, useState } from 'react';
import { PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { Button, ConfirmModal, CurrencyDisplay, EmptyState, Modal } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate } from '@/lib/format';
import { computeTotals } from '@/types/sales';
import type { CartState } from './usePosCart';

/**
 * Held (parked) orders.
 *
 * A customer steps away to fetch something, the next one is waiting: the
 * cashier parks the current cart, serves the next, and picks the first one up
 * again. Client-side only — held orders live in this browser's localStorage,
 * per user and branch, like the in-progress cart. Nothing is reserved on the
 * server: stock is taken, and prices and discounts are checked, only when the
 * resumed order is charged.
 */

export interface HeldOrder {
  id: string;
  /** Running number per device, for the cashier to say out loud. */
  number: number;
  heldAt: string;
  cart: CartState;
}

const HELD_STORAGE_PREFIX = 'nazad.pos.held.v1';

export function heldStorageKey(userId: string | null | undefined, branchId: string | null | undefined) {
  return userId ? `${HELD_STORAGE_PREFIX}:${userId}:${branchId ?? 'none'}` : null;
}

function readHeld(key: string | null): HeldOrder[] {
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as HeldOrder[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter((order) => Array.isArray(order?.cart?.lines) && order.cart.lines.length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeHeld(key: string | null, orders: HeldOrder[]) {
  if (!key) return;
  try {
    if (orders.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(orders));
  } catch {
    /* Storage blocked: held orders last until the page is left. */
  }
}

export function useHeldOrders(storageKey: string | null) {
  const [orders, setOrders] = useState<HeldOrder[]>(() => readHeld(storageKey));

  /* Another branch or user has its own list. */
  useEffect(() => {
    setOrders(readHeld(storageKey));
  }, [storageKey]);

  const save = useCallback(
    (next: HeldOrder[]) => {
      setOrders(next);
      writeHeld(storageKey, next);
    },
    [storageKey],
  );

  /** Park a cart; returns the held order. */
  const hold = useCallback(
    (cart: CartState): HeldOrder => {
      const current = readHeld(storageKey);
      const number = current.reduce((max, order) => Math.max(max, order.number), 0) + 1;
      const order: HeldOrder = {
        id: `held_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        number,
        heldAt: new Date().toISOString(),
        cart,
      };
      save([...current, order]);
      return order;
    },
    [storageKey, save],
  );

  /** Take a held order off the list and return its cart. */
  const take = useCallback(
    (id: string): HeldOrder | null => {
      const current = readHeld(storageKey);
      const order = current.find((candidate) => candidate.id === id) ?? null;
      if (order) save(current.filter((candidate) => candidate.id !== id));
      return order;
    },
    [storageKey, save],
  );

  const discard = useCallback(
    (id: string) => save(readHeld(storageKey).filter((order) => order.id !== id)),
    [storageKey, save],
  );

  return { orders, hold, take, discard };
}

export interface HeldOrdersModalProps {
  open: boolean;
  onClose: () => void;
  orders: HeldOrder[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
}

/** The list of parked orders, each with resume and discard. */
export function HeldOrdersModal({ open, onClose, orders, onResume, onDiscard }: HeldOrdersModalProps) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const [discarding, setDiscarding] = useState<HeldOrder | null>(null);

  const nameOf = (order: HeldOrder) => t('pos.hold.label', { number: order.number });

  return (
    <>
      <Modal
        open={open && !discarding}
        onClose={onClose}
        size="sm"
        title={t('pos.hold.heldList')}
        description={t('pos.hold.deviceOnly')}
        footer={
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        }
      >
        {orders.length === 0 ? (
          <EmptyState icon={<PauseCircle />} title={t('pos.hold.noneHeld')} />
        ) : (
          <ul className="divide-y divide-ink-100 rounded-md border border-ink-200">
            {orders.map((order) => {
              const totals = computeTotals(order.cart.lines, order.cart.discountH);
              return (
                <li key={order.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{nameOf(order)}</p>
                    <p className="text-2xs text-ink-500">
                      {formatDate(order.heldAt, { language, withTime: true })} ·{' '}
                      {t('pos.hold.lines', { count: order.cart.lines.length })}
                    </p>
                  </div>
                  <CurrencyDisplay
                    amount={totals.totalH}
                    className="text-sm font-semibold text-ink-900"
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" leadingIcon={<PlayCircle />} onClick={() => onResume(order.id)}>
                      {t('pos.hold.resume')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('pos.hold.discard')}
                      onClick={() => setDiscarding(order)}
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(discarding)}
        title={t('pos.hold.discardTitle')}
        description={discarding ? t('pos.hold.discardDescription', { name: nameOf(discarding) }) : ''}
        confirmLabel={t('pos.hold.discard')}
        variant="danger"
        onConfirm={() => {
          if (discarding) onDiscard(discarding.id);
          setDiscarding(null);
        }}
        onCancel={() => setDiscarding(null)}
      />
    </>
  );
}
