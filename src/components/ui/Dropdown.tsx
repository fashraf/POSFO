import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

export interface DropdownItem {
  /** Optional second line, for an option that needs explaining. */
  description?: ReactNode;
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  /** Renders in danger colours — use for destructive entries. */
  destructive?: boolean;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separated?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  /** Which side of the trigger the panel aligns to. */
  align?: 'start' | 'end';
  className?: string;
  panelClassName?: string;
}

export function Dropdown({
  trigger,
  items,
  align = 'end',
  className,
  panelClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setOpen(false), open);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        {trigger}
      </div>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-[calc(100%+0.375rem)] z-overlay min-w-[11rem] overflow-hidden rounded-md border border-ink-200 bg-surface p-1 shadow-md animate-scale-in',
            align === 'end' ? 'end-0' : 'start-0',
            panelClassName,
          )}
        >
          {items.map((item) => (
            <div key={item.key}>
              {item.separated && <div className="my-1 h-px bg-ink-200" />}
              <button
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-start text-base transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  item.destructive
                    ? 'text-danger-600 hover:bg-danger-50'
                    : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
                )}
              >
                {item.icon && (
                  <span className="shrink-0 text-ink-400 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                )}
                <span className="truncate">{item.label}
              {item.description && (
                <span className="block text-2xs font-normal text-ink-400">
                  {item.description}
                </span>
              )}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
