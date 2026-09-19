import { Percent } from 'lucide-react';
import { Badge, Tooltip } from '@/components/ui';
import { useI18n, useTranslation } from '@/i18n';
import { formatCurrency } from '@/lib/format';
import type { CommissionRule } from '@/types/finance';

export interface CommissionBadgeProps {
  rules: CommissionRule[];
  userId: string;
  /** `icon` for a table cell, `full` for a detail panel. */
  variant?: 'icon' | 'full';
}

/**
 * Marks a user who earns commission.
 *
 * Whether someone is on commission changes what their pay means, so it belongs
 * next to their name rather than only on a finance screen they may never open.
 */
export function CommissionBadge({ rules, userId, variant = 'icon' }: CommissionBadgeProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  /* Their own rules first; fall back to the rule covering everyone. */
  const own = rules.filter((rule) => rule.status === 'active' && rule.userIds.includes(userId));
  const general = rules.filter((rule) => rule.status === 'active' && rule.userIds.length === 0);
  const applicable = own.length > 0 ? own : general;

  if (applicable.length === 0) return null;

  const describe = (rule: CommissionRule) =>
    rule.basis === 'percentage'
      ? `${rule.value / 100}%`
      : formatCurrency(rule.value, { language });

  const summary = applicable.map(describe).join(', ');
  const inherited = own.length === 0;

  const detail = (
    <span className="block text-start">
      <span className="block font-medium">{t('commissionBadge.earns', { rate: summary })}</span>
      {inherited && <span className="block opacity-80">{t('commissionBadge.inherited')}</span>}
    </span>
  );

  if (variant === 'full') {
    return (
      <Badge tone={inherited ? 'neutral' : 'success'} dot>
        {t('commissionBadge.earns', { rate: summary })}
      </Badge>
    );
  }

  return (
    <Tooltip content={detail} side="top" wide>
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-success-50 text-success-600"
        aria-label={t('commissionBadge.earns', { rate: summary })}
      >
        <Percent aria-hidden className="h-2.5 w-2.5" />
      </span>
    </Tooltip>
  );
}
