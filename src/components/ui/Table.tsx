import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Thin semantic wrappers around a real <table>. Composed, not configured —
 * every screen has different columns, so a "column config" object always ends
 * up fighting the screen that needs something slightly different.
 */

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Wrap in a horizontally scrollable container. On by default. */
  scrollable?: boolean;
}

export function Table({ className, scrollable = true, ...props }: TableProps) {
  const table = (
    <table className={cn('w-full border-collapse text-start text-base', className)} {...props} />
  );

  if (!scrollable) return table;
  return <div className="w-full overflow-x-auto">{table}</div>;
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-ink-50/70', className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-ink-200', className)} {...props} />;
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Adds hover feedback and a pointer cursor for clickable rows. */
  interactive?: boolean;
  selected?: boolean;
}

export function TableRow({ className, interactive, selected, ...props }: TableRowProps) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        'transition-colors',
        interactive && 'cursor-pointer hover:bg-ink-50',
        selected && 'bg-brand-50/60',
        className,
      )}
      {...props}
    />
  );
}

export interface TableHeaderCellProps
  extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: 'start' | 'center' | 'end';
  /** Right-align and use tabular figures for a numeric column. */
  numeric?: boolean;
}

export function TableHeaderCell({
  className,
  align = 'start',
  numeric,
  ...props
}: TableHeaderCellProps) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-ink-200 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-500',
        align === 'start' && 'text-start',
        align === 'center' && 'text-center',
        (align === 'end' || numeric) && 'text-end',
        className,
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: 'start' | 'center' | 'end';
  numeric?: boolean;
}

export function TableCell({ className, align = 'start', numeric, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle text-sm text-ink-700',
        align === 'start' && 'text-start',
        align === 'center' && 'text-center',
        (align === 'end' || numeric) && 'text-end',
        numeric && 'tabular',
        className,
      )}
      {...props}
    />
  );
}

/** Full-width row used for empty and error states inside a table body. */
export function TableEmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12">
        {children}
      </td>
    </tr>
  );
}
