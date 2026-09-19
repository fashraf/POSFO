import { Badge, type BadgeTone } from './Badge';
import { useTranslation } from '@/i18n';
import type { RecordStatus } from '@/types';

const TONES: Record<RecordStatus, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'warning',
};

export interface StatusBadgeProps {
  status: RecordStatus;
  className?: string;
}

/** Translates a lifecycle status into a consistently coloured badge. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();

  const label =
    status === 'active'
      ? t('common.active')
      : status === 'inactive'
        ? t('common.inactive')
        : t('common.archived');

  return (
    <Badge tone={TONES[status]} dot className={className}>
      {label}
    </Badge>
  );
}
