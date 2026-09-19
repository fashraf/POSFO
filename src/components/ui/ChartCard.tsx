import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Filter controls, a period switcher, or a legend. */
  action?: ReactNode;
  /** Chart height in pixels. Charts need a fixed height to render. */
  height?: number;
  className?: string;
  children: ReactNode;
}

/** A titled surface sized for a chart. Pair with a Recharts ResponsiveContainer. */
export function ChartCard({
  title,
  description,
  action,
  height = 280,
  className,
  children,
}: ChartCardProps) {
  return (
    <div className={cn('rounded-lg border border-ink-200 bg-surface shadow-xs', className)}>
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-md font-semibold text-ink-900">{title}</h3>
          {description && <p className="text-sm text-ink-500">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="px-2 pb-4" style={{ height }}>
        {children}
      </div>
    </div>
  );
}
