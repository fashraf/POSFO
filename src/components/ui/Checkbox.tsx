import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, disabled, ...props },
  ref,
) {
  const box = (
    <input
      ref={ref}
      type="checkbox"
      disabled={disabled}
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded-sm border-ink-300 text-brand-600 shadow-xs transition-colors',
        'focus:ring-2 focus:ring-brand-500/30 focus:ring-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...props}
    />
  );

  if (!label && !description) return box;

  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="mt-0.5">{box}</span>
      <span className="space-y-0.5">
        {label && <span className="block text-base text-ink-800">{label}</span>}
        {description && <span className="block text-xs text-ink-500">{description}</span>}
      </span>
    </label>
  );
});
