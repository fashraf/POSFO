import { useState } from 'react';
import { Check, ChevronDown, Lock, ShieldCheck, Tag, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  CurrencyDisplay,
  Modal,
  Textarea,
  Tooltip,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useI18n, useTranslation } from '@/i18n';
import { storedToPercent } from '@/types/discounts';
import type { DiscountApproval } from '@/types/discounts';
import type { ResolvedDiscount } from '@/services';

export interface DiscountPickerProps {
  /** Every active discount, each with whether it applies to this basket. */
  resolved: ResolvedDiscount[];
  selectedId: string | null;
  onSelect: (discountId: string | null) => void;
  approval: DiscountApproval;
  onRequestApproval: (reason: string) => void;
  amountH: number;
  capped: boolean;
  disabled?: boolean;
  /** Label beside the control instead of above it, to save a row in the cart. */
  inline?: boolean;
}

/**
 * The cashier chooses from configured discounts; there is no free-text field.
 *
 * Ineligible discounts stay visible but disabled, with the reason attached. A
 * cashier who cannot see the option has no way to know the basket is 12 riyals
 * short of qualifying, and will call a manager instead.
 */
export function DiscountPicker({
  resolved,
  selectedId,
  onSelect,
  approval,
  onRequestApproval,
  amountH,
  capped,
  disabled = false,
  inline = false,
}: DiscountPickerProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const selected = resolved.find((entry) => entry.discount.id === selectedId);

  const valueLabel = (entry: ResolvedDiscount) =>
    entry.discount.type === 'percentage'
      ? `${storedToPercent(entry.discount.value)}%`
      : null;

  function submitApproval() {
    if (!reason.trim()) {
      setReasonError(t('posDiscount.approval.needReason'));
      return;
    }
    onRequestApproval(reason);
    setRequesting(false);
    setReason('');
    setReasonError(null);
  }

  return (
    <div className={cn(inline ? 'space-y-1.5' : 'space-y-2')}>
      <div className={cn('flex items-center gap-2', inline ? '' : 'justify-between')}>
        {!inline && (
          <span className="text-sm font-medium text-ink-600">{t('posDiscount.label')}</span>
        )}
        {!inline && (
          <Tooltip content={t('posDiscount.help')} side="top" wide>
            <Lock aria-hidden className="h-3 w-3 text-ink-300" />
          </Tooltip>
        )}
      </div>

      {/* Picker. Inline puts the label in the same row as the control. */}
      <div className={cn('relative', inline && 'flex items-center gap-2')}>
        {inline && (
          <span className="shrink-0 text-xs font-medium text-ink-600">
            {t('posDiscount.label')}
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded border border-ink-200 bg-surface text-start shadow-xs transition-colors',
            inline ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm',
            'hover:border-ink-300 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
            selected && 'border-brand-300 bg-brand-50/40',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Tag aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            <span className={cn('truncate', selected ? 'text-ink-900' : 'text-ink-400')}>
              {selected ? nameOf(selected.discount) : t('posDiscount.none')}
            </span>
          </span>
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-ink-400" />
        </button>

        {open && !disabled && (
          <>
            <div
              aria-hidden
              className="fixed inset-0 z-overlay"
              onClick={() => setOpen(false)}
            />
            <ul
              role="listbox"
              className="absolute bottom-[calc(100%+0.375rem)] z-overlay max-h-72 w-full overflow-y-auto rounded-md border border-ink-200 bg-surface p-1 shadow-md animate-scale-in"
            >
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-start text-sm text-ink-600 transition-colors hover:bg-ink-100"
                >
                  {t('posDiscount.none')}
                  {!selectedId && <Check aria-hidden className="h-3.5 w-3.5 text-brand-600" />}
                </button>
              </li>

              {resolved.map((entry) => {
                const eligible = entry.eligibility.eligible;
                const active = entry.discount.id === selectedId;

                return (
                  <li key={entry.discount.id}>
                    <button
                      type="button"
                      disabled={!eligible}
                      onClick={() => {
                        onSelect(entry.discount.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full flex-col gap-0.5 rounded-sm px-2.5 py-2 text-start transition-colors',
                        eligible ? 'hover:bg-ink-100' : 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              'truncate text-sm',
                              eligible ? 'text-ink-800' : 'text-ink-400',
                            )}
                          >
                            {nameOf(entry.discount)}
                          </span>
                          {valueLabel(entry) && (
                            <Badge tone={eligible ? 'brand' : 'neutral'}>{valueLabel(entry)}</Badge>
                          )}
                        </span>

                        {eligible ? (
                          active ? (
                            <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                          ) : (
                            <CurrencyDisplay
                              amount={entry.eligibility.amountH}
                              className="shrink-0 text-xs font-medium text-ink-500"
                            />
                          )
                        ) : null}
                      </span>

                      {/* Say why, rather than leaving a disabled row unexplained */}
                      {!eligible && entry.eligibility.reason && (
                        <span className="text-2xs text-ink-400">
                          {t(`posDiscount.reason.${entry.eligibility.reason}`)}
                        </span>
                      )}

                      {eligible && entry.discount.isAutomatic && (
                        <span className="text-2xs text-brand-600">
                          {t('discounts.automaticBadge')}
                        </span>
                      )}

                      {eligible && entry.eligibility.requiresApproval && (
                        <span className="text-2xs text-warning-600">
                          {t('posDiscount.approval.required')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Applied amount */}
      {selected && amountH > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-ink-500">
              {t('posDiscount.amount')}
              {selected.discount.isAutomatic && (
                <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-2xs font-medium text-brand-700">
                  {t('discounts.automaticBadge')}
                </span>
              )}
            </span>
            <CurrencyDisplay amount={-amountH} className="font-medium text-danger-600" />
          </div>

          {capped && <p className="text-2xs text-warning-600">{t('posDiscount.capped')}</p>}

          {/* Approval states */}
          {approval.state === 'pending' && (
            <Alert tone="warning" compact>
              <span className="flex items-center justify-between gap-2">
                {t('posDiscount.approval.explain')}
                <Button size="sm" variant="outline" onClick={() => setRequesting(true)}>
                  {t('posDiscount.approval.request')}
                </Button>
              </span>
            </Alert>
          )}

          {approval.state === 'approved' && (
            <Alert tone="success" icon={<ShieldCheck className="h-3.5 w-3.5" />} compact>
              {t('posDiscount.approval.approvedBy', { name: approval.approverName ?? '—' })}
            </Alert>
          )}

          {approval.state === 'rejected' && (
            <Alert tone="danger" compact>
              {t('posDiscount.approval.rejected')}
            </Alert>
          )}
        </div>
      )}

      {/* Approval request */}
      <Modal
        open={requesting}
        onClose={() => setRequesting(false)}
        size="sm"
        title={t('posDiscount.approval.required')}
        description={t('posDiscount.approval.explain')}
        footer={
          <>
            <Button variant="outline" onClick={() => setRequesting(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitApproval}>{t('posDiscount.approval.request')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {selected && (
            <div className="flex items-center justify-between rounded-md bg-ink-50 px-3.5 py-2.5 text-sm">
              <span className="text-ink-600">{nameOf(selected.discount)}</span>
              <CurrencyDisplay amount={amountH} className="font-semibold text-ink-900" />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink-700">
              {t('posDiscount.approval.reason')}
            </label>
            <Textarea
              rows={3}
              autoFocus
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(null);
              }}
              placeholder={t('posDiscount.approval.reasonPlaceholder')}
              invalid={Boolean(reasonError)}
            />
            {reasonError && <p className="text-xs text-danger-600">{reasonError}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Small inline chip used in the cart header when a discount is applied. */
export function AppliedDiscountChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-medium text-brand-700 ring-1 ring-inset ring-brand-100">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={t('common.close')}
        className="rounded-full p-0.5 transition-colors hover:bg-brand-100"
      >
        <X aria-hidden className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
