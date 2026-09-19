import { Box, PackageOpen, Wrench } from 'lucide-react';
import { Badge, Button, EmptyState, LoadingState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { isProduct, stockLevelOf } from '@/types/catalog';
import type { CatalogItem } from '@/types/catalog';

export interface ProductGridProps {
  items: CatalogItem[];
  loading: boolean;
  /** True when a search term is narrowing the grid. */
  searching: boolean;
  quantityOf: (itemId: string) => number;
  onSelect: (item: CatalogItem) => void;
  onOpenCatalog: () => void;
}

export function ProductGrid({
  items,
  loading,
  searching,
  quantityOf,
  onSelect,
  onOpenCatalog,
}: ProductGridProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <LoadingState className="py-20" />
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-300 bg-surface">
            <EmptyState
              icon={<PackageOpen />}
              title={searching ? t('pos.grid.noMatchTitle') : t('pos.grid.emptyTitle')}
              description={
                searching ? t('pos.grid.noMatchDescription') : t('pos.grid.emptyDescription')
              }
              action={
                searching ? undefined : (
                  <Button variant="outline" onClick={onOpenCatalog}>
                    {t('pos.grid.goToCatalog')}
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))' }}
          >
            {items.map((item) => {
              const inCart = quantityOf(item.id);
              const level = stockLevelOf(item);
              const low = level === 'low_stock';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={cn(
                    'group relative flex h-full flex-col justify-between gap-1.5 rounded-md border bg-surface p-2.5 text-start transition-all',
                    'hover:border-brand-300 hover:shadow-sm active:scale-[0.985]',
                    inCart > 0 ? 'border-brand-400 ring-1 ring-brand-500/25' : 'border-ink-200',
                  )}
                >
                  {inCart > 0 && (
                    <span
                      aria-label={t('pos.grid.inCart')}
                      className="numeric absolute end-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-2xs font-semibold text-white"
                    >
                      {inCart}
                    </span>
                  )}

                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded',
                      isProduct(item) ? 'bg-info-50 text-info-600' : 'bg-brand-50 text-brand-600',
                    )}
                  >
                    {isProduct(item) ? (
                      <Box className="h-3.5 w-3.5" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <span className="min-w-0 space-y-0.5">
                    <span className="line-clamp-2 block text-xs font-medium leading-snug text-ink-900">
                      {nameOf(item)}
                    </span>
                    {low && isProduct(item) && (
                      <Badge tone="warning">
                        {t('pos.grid.lowStock', {
                          count: formatNumber(item.stockQuantity, { language }),
                        })}
                      </Badge>
                    )}
                  </span>

                  <span className="numeric block text-sm font-semibold text-ink-900">
                    {formatCurrency(item.priceH, { language })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
