import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const inputBaseClasses =
  'block w-full rounded border border-ink-200 bg-surface text-base text-ink-900 shadow-xs transition-colors placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean;
  /** Icon or text pinned to the start of the field. */
  leadingAddon?: ReactNode;
  /** Icon, unit, or button pinned to the end of the field. */
  trailingAddon?: ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3',
  lg: 'h-11 px-3.5 text-md',
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leadingAddon, trailingAddon, inputSize = 'md', disabled, ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        inputBaseClasses,
        SIZES[inputSize],
        invalid && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25',
        leadingAddon && 'ps-9',
        trailingAddon && 'pe-9',
        className,
      )}
      {...props}
    />
  );

  if (!leadingAddon && !trailingAddon) return field;

  return (
    <div className="relative">
      {leadingAddon && (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center text-ink-400 [&>svg]:h-4 [&>svg]:w-4">
          {leadingAddon}
        </span>
      )}
      {field}
      {trailingAddon && (
        <span className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-ink-400 [&>svg]:h-4 [&>svg]:w-4">
          {trailingAddon}
        </span>
      )}
    </div>
  );
});
