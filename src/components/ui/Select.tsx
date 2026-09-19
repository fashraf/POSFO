import type { ReactNode } from 'react';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';
import type { Option } from '@/types';

export interface SelectProps {
  /** The chosen value. Empty string is treated as "nothing selected". */
  value: string;
  /** Receives the value directly — there is no underlying change event. */
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  isClearable?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  emptyMessage?: ReactNode;
  /** Kept as `selectSize` so existing call sites read the same. */
  selectSize?: 'sm' | 'md' | 'lg';
}

/**
 * The application's select.
 *
 * This used to wrap a native `<select>`. It now renders `SearchableSelect`,
 * because almost every list in this product — items, customers, cities, roles —
 * outgrows what a native select can be navigated in. Keeping the name means
 * every existing call site gets search, keyboard navigation, and the portalled
 * panel without being touched.
 *
 * Reach for `SearchableSelect` directly when you need multi-select.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  invalid,
  isClearable = false,
  className,
  id,
  emptyMessage,
  selectSize = 'md',
  'aria-label': ariaLabel,
}: SelectProps) {
  const searchable: SearchableOption[] = options.map((option) => ({
    value: String(option.value),
    label: option.label,
    description: option.description,
    disabled: option.disabled,
  }));

  return (
    <SearchableSelect
      id={id}
      aria-label={ariaLabel}
      className={className}
      size={selectSize}
      options={searchable}
      value={value === '' ? null : value}
      onChange={(next) => onChange(next ?? '')}
      placeholder={placeholder}
      disabled={disabled}
      error={invalid}
      isClearable={isClearable}
      emptyMessage={emptyMessage}
    />
  );
}
