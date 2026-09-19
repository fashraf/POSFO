import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useTranslation } from '@/i18n';
import { formatNumber } from '@/lib/format';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageSize, total, onPageChange, className }: PaginationProps) {
  const { t, language } = useTranslation();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-3 border-t border-ink-200 px-4 py-3 sm:flex-row',
        className,
      )}
    >
      <p className="text-sm text-ink-500">
        {t('table.showing', {
          from: formatNumber(from, { language }),
          to: formatNumber(to, { language }),
          total: formatNumber(total, { language }),
        })}
      </p>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          leadingIcon={<ChevronLeft className="flip-rtl" />}
        >
          {t('common.previous')}
        </Button>
        <span className="numeric px-2 text-sm text-ink-500">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          trailingIcon={<ChevronRight className="flip-rtl" />}
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
