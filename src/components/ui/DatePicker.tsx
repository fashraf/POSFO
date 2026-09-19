import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate } from '@/lib/format';

export interface DatePickerProps {
  /** ISO date, YYYY-MM-DD. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  id?: string;
  'aria-label'?: string;
}

const SIZES = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-3.5 text-base',
} as const;

function toIso(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString()
    .slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * A calendar picker.
 *
 * The native date input renders differently in every browser, cannot be styled,
 * and shows US ordering to an Arabic user regardless of locale. This draws its
 * own grid so the same control appears everywhere, in both languages, and
 * respects the week starting on Sunday as it does in Saudi Arabia.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  invalid = false,
  size = 'md',
  className,
  id,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const selected = value ? new Date(`${value}T00:00:00.000Z`) : null;
  const [cursor, setCursor] = useState(() => selected ?? new Date());

  useOnClickOutside(
    containerRef,
    (event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    },
    open,
  );

  useEffect(() => {
    if (value) setCursor(new Date(`${value}T00:00:00.000Z`));
  }, [value]);

  /* Portalled and positioned by hand, for the same reason the select is: a
     panel nested in a form gets clipped by the first ancestor with hidden
     overflow. */
  useEffect(() => {
    if (!open) return;

    const reposition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const below = window.innerHeight - rect.bottom;
      const dropUp = below < 320 && rect.top > below;

      setStyle({
        position: 'fixed',
        left: Math.min(rect.left, window.innerWidth - 296),
        width: 280,
        ...(dropUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      });
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const grid = useMemo(() => {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();

    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const total = daysInMonth(year, month);

    const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= total; day += 1) {
      cells.push(new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10));
    }
    return cells;
  }, [cursor]);

  const weekdays = useMemo(() => {
    const base = new Date(Date.UTC(2026, 0, 4)); // a Sunday
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(base);
      day.setUTCDate(base.getUTCDate() + index);
      return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
        weekday: 'narrow',
        timeZone: 'UTC',
      }).format(day);
    });
  }, [language]);

  const monthLabel = new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
    numberingSystem: 'latn',
  }).format(cursor);

  function shiftMonth(delta: number) {
    const next = new Date(cursor);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setCursor(next);
  }

  const blocked = (iso: string) => (min && iso < min) || (max && iso > max);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded border bg-surface shadow-xs transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/25',
          SIZES[size],
          invalid
            ? 'border-danger-500 focus:border-danger-500'
            : 'border-ink-200 hover:border-ink-300 focus:border-brand-400',
          disabled && 'cursor-not-allowed bg-ink-50 text-ink-400',
        )}
      >
        <span className={cn('truncate', value ? 'text-ink-900' : 'text-ink-400')}>
          {value ? formatDate(value, { language }) : t('datePicker.select')}
        </span>
        <Calendar aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>

      {open &&
        !disabled &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className="z-modal rounded-md border border-ink-200 bg-surface p-2 shadow-overlay animate-scale-in"
          >
            <header className="flex items-center justify-between px-1 pb-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label={t('common.previous')}
                className="rounded p-1 text-ink-500 transition-colors hover:bg-ink-100"
              >
                <ChevronLeft aria-hidden className="h-3.5 w-3.5 flip-rtl" />
              </button>

              <span className="text-xs font-medium text-ink-800">{monthLabel}</span>

              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label={t('common.next')}
                className="rounded p-1 text-ink-500 transition-colors hover:bg-ink-100"
              >
                <ChevronRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
              </button>
            </header>

            <div className="grid grid-cols-7 gap-0.5">
              {weekdays.map((day, index) => (
                <span
                  key={index}
                  className="py-1 text-center text-2xs font-medium text-ink-400"
                >
                  {day}
                </span>
              ))}

              {grid.map((iso, index) => {
                if (!iso) return <span key={`pad-${index}`} />;

                const isSelected = iso === value;
                const isToday = iso === toIso(new Date());
                const isBlocked = blocked(iso);

                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={Boolean(isBlocked)}
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    className={cn(
                      'numeric rounded py-1.5 text-xs transition-colors',
                      isSelected
                        ? 'bg-brand-600 font-semibold text-white'
                        : isBlocked
                          ? 'cursor-not-allowed text-ink-300'
                          : 'text-ink-700 hover:bg-ink-100',
                      !isSelected && isToday && 'font-semibold text-brand-700 ring-1 ring-brand-200',
                    )}
                  >
                    {Number(iso.slice(8, 10))}
                  </button>
                );
              })}
            </div>

            <footer className="mt-2 flex items-center justify-between border-t border-dashed border-ink-200 pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(toIso(new Date()));
                  setOpen(false);
                }}
                className="rounded px-2 py-1 text-2xs font-medium text-brand-600 hover:bg-brand-50"
              >
                {t('datePicker.today')}
              </button>

              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="rounded px-2 py-1 text-2xs text-ink-500 hover:bg-ink-100"
              >
                {t('datePicker.clear')}
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </div>
  );
}
