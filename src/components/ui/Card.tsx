import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('rounded-lg border border-ink-200 bg-surface shadow-xs', className)}
      {...props}
    />
  );
});

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-hand (or left in RTL) slot for actions. */
  action?: ReactNode;
}

export function CardHeader({
  className,
  title,
  description,
  action,
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-ink-200 px-4 py-2.5',
        className,
      )}
      {...props}
    >
      {children ?? (
        <div className="min-w-0 space-y-0.5">
          {title && <h3 className="truncate text-md font-semibold text-ink-900">{title}</h3>}
          {description && <p className="text-sm text-ink-500">{description}</p>}
        </div>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-4 py-2.5',
        className,
      )}
      {...props}
    />
  );
}
