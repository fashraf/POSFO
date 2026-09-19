import { Clock } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { cn } from '@/lib/cn';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate } from '@/lib/format';

export interface RecordMetaProps {
  createdAt: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  /** `inline` for a table cell, `block` for a detail panel. */
  variant?: 'inline' | 'block';
  className?: string;
}

/**
 * Who touched a record and when.
 *
 * In a table this is a single quiet timestamp with the full history on hover —
 * four lines of audit metadata in every row would bury the data the table is
 * actually for.
 */
export function RecordMeta({
  createdAt,
  updatedAt,
  createdBy,
  updatedBy,
  variant = 'inline',
  className,
}: RecordMetaProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const changed = updatedAt && updatedAt !== createdAt;

  const detail = (
    <span className="block space-y-0.5 text-start">
      <span className="block">
        {t('record.createdOn')}: {formatDate(createdAt, { language, withTime: true })}
      </span>
      {createdBy && (
        <span className="block">
          {t('record.createdBy')}: {createdBy}
        </span>
      )}
      {changed ? (
        <>
          <span className="block">
            {t('record.updatedOn')}: {formatDate(updatedAt!, { language, withTime: true })}
          </span>
          {updatedBy && (
            <span className="block">
              {t('record.updatedBy')}: {updatedBy}
            </span>
          )}
        </>
      ) : (
        <span className="block opacity-70">{t('record.unchanged')}</span>
      )}
    </span>
  );

  if (variant === 'block') {
    return (
      <dl className={cn('space-y-1 text-2xs text-ink-500', className)}>
        <div className="flex justify-between gap-3">
          <dt>{t('record.createdOn')}</dt>
          <dd className="text-ink-700">{formatDate(createdAt, { language, withTime: true })}</dd>
        </div>
        {createdBy && (
          <div className="flex justify-between gap-3">
            <dt>{t('record.createdBy')}</dt>
            <dd className="text-ink-700">{createdBy}</dd>
          </div>
        )}
        {changed && (
          <>
            <div className="flex justify-between gap-3">
              <dt>{t('record.updatedOn')}</dt>
              <dd className="text-ink-700">
                {formatDate(updatedAt!, { language, withTime: true })}
              </dd>
            </div>
            {updatedBy && (
              <div className="flex justify-between gap-3">
                <dt>{t('record.updatedBy')}</dt>
                <dd className="text-ink-700">{updatedBy}</dd>
              </div>
            )}
          </>
        )}
      </dl>
    );
  }

  return (
    <Tooltip content={detail} wide side="top">
      <span
        className={cn(
          'inline-flex items-center gap-1 text-2xs text-ink-400',
          changed && 'text-ink-500',
          className,
        )}
      >
        <Clock aria-hidden className="h-3 w-3 shrink-0" />
        {formatDate(changed ? updatedAt! : createdAt, { language })}
      </span>
    </Tooltip>
  );
}
