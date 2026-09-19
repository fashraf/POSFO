import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600',
  secondary:
    'bg-ink-100 text-ink-800 hover:bg-ink-200 active:bg-ink-300 disabled:bg-ink-100',
  outline:
    'border border-ink-200 bg-surface text-ink-700 shadow-xs hover:bg-ink-50 hover:text-ink-900 active:bg-ink-100',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200',
  danger:
    'bg-danger-500 text-white shadow-xs hover:bg-danger-600 active:bg-danger-700 disabled:bg-danger-500',
  link: 'text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-sm px-3 text-xs',
  md: 'h-9 gap-2 rounded px-3.5 text-base',
  lg: 'h-11 gap-2 rounded-md px-5 text-md',
  icon: 'h-9 w-9 rounded justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Rendered before the label (visually on the start side in both directions). */
  leadingIcon?: ReactNode;
  /** Rendered after the label. */
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        leadingIcon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{leadingIcon}</span>
      )}
      {children}
      {!loading && trailingIcon && (
        <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{trailingIcon}</span>
      )}
    </button>
  );
});
