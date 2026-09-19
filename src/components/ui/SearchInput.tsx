import { forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input, type InputProps } from './Input';
import { useTranslation } from '@/i18n';

export interface SearchInputProps extends Omit<InputProps, 'leadingAddon' | 'trailingAddon'> {
  /** Called when the clear button is pressed. Button only renders if provided. */
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, onClear, value, placeholder, ...props },
  ref,
) {
  const { t } = useTranslation();
  const showClear = Boolean(onClear && value);

  return (
    <Input
      ref={ref}
      type="search"
      value={value}
      placeholder={placeholder ?? t('common.searchPlaceholder')}
      className={cn('[&::-webkit-search-cancel-button]:hidden', className)}
      leadingAddon={<Search aria-hidden />}
      trailingAddon={
        showClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={t('common.close')}
            className="pointer-events-auto rounded-sm p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        ) : undefined
      }
      {...props}
    />
  );
});
