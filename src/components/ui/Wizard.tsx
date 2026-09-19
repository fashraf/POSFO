import { useMemo, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useTranslation } from '@/i18n';

export interface WizardStep {
  id: string;
  title: string;
  /** One line under the title explaining what this step is for. */
  description?: string;
  content: ReactNode;
  /**
   * Return null when the step is complete, or a message explaining what is
   * missing. The message is shown next to a disabled Next button, so nobody has
   * to guess why they cannot continue.
   */
  validate?: () => string | null;
}

export interface WizardProps {
  steps: WizardStep[];
  currentIndex: number;
  onStepChange: (index: number) => void;
  onComplete: () => void;
  onCancel?: () => void;
  submitting?: boolean;
  /** Label for the final button. Defaults to "Create". */
  completeLabel?: string;
  className?: string;
}

/**
 * A linear wizard.
 *
 * The rules that make it feel easy rather than restrictive: you can always go
 * back; you can jump to any step you have already completed; and when you
 * cannot move forward, the reason is stated rather than left to be deduced from
 * a greyed-out button.
 */
export function Wizard({
  steps,
  currentIndex,
  onStepChange,
  onComplete,
  onCancel,
  submitting = false,
  completeLabel,
  className,
}: WizardProps) {
  const { t } = useTranslation();

  const current = steps[currentIndex];
  const isLast = currentIndex === steps.length - 1;
  const blocker = useMemo(() => current?.validate?.() ?? null, [current]);

  function goNext() {
    if (blocker) return;
    if (isLast) {
      onComplete();
      return;
    }
    onStepChange(currentIndex + 1);
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {/* Step rail */}
      <ol className="flex shrink-0 items-center gap-1 pb-3">
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const reachable = index <= currentIndex;

          return (
            <li key={step.id} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                disabled={!reachable || submitting}
                onClick={() => reachable && onStepChange(index)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-start transition-colors',
                  reachable && !active && 'hover:bg-ink-100',
                  !reachable && 'cursor-default',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold transition-colors',
                    done && 'bg-brand-600 text-white',
                    active && 'bg-brand-50 text-brand-700 ring-2 ring-brand-500/40',
                    !done && !active && 'bg-ink-100 text-ink-400',
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : <span className="numeric">{index + 1}</span>}
                </span>

                <span
                  className={cn(
                    'hidden truncate text-sm font-medium sm:block',
                    active ? 'text-ink-900' : done ? 'text-ink-600' : 'text-ink-400',
                  )}
                >
                  {step.title}
                </span>
              </button>

              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'h-px flex-1 shrink-0 sm:w-4 sm:flex-none',
                    done ? 'bg-brand-300' : 'bg-ink-200',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Step body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {current?.description && (
          <p className="pb-3 text-xs text-ink-500">{current.description}</p>
        )}
        {current?.content}
      </div>

      {/* Controls */}
      <div className="shrink-0 space-y-2 border-t border-ink-200 pt-3">
        {blocker && (
          <p className="text-xs text-ink-500">
            <span className="font-medium text-ink-700">{t('wizard.beforeContinuing')}</span>{' '}
            {blocker}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div>
            {currentIndex > 0 ? (
              <Button
                variant="ghost"
                onClick={() => onStepChange(currentIndex - 1)}
                disabled={submitting}
                leadingIcon={<ArrowLeft className="flip-rtl" />}
              >
                {t('common.back')}
              </Button>
            ) : (
              onCancel && (
                <Button variant="ghost" onClick={onCancel} disabled={submitting}>
                  {t('common.cancel')}
                </Button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="numeric hidden text-xs text-ink-400 sm:block">
              {t('wizard.stepOf', { current: currentIndex + 1, total: steps.length })}
            </span>

            <Button
              onClick={goNext}
              disabled={Boolean(blocker)}
              loading={submitting}
              trailingIcon={isLast ? undefined : <ArrowRight className="flip-rtl" />}
              leadingIcon={isLast ? <Check /> : undefined}
            >
              {isLast ? (completeLabel ?? t('common.create')) : t('common.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A labelled value row, for the review step at the end of a wizard. */
export function ReviewRow({
  label,
  value,
  muted = false,
}: {
  label: ReactNode;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className={cn('text-end text-base', muted ? 'text-ink-400' : 'font-medium text-ink-900')}>
        {value}
      </dd>
    </div>
  );
}
