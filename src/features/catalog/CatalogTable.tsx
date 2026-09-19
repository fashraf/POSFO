import { Box, MoreHorizontal, Pencil, Power, PowerOff, Wrench } from 'lucide-react';
import {
  Badge,
  Button,
  CurrencyDisplay,
  Dropdown,
  EmptyState,
  ErrorState,
  SkeletonTable,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import { isProduct, isService, marginOf, stockLevelOf } from '@/types/catalog';
import type { CatalogItem, Category, StockLevel } from '@/types/catalog';
import type { BadgeTone } from '@/components/ui';

const STOCK_TONES: Record<StockLevel, BadgeTone> = {
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'danger',
  not_tracked: 'neutral',
};

const STOCK_LABEL_KEYS = {
  in_stock: 'catalog.stock.inStock',
  low_stock: 'catalog.stock.lowStock',
  out_of_stock: 'catalog.stock.outOfStock',
  not_tracked: 'catalog.stock.notTracked',
} as const;

export interface CatalogTableProps {
  items: CatalogItem[];
  categories: Category[];
  loading: boolean;
  error: string | null;
  /** True when a search or filter is narrowing the list — changes the empty copy. */
  filtered: boolean;
  onRetry: () => void;
  onEdit: (item: CatalogItem) => void;
  onToggleStatus: (item: CatalogItem) => void;
  onCreate: () => void;
}

export function CatalogTable({
  items,
  categories,
  loading,
  error,
  filtered,
  onRetry,
  onEdit,
  onToggleStatus,
  onCreate,
}: CatalogTableProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const categoryName = (id: string | null) => {
    if (!id) return '—';
    const category = categories.find((candidate) => candidate.id === id);
    return category ? nameOf(category) : '—';
  };

  const COLUMN_COUNT = 8;

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
        <SkeletonTable rows={6} columns={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-ink-200 bg-surface">
        <ErrorState description={error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t('catalog.columns.name')}</TableHeaderCell>
            <TableHeaderCell>{t('catalog.columns.type')}</TableHeaderCell>
            <TableHeaderCell>{t('catalog.columns.category')}</TableHeaderCell>
            <TableHeaderCell numeric>{t('catalog.columns.cost')}</TableHeaderCell>
            <TableHeaderCell numeric>{t('catalog.columns.price')}</TableHeaderCell>
            <TableHeaderCell numeric>{t('catalog.columns.margin')}</TableHeaderCell>
            <TableHeaderCell>{t('catalog.columns.stock')}</TableHeaderCell>
            <TableHeaderCell>{t('catalog.columns.status')}</TableHeaderCell>
            <TableHeaderCell align="end">
              <span className="sr-only">{t('common.actions')}</span>
            </TableHeaderCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {items.length === 0 ? (
            <TableEmptyRow colSpan={COLUMN_COUNT + 1}>
              <EmptyState
                icon={<Box />}
                title={filtered ? t('catalog.empty.filteredTitle') : t('catalog.empty.title')}
                description={
                  filtered ? t('catalog.empty.filteredDescription') : t('catalog.empty.description')
                }
                action={
                  filtered ? undefined : <Button onClick={onCreate}>{t('catalog.addItem')}</Button>
                }
              />
            </TableEmptyRow>
          ) : (
            items.map((item) => {
              const level = stockLevelOf(item);
              const margin = marginOf(item);
              const KindIcon = isProduct(item) ? Box : Wrench;

              return (
                <TableRow key={item.id} interactive onClick={() => onEdit(item)}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded',
                          isProduct(item)
                            ? 'bg-info-50 text-info-600'
                            : 'bg-brand-50 text-brand-600',
                        )}
                      >
                        <KindIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">{nameOf(item)}</p>
                        <p className="numeric truncate text-xs text-ink-400">
                          {isProduct(item) ? item.sku : `${item.durationMinutes ?? '—'}`}
                          {isService(item) && item.durationMinutes
                            ? ` ${t('catalog.form.minutesSuffix')}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge tone={isProduct(item) ? 'info' : 'brand'}>
                      {t(`catalog.kind.${item.kind}`)}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-ink-600">{categoryName(item.categoryId)}</TableCell>

                  <TableCell numeric>
                    {item.costH > 0 ? (
                      <CurrencyDisplay amount={item.costH} />
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </TableCell>

                  <TableCell numeric className="font-medium text-ink-900">
                    <CurrencyDisplay amount={item.priceH} />
                  </TableCell>

                  <TableCell numeric>
                    {margin === null ? (
                      <span className="text-ink-400">—</span>
                    ) : (
                      <span className={margin < 0 ? 'text-danger-600' : 'text-ink-600'}>
                        {formatPercent(margin, { language })}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    {level === 'not_tracked' ? (
                      <span className="text-sm text-ink-400">{t('catalog.stock.notTracked')}</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="numeric font-medium text-ink-900">
                          {formatNumber(isProduct(item) ? item.stockQuantity : 0, { language })}
                        </span>
                        <Badge tone={STOCK_TONES[level]} dot>
                          {t(STOCK_LABEL_KEYS[level])}
                        </Badge>
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>

                  <TableCell align="end">
                    {/* Stop the click bubbling to the row, which would open the editor. */}
                    <div onClick={(event) => event.stopPropagation()}>
                      <Dropdown
                        align="end"
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                        items={[
                          {
                            key: 'edit',
                            label: t('catalog.actions.edit'),
                            icon: <Pencil />,
                            onSelect: () => onEdit(item),
                          },
                          {
                            key: 'status',
                            label:
                              item.status === 'active'
                                ? t('catalog.actions.deactivate')
                                : t('catalog.actions.activate'),
                            icon: item.status === 'active' ? <PowerOff /> : <Power />,
                            destructive: item.status === 'active',
                            separated: true,
                            onSelect: () => onToggleStatus(item),
                          },
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
