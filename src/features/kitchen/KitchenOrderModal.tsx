import { useState } from 'react';
import { ArrowRight, Check, CheckCheck, Circle, Printer, RotateCcw } from 'lucide-react';
import { Badge, Button, ConfirmModal, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useI18n, useTranslation } from '@/i18n';
import {
  elapsedSeconds,
  formatElapsed,
  isFullyPrepared,
  nextStatus,
  progressOf,
} from '@/types/kitchen';
import type { KitchenOrder, KitchenOrderStatus } from '@/types/kitchen';
import type { BadgeTone } from '@/components/ui';

const STATUS_TONES: Record<KitchenOrderStatus, BadgeTone> = {
  open: 'neutral',
  preparing: 'info',
  ready: 'success',
  completed: 'brand',
};

export interface KitchenOrderModalProps {
  order: KitchenOrder | null;
  open: boolean;
  onClose: () => void;
  onToggleItem: (itemId: string) => void;
  onCompleteAll: () => Promise<void>;
  onSetStatus: (status: KitchenOrderStatus) => Promise<void>;
  onPrint: () => void;
  busy: boolean;
}

/**
 * Order details.
 *
 * Every action lives here rather than on the card, so the board stays a
 * scannable wall of work and each state change happens somewhere the person
 * can see exactly what they are about to change.
 */
export function KitchenOrderModal({
  order,
  open,
  onClose,
  onToggleItem,
  onCompleteAll,
  onSetStatus,
  onPrint,
  busy,
}: KitchenOrderModalProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const [pendingStatus, setPendingStatus] = useState<KitchenOrderStatus | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

  if (!order) return null;

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const seconds = elapsedSeconds(order);
  const progress = progressOf(order);
  const next = nextStatus(order.status);
  const remainingItems = order.items.filter(
    (item) => item.completedQuantity < item.quantity,
  ).length;

  const advanceLabel =
    order.status === 'open'
      ? t('kitchenModal.startPreparing')
      : order.status === 'preparing'
        ? t('kitchenModal.markReady')
        : t('kitchenModal.markComplete');

  return (
    <>
      {/* Stepped aside while a confirmation is up, as the checkout does: two
          dialogs on the same layer left it to stacking order and focus which
          one took the tap, and the confirmation could end up behind. */}
      <Modal
        open={open && !pendingStatus && !confirmingAll}
        onClose={onClose}
        size="md"
        title={t('kitchenModal.title', { order: order.orderNumber })}
        footer={
          <Button variant="outline" onClick={onClose}>
            {t('kitchenModal.close')}
          </Button>
        }
      >
        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-2 rounded-md border border-ink-200 bg-ink-50/60 p-3 text-center">
            <div>
              <dt className="text-2xs text-ink-500">{t('kitchenModal.status')}</dt>
              <dd className="mt-1">
                <Badge tone={STATUS_TONES[order.status]} dot>
                  {t(`kitchen.status.${order.status}`)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-500">{t('kitchenModal.elapsed')}</dt>
              <dd className="numeric mt-1 text-sm font-semibold text-ink-900">
                {formatElapsed(seconds)}
              </dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-500">{t('kitchenModal.progress')}</dt>
              <dd className="numeric mt-1 text-sm font-semibold text-ink-900">
                {Math.round(progress * 100)}%
              </dd>
            </div>
          </dl>

          <div className="h-1 overflow-hidden rounded-full bg-ink-100">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress === 1 ? 'bg-success-500' : 'bg-brand-500',
              )}
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('kitchenModal.items')}
              </h3>
              <span className="text-2xs text-ink-400">{t('kitchenModal.tapHint')}</span>
            </div>

            <ul className="divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-200">
              {order.items.map((item) => {
                const done = item.completedQuantity >= item.quantity;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onToggleItem(item.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-start transition-colors hover:bg-ink-50 disabled:opacity-60"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          done ? 'border-success-500 bg-success-500 text-white' : 'border-ink-300',
                        )}
                      >
                        {done ? (
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        ) : (
                          <Circle className="h-1.5 w-1.5" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            done ? 'text-ink-400 line-through' : 'text-ink-800',
                          )}
                        >
                          {nameOf(item)}
                        </span>
                        {item.note && (
                          <span className="block truncate text-2xs text-warning-600">
                            {item.note}
                          </span>
                        )}
                      </span>

                      <span className="numeric shrink-0 text-xs font-semibold text-ink-500">
                        ×{item.quantity}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="space-y-2 border-t border-dashed border-ink-200 pt-3">
            {!isFullyPrepared(order) && (
              <Button
                variant="outline"
                fullWidth
                leadingIcon={<CheckCheck />}
                disabled={busy}
                onClick={() => setConfirmingAll(true)}
              >
                {t('kitchenModal.markAllComplete')}
              </Button>
            )}

            {next && (
              <Button
                fullWidth
                leadingIcon={<ArrowRight className="flip-rtl" />}
                disabled={busy}
                onClick={() => setPendingStatus(next)}
              >
                {advanceLabel}
              </Button>
            )}

            <div className="grid grid-cols-2 gap-2">
              {order.status !== 'open' && (
                <Button
                  variant="ghost"
                  leadingIcon={<RotateCcw />}
                  disabled={busy}
                  onClick={() => setPendingStatus('open')}
                >
                  {t('kitchenModal.reopen')}
                </Button>
              )}
              <Button variant="ghost" leadingIcon={<Printer />} onClick={onPrint}>
                {t('kitchenModal.print')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Every state change names what it is changing, from what, to what. */}
      <ConfirmModal
        open={Boolean(pendingStatus)}
        title={
          pendingStatus === 'open' ? t('kitchenModal.reopenTitle') : t('kitchenModal.changeTitle')
        }
        description={
          pendingStatus === 'open'
            ? t('kitchenModal.reopenDescription')
            : t('kitchen.confirm.completeDescription')
        }
        confirmLabel={t('kitchenModal.confirm')}
        variant={pendingStatus === 'open' ? 'warning' : 'primary'}
        loading={busy}
        onConfirm={async () => {
          if (!pendingStatus) return;
          await onSetStatus(pendingStatus);
          setPendingStatus(null);
        }}
        onCancel={() => setPendingStatus(null)}
      >
        <dl className="space-y-1 rounded-md bg-ink-50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('kitchenModal.currentStatus')}</dt>
            <dd className="font-medium text-ink-800">{t(`kitchen.status.${order.status}`)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('kitchenModal.newStatus')}</dt>
            <dd className="font-medium text-brand-700">
              {pendingStatus ? t(`kitchen.status.${pendingStatus}`) : '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('kitchenModal.itemsAffected')}</dt>
            <dd className="numeric font-medium text-ink-800">{order.items.length}</dd>
          </div>
        </dl>
      </ConfirmModal>

      <ConfirmModal
        open={confirmingAll}
        title={t('kitchen.confirm.completeAllTitle')}
        description={t('kitchen.confirm.completeAllDescription')}
        confirmLabel={t('kitchenModal.markAllComplete')}
        variant="primary"
        loading={busy}
        onConfirm={async () => {
          await onCompleteAll();
          setConfirmingAll(false);
        }}
        onCancel={() => setConfirmingAll(false)}
      >
        <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
          {t('kitchenModal.itemsAffected')}:{' '}
          <span className="numeric font-semibold text-ink-900">{remainingItems}</span>
        </p>
      </ConfirmModal>
    </>
  );
}
