import { CurrencyDisplay, InfoHint } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import { agingTotals } from '@/types/finance';
import type { AgeBucket, AgingRow } from '@/types/finance';

const BUCKETS: AgeBucket[] = ['current', 'd30', 'd60', 'd90'];

/* Older money is worth less and needs chasing harder, so the tint deepens. */
const TONES: Record<AgeBucket, string> = {
  current: 'text-ink-700',
  d30: 'text-warning-600',
  d60: 'text-warning-700',
  d90: 'text-danger-600',
};

export function AgingStrip({ rows, className }: { rows: AgingRow[]; className?: string }) {
  const { t } = useTranslation();
  const totals = agingTotals(rows);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-ink-200 bg-surface px-4 py-2.5',
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
        {t('aging.label')}
        <InfoHint content={t('aging.help')} />
      </span>

      {BUCKETS.map((bucket) => (
        <span key={bucket} className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-500">{t(`aging.${bucket}`)}</span>
          <CurrencyDisplay
            amount={totals[bucket]}
            className={cn('font-medium', TONES[bucket])}
          />
        </span>
      ))}
    </div>
  );
}
