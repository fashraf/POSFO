import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Layers,
  Minus,
  PackagePlus,
  Plus,
  Tag,
  TrendingDown,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  CurrencyDisplay,
  Drawer,
  EmptyState,
  FormField,
  InfoHint,
  Input,
  KpiCard,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  Textarea,
  Tooltip,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import {
  catalogService,
  inventoryService,
  safeCall,
  vendorService,
} from '@/services';
import { isProduct, stockLevelOf } from '@/types/catalog';
import type { Product, Vendor } from '@/types/catalog';
import { useDataVersion } from '@/services/dataVersion';
import type {
  AdjustmentReason,
  InventorySummary,
  MovementKind,
  StockMovement,
} from '@/types/inventory';
import type { BadgeTone } from '@/components/ui';

const REASONS: AdjustmentReason[] = [
  'damaged',
  'expired',
  'lost',
  'found',
  'supplier_shortage',
  'internal_use',
  'other',
];

const MOVEMENT_TONES: Record<MovementKind, BadgeTone> = {
  purchase: 'success',
  sale: 'info',
  return: 'warning',
  adjustment: 'danger',
  stocktake: 'neutral',
  opening: 'neutral',
};


export default function InventoryPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const detail = useDisclosure();

  const [items, setItems] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<(Vendor & { balanceH: number })[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);

  /* Reloads when a save elsewhere changes what this page shows.
     Search, filters and paging are separate state, so the user
     keeps their place. */
  const dataVersion = useDataVersion('inventory', 'catalog', 'vendors');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'healthy'>('all');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selected, setSelected] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  /* Adjustment state */
  const [adjusting, setAdjusting] = useState(false);
  const [direction, setDirection] = useState<'remove' | 'add'>('remove');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('damaged');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  /* Receive wizard state */
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const [catalogResult, summaryResult, vendorResult] = await Promise.all([
      safeCall(() => catalogService.list({ pageSize: 500 })),
      safeCall(() => inventoryService.summary()),
      safeCall(() => vendorService.list()),
    ]);

    if (catalogResult.ok) {
      setItems(
        catalogResult.data.items.filter(isProduct).filter((item) => item.trackInventory),
      );
    }
    if (summaryResult.ok) setSummary(summaryResult.data);
    if (vendorResult.ok) setVendors(vendorResult.data.filter((v) => v.status === 'active'));

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);


  useEffect(() => {
    if (!adjusting) return;
    setDirection('remove');
    setQuantity('');
    setReason('damaged');
    setAdjustNote('');
    setAdjustError(null);
  }, [adjusting]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const visible = useMemo(() => {
    const needle = debouncedSearch.trim().toLocaleLowerCase();

    return items.filter((item) => {
      if (needle) {
        const haystack = `${item.nameAr} ${item.nameEn} ${item.sku} ${item.barcode}`;
        if (!haystack.toLocaleLowerCase().includes(needle)) return false;
      }

      const level = stockLevelOf(item);
      if (filter === 'low') return level === 'low_stock';
      if (filter === 'out') return level === 'out_of_stock';
      if (filter === 'healthy') return level === 'in_stock';
      return true;
    });
  }, [items, debouncedSearch, filter]);

  const counts = useMemo(
    () => ({
      all: items.length,
      low: items.filter((item) => stockLevelOf(item) === 'low_stock').length,
      out: items.filter((item) => stockLevelOf(item) === 'out_of_stock').length,
      healthy: items.filter((item) => stockLevelOf(item) === 'in_stock').length,
    }),
    [items],
  );

  async function openItem(item: Product) {
    setSelected(item);
    detail.open();
    setMovementsLoading(true);
    const result = await safeCall(() => inventoryService.movementsFor(item.id));
    setMovements(result.ok ? result.data : []);
    setMovementsLoading(false);
  }

  async function submitAdjustment() {
    if (!selected) return;

    const magnitude = Number(quantity) || 0;
    if (magnitude <= 0) {
      setAdjustError(t('inventory.adjustModal.quantity'));
      return;
    }

    setSubmitting(true);
    const result = await safeCall(() =>
      inventoryService.adjust({
        itemId: selected.id,
        quantity: direction === 'remove' ? -magnitude : magnitude,
        reason,
        note: adjustNote,
      }),
    );
    setSubmitting(false);

    if (!result.ok) {
      setAdjustError(result.error.message);
      return;
    }

    toast.success(t('inventory.toast.adjusted'));
    setAdjusting(false);
    await load();

    const [refreshed, movementResult] = await Promise.all([
      safeCall(() => catalogService.get(selected.id)),
      safeCall(() => inventoryService.movementsFor(selected.id)),
    ]);
    if (refreshed.ok && isProduct(refreshed.data)) setSelected(refreshed.data);
    if (movementResult.ok) setMovements(movementResult.data);
  }




  const magnitude = Number(quantity) || 0;
  const afterQuantity = selected
    ? selected.stockQuantity + (direction === 'remove' ? -magnitude : magnitude)
    : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('inventory.title')}
        description={t('inventory.description')}
        actions={
          <Button
            leadingIcon={<PackagePlus />}
            onClick={() => navigate(ROUTES.restock)}
            disabled={vendors.length === 0}
          >
            {t('restock.open')}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('inventory.summary.stockValue')}
              <InfoHint content={t('inventory.summary.stockValueHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={summary?.totalValueH ?? 0} />}
          icon={<Boxes />}
        />
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('inventory.summary.retailValue')}
              <InfoHint content={t('inventory.summary.retailValueHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={summary?.retailValueH ?? 0} />}
          icon={<Tag />}
        />
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('inventory.summary.needsAttention')}
              <InfoHint content={t('inventory.summary.needsAttentionHelp')} />
            </span>
          }
          value={
            <span className="numeric">
              {formatNumber((summary?.lowStock ?? 0) + (summary?.outOfStock ?? 0), { language })}
            </span>
          }
          icon={<AlertTriangle />}
        />
        <KpiCard
          label={
            <span className="flex items-center gap-1.5">
              {t('inventory.summary.shrinkage')}
              <InfoHint content={t('inventory.summary.shrinkageHelp')} />
            </span>
          }
          value={<CurrencyDisplay amount={summary?.shrinkageH ?? 0} />}
          icon={<TrendingDown />}
          invertTrend
        />
      </div>

      {vendors.length === 0 && (
        <Alert tone="info" title={t('vendors.empty.title')}>
          {t('vendors.empty.description')}
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          variant="pill"
          value={filter}
          onChange={(value) => setFilter(value as typeof filter)}
          aria-label={t('inventory.title')}
          items={[
            { value: 'all', label: t('inventory.filters.all'), count: counts.all },
            { value: 'low', label: t('inventory.filters.low'), count: counts.low },
            { value: 'out', label: t('inventory.filters.out'), count: counts.out },
            { value: 'healthy', label: t('inventory.filters.healthy'), count: counts.healthy },
          ]}
        />

        <SearchInput
          className="sm:max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
        />
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={5} columns={6} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('inventory.columns.item')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('inventory.columns.onHand')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('inventory.columns.minLevel')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('inventory.columns.cost')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('inventory.columns.value')}</TableHeaderCell>
                <TableHeaderCell>{t('inventory.columns.status')}</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={6}>
                  <EmptyState
                    icon={<Layers />}
                    title={t('inventory.empty.title')}
                    description={t('inventory.empty.description')}
                    action={
                      <Button variant="outline" onClick={() => navigate(ROUTES.catalog)}>
                        {t('inventory.empty.action')}
                      </Button>
                    }
                  />
                </TableEmptyRow>
              ) : (
                visible.map((item) => {
                  const level = stockLevelOf(item);
                  return (
                    <TableRow key={item.id} interactive onClick={() => void openItem(item)}>
                      <TableCell>
                        <p className="font-medium text-ink-900">{nameOf(item)}</p>
                        <p className="numeric text-xs text-ink-400" dir="ltr">
                          {item.sku}
                        </p>
                      </TableCell>
                      <TableCell numeric className="font-medium text-ink-900">
                        {formatNumber(item.stockQuantity, { language })}
                      </TableCell>
                      <TableCell numeric className="text-ink-500">
                        {formatNumber(item.minStockLevel, { language })}
                      </TableCell>
                      <TableCell numeric className="text-ink-600">
                        <CurrencyDisplay amount={item.costH} />
                      </TableCell>
                      <TableCell numeric className="font-medium text-ink-900">
                        <CurrencyDisplay amount={item.costH * item.stockQuantity} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            level === 'out_of_stock'
                              ? 'danger'
                              : level === 'low_stock'
                                ? 'warning'
                                : 'success'
                          }
                          dot
                        >
                          {t(
                            level === 'out_of_stock'
                              ? 'catalog.stock.outOfStock'
                              : level === 'low_stock'
                                ? 'catalog.stock.lowStock'
                                : 'catalog.stock.inStock',
                          )}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Item detail with movement ledger */}
      <Drawer
        open={detail.isOpen}
        onClose={detail.close}
        size="lg"
        title={selected ? nameOf(selected) : ''}
        description={selected?.sku}
        footer={
          <>
            <Button variant="outline" leadingIcon={<Minus />} onClick={() => setAdjusting(true)}>
              {t('inventory.adjust')}
            </Button>
            <Button
              leadingIcon={<PackagePlus />}
              onClick={() => navigate(`${ROUTES.restock}?item=${selected?.id ?? ''}`)}
            >
              {t('restock.open')}
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-ink-200 bg-surface p-3.5">
                <p className="text-xs text-ink-500">{t('inventory.columns.onHand')}</p>
                <p className="numeric mt-0.5 text-xl font-semibold text-ink-900">
                  {formatNumber(selected.stockQuantity, { language })}
                </p>
              </div>
              <div className="rounded-md border border-ink-200 bg-surface p-3.5">
                <p className="text-xs text-ink-500">{t('inventory.columns.cost')}</p>
                <CurrencyDisplay
                  amount={selected.costH}
                  className="mt-0.5 block text-xl font-semibold text-ink-900"
                />
              </div>
              <div className="rounded-md border border-ink-200 bg-surface p-3.5">
                <p className="text-xs text-ink-500">{t('inventory.columns.value')}</p>
                <CurrencyDisplay
                  amount={selected.costH * selected.stockQuantity}
                  className="mt-0.5 block text-xl font-semibold text-ink-900"
                />
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('inventory.movements.title')}
                <InfoHint content={t('inventory.movements.help')} />
              </h3>

              {movementsLoading ? (
                <LoadingState className="py-10" />
              ) : movements.length === 0 ? (
                <div className="rounded-md border border-dashed border-ink-300 px-4 py-8 text-center">
                  <p className="text-base font-medium text-ink-700">
                    {t('inventory.movements.none')}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-400">
                    {t('inventory.movements.noneHint')}
                  </p>
                </div>
              ) : (
                <ul className="divide-dotted-y overflow-hidden rounded-md border border-ink-200">
                  {movements.map((movement) => {
                    const Icon = movement.quantity > 0 ? ArrowUpRight : ArrowDownLeft;
                    return (
                      <li key={movement.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <Tooltip content={t(`inventory.movements.kind.${movement.kind}`)}>
                          <span
                            aria-hidden
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                              movement.quantity > 0
                                ? 'bg-success-50 text-success-600'
                                : 'bg-ink-100 text-ink-500',
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                        </Tooltip>

                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5">
                            <span className="numeric truncate text-base font-medium text-ink-900">
                              {movement.reference}
                            </span>
                            <Badge tone={MOVEMENT_TONES[movement.kind]}>
                              {t(`inventory.movements.kind.${movement.kind}`)}
                            </Badge>
                          </p>
                          <p className="text-xs text-ink-400">
                            {formatDate(movement.occurredAt, { language, withTime: true })}
                            {movement.note ? ` · ${movement.note}` : ''}
                          </p>
                        </div>

                        <div className="text-end">
                          <span
                            className={cn(
                              'numeric block text-base font-semibold',
                              movement.quantity > 0 ? 'text-success-600' : 'text-ink-700',
                            )}
                          >
                            {movement.quantity > 0 ? '+' : ''}
                            {formatNumber(movement.quantity, { language })}
                          </span>
                          <span className="numeric text-xs text-ink-400">
                            {t('inventory.movements.balanceAfter')}: {movement.balanceAfter}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* Adjustment */}
      <Modal
        open={adjusting}
        onClose={() => setAdjusting(false)}
        title={t('inventory.adjustModal.title')}
        description={t('inventory.adjustModal.description')}
        dismissible={!submitting}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjusting(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={direction === 'remove' ? 'danger' : 'primary'}
              onClick={submitAdjustment}
              loading={submitting}
              disabled={magnitude <= 0 || afterQuantity < 0}
            >
              {t('inventory.adjustModal.confirm')}
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              {(['remove', 'add'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDirection(value);
                    setReason(value === 'remove' ? 'damaged' : 'found');
                  }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md border p-3 transition-colors',
                    direction === value
                      ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30'
                      : 'border-ink-200 bg-surface hover:border-ink-300',
                  )}
                >
                  {value === 'remove' ? (
                    <Minus className="h-4 w-4 text-danger-500" />
                  ) : (
                    <Plus className="h-4 w-4 text-success-500" />
                  )}
                  <span className="text-base font-medium text-ink-800">
                    {t(`inventory.adjustModal.${value}`)}
                  </span>
                </button>
              ))}
            </div>

            <FormField label={t('inventory.adjustModal.quantity')} required>
              <Input
                type="number"
                min="1"
                dir="ltr"
                autoFocus
                className="tabular text-start"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setAdjustError(null);
                }}
              />
            </FormField>

            <FormField
              label={t('inventory.adjustModal.reason')}
              required
              help={t('inventory.adjustModal.reasonHelp')}
            >
              <Select
                value={reason}
                onChange={(value) => setReason(value as AdjustmentReason)}
                options={REASONS.filter((value) =>
                  direction === 'add' ? value === 'found' || value === 'other' : value !== 'found',
                ).map((value) => ({
                  value,
                  label: t(`inventory.adjustModal.reasons.${value}`),
                }))}
              />
            </FormField>

            <FormField
              label={t('inventory.adjustModal.note')}
              required={reason === 'other'}
              showOptional={reason !== 'other'}
              hint={reason === 'other' ? t('inventory.adjustModal.noteRequired') : undefined}
            >
              <Textarea
                rows={2}
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </FormField>

            {adjustError && (
              <Alert tone="danger" compact>
                {adjustError}
              </Alert>
            )}

            <dl className="space-y-1.5 rounded-md border border-ink-200 bg-ink-50/60 p-3.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">{t('inventory.adjustModal.current')}</dt>
                <dd className="numeric font-medium text-ink-700">
                  {formatNumber(selected.stockQuantity, { language })}
                </dd>
              </div>
              <hr className="rule-dotted my-1.5" />
              <div className="flex justify-between">
                <dt className="font-semibold text-ink-900">{t('inventory.adjustModal.after')}</dt>
                <dd
                  className={cn(
                    'numeric text-md font-semibold',
                    afterQuantity < 0 ? 'text-danger-600' : 'text-ink-900',
                  )}
                >
                  {formatNumber(Math.max(0, afterQuantity), { language })}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

    </div>
  );
}
