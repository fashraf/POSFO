import { cn } from '@/lib/cn';
import { formatCurrency, DEFAULT_CURRENCY } from '@/lib/format';
import { useI18n } from '@/i18n';

export interface CurrencyDisplayProps {
  /** Amount in minor units (halalas) unless `fromMinorUnits` is false. */
  amount: number;
  currency?: string;
  fromMinorUnits?: boolean;
  /** Colour negatives red and positives green. Off by default. */
  signed?: boolean;
  className?: string;
}

/** Renders money consistently: LTR, tabular figures, currency code trailing. */
export function CurrencyDisplay({
  amount,
  currency = DEFAULT_CURRENCY,
  fromMinorUnits = true,
  signed = false,
  className,
}: CurrencyDisplayProps) {
  const { language } = useI18n();

  return (
    <span
      className={cn(
        'numeric',
        signed && amount < 0 && 'text-danger-600',
        signed && amount > 0 && 'text-success-600',
        className,
      )}
    >
      {formatCurrency(amount, { language, currency, fromMinorUnits })}
    </span>
  );
}
