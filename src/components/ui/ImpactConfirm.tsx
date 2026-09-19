import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { ConfirmModal, type ConfirmVariant } from './ConfirmModal';
import { CurrencyDisplay } from './CurrencyDisplay';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

/** A value that changes, shown as before → after. */
export interface ImpactChange {
  label: ReactNode;
  beforeH: number;
  afterH: number;
  /** True when a rising number is bad — a debt, an outstanding balance. */
  inverted?: boolean;
}

/** A figure that is part of the action but is not itself changing. */
export interface ImpactFact {
  label: ReactNode;
  amountH?: number;
  value?: ReactNode;
  emphasis?: boolean;
}

export interface ImpactConfirmProps {
  open: boolean;
  title: ReactNode;
  /** What the action does, in plain words. Not "are you sure?". */
  description: ReactNode;
  facts?: ImpactFact[];
  changes?: ImpactChange[];
  /** Bullet list of consequences, for actions with several effects. */
  effects?: ReactNode[];
  confirmLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The confirmation used for anything that moves money.
 *
 * Built around one rule: never ask "are you sure?" without saying what will
 * change. A person confirming a payment should see the balance before, the
 * balance after, and what the action sets in motion — otherwise the dialog is
 * a speed bump rather than a safeguard.
 */
export function ImpactConfirm({
  open,
  title,
  description,
  facts = [],
  changes = [],
  effects = [],
  confirmLabel,
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ImpactConfirmProps) {
  const { t } = useTranslation();

  return (
    <ConfirmModal
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      variant={variant}
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="space-y-2.5">
        {facts.length > 0 && (
          <dl className="space-y-1 rounded-md bg-ink-50 px-3 py-2 text-xs">
            {facts.map((fact, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-center justify-between gap-3',
                  fact.emphasis && 'border-t border-dashed border-ink-200 pt-1.5',
                )}
              >
                <dt className={cn('text-ink-500', fact.emphasis && 'font-medium text-ink-700')}>
                  {fact.label}
                </dt>
                <dd>
                  {fact.amountH !== undefined ? (
                    <CurrencyDisplay
                      amount={fact.amountH}
                      className={cn(
                        fact.emphasis ? 'font-semibold text-ink-900' : 'text-ink-800',
                      )}
                    />
                  ) : (
                    <span className="font-medium text-ink-800">{fact.value}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* Before → after. The arrow does the explaining. */}
        {changes.map((change, index) => {
          const rising = change.afterH > change.beforeH;
          const better = change.inverted ? !rising : rising;

          return (
            <div
              key={index}
              className="rounded-md border border-ink-200 px-3 py-2"
            >
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-400">
                {change.label}
              </p>

              <p className="flex items-center gap-2">
                <CurrencyDisplay amount={change.beforeH} className="text-sm text-ink-500" />
                <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-400 flip-rtl" />
                <CurrencyDisplay
                  amount={change.afterH}
                  className={cn(
                    'text-base font-semibold',
                    change.afterH === change.beforeH
                      ? 'text-ink-900'
                      : better
                        ? 'text-success-600'
                        : 'text-danger-600',
                  )}
                />
              </p>
            </div>
          );
        })}

        {effects.length > 0 && (
          <div className="space-y-1 rounded-md border border-info-100 bg-info-50/60 px-3 py-2">
            <p className="text-2xs font-medium text-info-800">{t('impact.thisWill')}</p>
            <ul className="space-y-0.5">
              {effects.map((effect, index) => (
                <li key={index} className="flex gap-1.5 text-2xs text-info-700">
                  <span aria-hidden>·</span>
                  {effect}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ConfirmModal>
  );
}
