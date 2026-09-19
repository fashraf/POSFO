import { CurrencyDisplay, FormField, PriceInput } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import { METHOD_KEYS, methodTotalH } from '@/types/finance';
import type { MethodBalances, MethodKey } from '@/types/finance';
import { fromMinorUnits, toMinorUnits } from '@/lib/format';

export interface MethodBalanceFieldsProps {
  value: MethodBalances;
  onChange: (value: MethodBalances) => void;
  disabled?: boolean;
  /** Ledger figures shown beside each input, to count against. */
  expected?: MethodBalances | null;
}

/**
 * The six places money sits, as one editable block.
 *
 * Payables is a debt, so it subtracts from the total — shown with its own
 * styling rather than silently inverted, because a positive number in a column
 * of positive numbers that reduces the total is exactly the kind of thing that
 * gets miscounted.
 */
export function MethodBalanceFields({
  value,
  onChange,
  disabled = false,
  expected,
}: MethodBalanceFieldsProps) {
  const { t } = useTranslation();

  function set(key: MethodKey, raw: string) {
    onChange({ ...value, [key]: toMinorUnits(raw || '0') });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {METHOD_KEYS.map((key) => {
          const isDebt = key === 'payablesH';

          return (
            <FormField
              key={key}
              label={t(`periods.methods.${key}` as never)}
              help={t(`periods.methodHelp.${key}` as never)}
            >
              <div className="space-y-1">
                <PriceInput
                  inputSize="sm"
                  disabled={disabled}
                  value={value[key] === 0 ? '' : fromMinorUnits(value[key])}
                  onChange={(event) => set(key, event.target.value)}
                  placeholder="0.00"
                  className={cn(isDebt && 'text-warning-700')}
                />

                {expected && (
                  <p className="flex items-center justify-between text-2xs text-ink-400">
                    <span>{t('periods.expected')}</span>
                    <CurrencyDisplay amount={expected[key]} />
                  </p>
                )}
              </div>
            </FormField>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-md bg-ink-100 px-3 py-2">
        <span className="text-sm font-semibold text-ink-900">{t('periods.total')}</span>
        <CurrencyDisplay
          amount={methodTotalH(value)}
          className="text-lg font-semibold text-ink-900"
        />
      </div>
    </div>
  );
}
