import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useTranslation } from '@/i18n';

export interface SearchableOption {
  value: string;
  label: string;
  /** Secondary line under the label — a code, a city, a role. */
  description?: string;
  disabled?: boolean;
  /** Groups options under a heading. */
  group?: string;
}

interface BaseProps {
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  isClearable?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  /** Rendered when the search matches nothing. */
  emptyMessage?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

interface SingleProps extends BaseProps {
  isMulti?: false;
  value: string | null;
  onChange: (value: string | null) => void;
}

interface MultiProps extends BaseProps {
  isMulti: true;
  value: string[];
  onChange: (value: string[]) => void;
}

export type SearchableSelectProps = SingleProps | MultiProps;

const SIZES = {
  sm: 'min-h-8 px-2.5 text-xs',
  md: 'min-h-9 px-3 text-base',
  lg: 'min-h-11 px-3.5 text-md',
} as const;

/**
 * The application's dropdown.
 *
 * A native `<select>` stops being usable somewhere around twenty options, and
 * most lists here — items, customers, cities — are longer than that. This one
 * filters as you type and is fully keyboard-driven, so it stays fast whether
 * someone reaches for the mouse or not.
 */
export function SearchableSelect(props: SearchableSelectProps) {
  const {
    options,
    placeholder,
    searchPlaceholder,
    disabled = false,
    loading = false,
    error = false,
    isClearable = false,
    className,
    id,
    emptyMessage,
    size = 'md',
  } = props;

  const { t } = useTranslation();
  const generatedId = useId();
  const controlId = id ?? generatedId;

  const containerRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  /* Close on a click anywhere outside the control *or* the portalled panel —
     the panel is not a DOM descendant, so one ref is not enough. */
  useOnClickOutside(
    containerRef,
    (event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    },
    open,
  );


  const selectedValues = useMemo(
    () => (props.isMulti ? props.value : props.value ? [props.value] : []),
    [props.isMulti, props.value],
  );

  /** Case- and diacritic-insensitive, so Arabic filtering behaves sensibly. */
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return options;

    const normalise = (value: string) =>
      value
        .toLocaleLowerCase()
        .normalize('NFKD')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/[ىي]/g, 'ي')
        .replace(/ة/g, 'ه');

    const target = normalise(needle);
    return options.filter(
      (option) =>
        normalise(option.label).includes(target) ||
        (option.description ? normalise(option.description).includes(target) : false),
    );
  }, [options, query]);

  /**
   * The panel renders in a portal on <body> rather than inside the control.
   *
   * Nested inside, it was being clipped by any ancestor with `overflow:hidden`
   * and could sit under later siblings whatever its z-index — a card two
   * sections down would cover the city list. A portal sidesteps both, at the
   * cost of having to position it by hand.
   */
  const reposition = useCallback(() => {
    const control = controlRef.current;
    if (!control) return;

    const rect = control.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const panelHeight = Math.min(320, filtered.length * 44 + 56);

    /* Flip above when there is not room below but there is above. */
    const dropUp = spaceBelow < panelHeight && rect.top > spaceBelow;

    setPanelStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
      maxHeight: Math.max(180, dropUp ? rect.top - 16 : spaceBelow - 16),
    });
  }, [filtered.length]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  /* Keep it anchored while the page moves underneath it. */
  useEffect(() => {
    if (!open) return;

    const handler = () => reposition();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [open, reposition]);

  /* Reset the highlight whenever the visible set changes, so the arrow keys
     never start from a row that is no longer there. */
  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const timer = window.setTimeout(() => searchRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  /* Keep the highlighted row in view when navigating by keyboard. */
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const select = useCallback(
    (option: SearchableOption) => {
      if (option.disabled) return;

      if (props.isMulti) {
        const next = props.value.includes(option.value)
          ? props.value.filter((entry) => entry !== option.value)
          : [...props.value, option.value];
        props.onChange(next);
        /* Multi-select stays open — picking three branches should be three
           clicks, not three open-and-reopen cycles. */
        return;
      }

      props.onChange(option.value);
      setOpen(false);
    },
    [props],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (filtered[activeIndex]) select(filtered[activeIndex]);
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const hasSelection = selectedValues.length > 0;

  function clear(event: React.MouseEvent) {
    event.stopPropagation();
    if (props.isMulti) props.onChange([]);
    else props.onChange(null);
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Control */}
      <div
        ref={controlRef}
        id={controlId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${controlId}-list`}
        aria-label={props['aria-label']}
        aria-invalid={error || undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((value) => !value)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded border bg-surface shadow-xs transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/25',
          SIZES[size],
          'py-1.5',
          error
            ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25'
            : 'border-ink-200 hover:border-ink-300 focus:border-brand-400',
          disabled && 'cursor-not-allowed bg-ink-50 text-ink-400',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {!hasSelection && (
            <span className="truncate text-ink-400">{placeholder ?? t('select.placeholder')}</span>
          )}

          {props.isMulti
            ? selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-medium text-brand-700 ring-1 ring-inset ring-brand-100"
                >
                  {option.label}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onChange(props.value.filter((entry) => entry !== option.value));
                    }}
                    aria-label={`${t('common.close')} ${option.label}`}
                    className="rounded-full p-0.5 transition-colors hover:bg-brand-100"
                  >
                    <X aria-hidden className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))
            : selectedOptions[0] && (
                <span className="truncate text-ink-900">{selectedOptions[0].label}</span>
              )}
        </span>

        {loading && <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-400" />}

        {isClearable && hasSelection && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={clear}
            aria-label={t('select.clear')}
            className="shrink-0 rounded p-0.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}

        <ChevronDown
          aria-hidden
          className={cn(
            'h-4 w-4 shrink-0 text-ink-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </div>

      {/* Panel — portalled to escape clipping and stacking contexts */}
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="z-modal flex flex-col overflow-hidden rounded-md border border-ink-200 bg-surface shadow-overlay animate-scale-in"
          >
          <div className="flex items-center gap-2 border-b border-dashed border-ink-200 px-3 py-2">
            <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder ?? t('select.search')}
              className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
            />
          </div>

          <ul
            ref={listRef}
            id={`${controlId}-list`}
            role="listbox"
            aria-multiselectable={props.isMulti || undefined}
            className="flex-1 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-400">
                {emptyMessage ?? t('select.noResults')}
              </li>
            ) : (
              filtered.map((option, index) => {
                const selected = selectedValues.includes(option.value);
                const active = index === activeIndex;

                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      data-index={index}
                      aria-selected={selected}
                      disabled={option.disabled}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(option)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-start transition-colors',
                        active && 'bg-ink-100',
                        selected && 'bg-brand-50',
                        option.disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="min-w-0">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            selected ? 'font-medium text-brand-800' : 'text-ink-800',
                          )}
                        >
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="block truncate text-2xs text-ink-400">
                            {option.description}
                          </span>
                        )}
                      </span>

                      {selected && (
                        <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
