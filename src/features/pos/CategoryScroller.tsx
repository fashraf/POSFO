import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

export interface CategoryOption {
  value: string;
  label: string;
}

export interface CategoryScrollerProps {
  options: CategoryOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A single-line category rail.
 *
 * Categories must never wrap: a second row steals height from the product grid,
 * and a shop with fifteen categories would push the grid off the screen. So the
 * rail scrolls horizontally instead, with arrows that appear only when there is
 * something to scroll to.
 */
export function CategoryScroller({ options, value, onChange, className }: CategoryScrollerProps) {
  const { t } = useTranslation();
  const railRef = useRef<HTMLDivElement>(null);

  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    /* scrollLeft goes negative in RTL, so compare on magnitude. */
    const offset = Math.abs(rail.scrollLeft);
    const maxOffset = rail.scrollWidth - rail.clientWidth;

    setCanScrollStart(offset > 4);
    setCanScrollEnd(offset < maxOffset - 4);
  }, []);

  useEffect(() => {
    measure();
    const rail = railRef.current;
    if (!rail) return;

    rail.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      rail.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, options.length]);

  /* A vertical wheel over the rail scrolls it sideways, which is what people
     do instinctively on a trackpad or mouse. */
  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    const rail = railRef.current;
    if (!rail) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    rail.scrollBy({ left: event.deltaY, behavior: 'smooth' });
  }

  function nudge(direction: -1 | 1) {
    railRef.current?.scrollBy({ left: direction * 220, behavior: 'smooth' });
  }

  return (
    <div className={cn('relative flex min-w-0 items-center', className)}>
      {canScrollStart && (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label={t('common.previous')}
          className="absolute start-0 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-ink-200 bg-surface text-ink-500 shadow-sm transition-colors hover:text-ink-900"
        >
          <ChevronLeft aria-hidden className="h-3.5 w-3.5 flip-rtl" />
        </button>
      )}

      <div
        ref={railRef}
        onWheel={onWheel}
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-smooth no-scrollbar"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300 hover:text-ink-900',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {canScrollEnd && (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label={t('common.next')}
          className="absolute end-0 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-ink-200 bg-surface text-ink-500 shadow-sm transition-colors hover:text-ink-900"
        >
          <ChevronRight aria-hidden className="h-3.5 w-3.5 flip-rtl" />
        </button>
      )}
    </div>
  );
}
