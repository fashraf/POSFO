import { useId, useRef, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type TooltipSide = 'top' | 'bottom' | 'start' | 'end';

const SIDES: Record<TooltipSide, string> = {
  top: 'bottom-[calc(100%+0.5rem)] start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
  bottom: 'top-[calc(100%+0.5rem)] start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
  start: 'end-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2',
  end: 'start-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2',
};

export interface TooltipProps {
  /** The explanation. Keep it to a sentence — longer belongs in an Alert. */
  content: ReactNode;
  side?: TooltipSide;
  children: ReactNode;
  className?: string;
  /** Widen for a longer sentence. */
  wide?: boolean;
}

/**
 * Shows on hover and on keyboard focus, and is wired with `aria-describedby`
 * so a screen reader gets the same explanation a sighted user does. A tooltip
 * is never the only place information lives — it supplements, never replaces.
 */
export function Tooltip({ content, side = 'top', children, className, wide = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const timer = useRef<number>();

  function show() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), 120);
  }

  function hide() {
    window.clearTimeout(timer.current);
    setVisible(false);
  }

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={() => setVisible(true)}
      onBlurCapture={hide}
    >
      <span aria-describedby={visible ? id : undefined} className="inline-flex">
        {children}
      </span>

      {visible && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-overlay rounded-md bg-ink-900 px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-md animate-fade-in',
            wide ? 'w-56 text-start' : 'w-max max-w-[16rem] text-center',
            SIDES[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

export interface InfoHintProps {
  content: ReactNode;
  side?: TooltipSide;
  className?: string;
  /** Accessible label for the trigger. Defaults to a generic "More information". */
  label?: string;
}

/**
 * The small circled question mark that sits beside a label. Use it where a
 * field name alone would leave someone guessing, not on every field — a page
 * of question marks explains nothing.
 */
export function InfoHint({ content, side = 'top', className, label }: InfoHintProps) {
  return (
    <Tooltip content={content} side={side} wide className={className}>
      <button
        type="button"
        tabIndex={0}
        aria-label={label ?? 'More information'}
        onClick={(event) => event.preventDefault()}
        className="inline-flex items-center justify-center rounded-full text-ink-400 transition-colors hover:text-ink-600"
      >
        <HelpCircle aria-hidden className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
