import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Signed ratio: 0.125 renders as +12.5%. */
  change?: number;
  /** Text under the change indicator, e.g. "vs yesterday". */
  changeLabel?: ReactNode;
  icon?: ReactNode;
  /** Set true when a rise is bad — refunds, costs, shrinkage. */
  invertTrend?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  change,
  changeLabel,
  icon,
  invertTrend = false,
  className,
}: KpiCardProps) {
  const hasChange = typeof change === 'number' && Number.isFinite(change);
  const flat = hasChange && Math.abs(change) < 0.0005;
  const rising = hasChange && change > 0;
  const positive = invertTrend ? !rising : rising;

  const TrendIcon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={cn('rounded-lg border border-ink-200 bg-surface p-3.5 shadow-xs', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {icon && (
          <span aria-hidden className="text-ink-300 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-xl font-semibold tracking-tight text-ink-900">{value}</p>

      {hasChange && (
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-sm font-medium',
              flat ? 'text-ink-500' : positive ? 'text-success-600' : 'text-danger-600',
            )}
          >
            <TrendIcon aria-hidden className="h-3.5 w-3.5" />
            <span className="numeric">
              {rising && !flat ? '+' : ''}
              {(change * 100).toFixed(1)}%
            </span>
          </span>
          {changeLabel && <span className="text-sm text-ink-400">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
