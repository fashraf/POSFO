import { cn } from '@/lib/cn';

export interface SkeletonProps {
  className?: string;
}

/** A single shimmering block. Compose these into page-shaped placeholders. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />;
}

/** Placeholder shaped like a data table. */
export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton key={column} className={cn('h-4 flex-1', column === 0 && 'max-w-[9rem]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder shaped like a row of KPI cards. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface space-y-3 p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
