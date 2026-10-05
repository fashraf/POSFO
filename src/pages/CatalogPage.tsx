import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Box, Package, Plus, Wrench } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  CurrencyDisplay,
  KpiCard,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Tabs,
} from '@/components/ui';
import { CatalogItemForm } from '@/features/catalog/CatalogItemForm';
import { CatalogTable } from '@/features/catalog/CatalogTable';
import { CategoriesPanel } from '@/features/catalog/CategoriesPanel';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearchParamSeed } from '@/hooks/useSearchParamSeed';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { formatNumber } from '@/lib/format';
import {
  catalogService,
  categoryService,
  printGroupService,
  staffService,
  vendorService,
  type CatalogSummary,
} from '@/services';
import { safeCall } from '@/services';
import { DeactivationBlocked } from '@/services/api';
import { useDataVersion } from '@/services/dataVersion';
import type { PrintGroup } from '@/types/printing';
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemKind,
  Category,
  StaffMember,
  Vendor,
} from '@/types/catalog';
import type { RecordStatus } from '@/types';

const PAGE_SIZE = 10;

type TabValue = 'all' | 'products' | 'services' | 'categories';

export default function CatalogPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();

  /* Offer only what the server will accept. Showing an action it then refuses
     with 403 reads as a broken screen rather than a missing permission. */
  const { can } = useSession();
  const canCreate = can('products.create');
  const canEdit = can('products.edit');
  const canToggle = can('catalog.activate');

  /* ---- reference data, loaded once ---- */
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [printGroups, setPrintGroups] = useState<PrintGroup[]>([]);

  /* ---- list state ---- */
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  /* Reloads when a save elsewhere changes what this page shows.
     Search, filters and paging are separate state, so the user keeps
     their place. */
  const dataVersion = useDataVersion('catalog');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);

  /* ---- query state ---- */
  const [tab, setTab] = useState<TabValue>('all');
  const [search, setSearch] = useState('');
  /* The header search opens this page with ?q=<SKU or name>, on the All tab. */
  useSearchParamSeed((value) => {
    setTab('all');
    setSearch(value);
  });
  const [categoryId, setCategoryId] = useState('all');
  const [status, setStatus] = useState<RecordStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  /* ---- editor state ---- */
  const form = useDisclosure();
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [defaultKind, setDefaultKind] = useState<CatalogItemKind>('product');
  const [pendingToggle, setPendingToggle] = useState<CatalogItem | null>(null);
  const [toggling, setToggling] = useState(false);

  const kindFilter: CatalogItemKind | 'all' =
    tab === 'products' ? 'product' : tab === 'services' ? 'service' : 'all';

  const isFiltered =
    debouncedSearch.trim() !== '' || categoryId !== 'all' || status !== 'all' || kindFilter !== 'all';

  const loadReference = useCallback(async () => {
    const [categoryResult, vendorResult, staffResult, usageResult, printGroupResult] =
      await Promise.all([
      /* Inactive too: the categories tab manages them and shows their status. */
      safeCall(() => categoryService.list({ includeInactive: true })),
      safeCall(() => vendorService.list()),
      safeCall(() => staffService.list()),
      safeCall(() => categoryService.usage()),
      safeCall(() => printGroupService.list()),
    ]);

    if (categoryResult.ok) setCategories(categoryResult.data);
    if (vendorResult.ok) setVendors(vendorResult.data);
    if (staffResult.ok) setStaff(staffResult.data);
    if (usageResult.ok) setUsage(usageResult.data);
    if (printGroupResult.ok) setPrintGroups(printGroupResult.data);
  }, []);

  const loadSummary = useCallback(async () => {
    const result = await safeCall(() => catalogService.summary());
    if (result.ok) setSummary(result.data);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await safeCall(() =>
      catalogService.list({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        sortBy: language === 'ar' ? 'nameAr' : 'nameEn',
        filters: { kind: kindFilter, categoryId, status },
      }),
    );

    if (result.ok) {
      setItems(result.data.items);
      setTotal(result.data.total);
    } else {
      setError(result.error.message);
      setItems([]);
      setTotal(0);
    }

    setLoading(false);
  }, [page, debouncedSearch, kindFilter, categoryId, status, language]);

  useEffect(() => {
    void loadReference();
    void loadSummary();
  }, [loadReference, loadSummary, dataVersion]);

  useEffect(() => {
    if (tab === 'categories') return;
    void loadItems();
  }, [loadItems, tab, dataVersion]);

  /* Any filter change invalidates the current page number. */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, kindFilter, categoryId, status]);

  async function refreshAll() {
    await Promise.all([loadItems(), loadSummary(), loadReference()]);
  }

  function openCreate(kind: CatalogItemKind) {
    setEditing(null);
    setDefaultKind(kind);
    form.open();
  }

  function openEdit(item: CatalogItem) {
    setEditing(item);
    form.open();
  }

  /**
   * Returns true on success so the form knows whether to close. Validation
   * errors are re-thrown so the form can map them onto its fields.
   */
  async function handleSubmit(input: CatalogItemInput): Promise<boolean> {
    try {
      if (editing) {
        await catalogService.update(editing.id, input);
        toast.success(t('catalog.toast.updated'));
      } else {
        await catalogService.create(input);
        toast.success(t('catalog.toast.created'));
      }
      await refreshAll();
      return true;
    } catch (caught) {
      const failure = caught as { fieldErrors?: Record<string, string[]>; message?: string };
      if (failure.fieldErrors) throw caught;
      toast.error(t('catalog.toast.saveFailed'), failure.message);
      return false;
    }
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    setToggling(true);

    const target = pendingToggle;
    const result = await safeCall(() =>
      target.status === 'active'
        ? catalogService.deactivate(target.id)
        : catalogService.activate(target.id),
    );

    if (result.ok) {
      toast.success(
        target.status === 'active' ? t('catalog.toast.deactivated') : t('catalog.toast.activated'),
      );
      await refreshAll();
    } else if (result.error.cause instanceof DeactivationBlocked) {
      /*
       * A refusal, not a failure.
       *
       * The server checked and said no, and its message names what is in the
       * way — a category holding live items, a customer who still owes money.
       * Showing "could not save" would discard the one sentence that tells the
       * person what to do next.
       */
      toast.warning(t('catalog.toast.cannotDeactivate'), result.error.message);
    } else {
      toast.error(t('catalog.toast.saveFailed'), result.error.message);
    }

    setToggling(false);
    setPendingToggle(null);
  }

  function handleToggleRequest(item: CatalogItem) {
    /* Activating is harmless, so it does not need a confirmation step. */
    if (item.status !== 'active') {
      setPendingToggle(item);
      void (async () => {
        const result = await safeCall(() => catalogService.activate(item.id));
        if (result.ok) {
          toast.success(t('catalog.toast.activated'));
          await refreshAll();
        }
        setPendingToggle(null);
      })();
      return;
    }
    setPendingToggle(item);
  }

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: t('catalog.filters.allCategories') },
      ...categories.map((category) => ({
        value: category.id,
        label: language === 'ar' ? category.nameAr : category.nameEn,
      })),
    ],
    [categories, language, t],
  );

  /**
   * A refused category save: a named field (duplicate or missing name) goes
   * beside its input in the user's language; anything else is a toast.
   */
  function categoryFailure(error: {
    message: string;
    fieldErrors?: Record<string, string[]>;
  }): { fieldErrors?: Record<string, string> } {
    const fields = Object.keys(error.fieldErrors ?? {});
    if (fields.length > 0) {
      return { fieldErrors: Object.fromEntries(fields.map((field) => [field, error.message])) };
    }
    toast.error(t('catalog.toast.saveFailed'), error.message);
    return {};
  }

  const lowStockTotal = (summary?.lowStock ?? 0) + (summary?.outOfStock ?? 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('catalog.title')}
        description={t('catalog.description')}
        actions={
          canCreate ? (
            <>
              <Button variant="outline" leadingIcon={<Wrench />} onClick={() => openCreate('service')}>
                {t('catalog.addService')}
              </Button>
              <Button leadingIcon={<Plus />} onClick={() => openCreate('product')}>
                {t('catalog.addProduct')}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t('catalog.summary.totalItems')}
          value={<span className="numeric">{formatNumber(summary?.total ?? 0, { language })}</span>}
          icon={<Package />}
        />
        <KpiCard
          label={t('catalog.summary.products')}
          value={<span className="numeric">{formatNumber(summary?.products ?? 0, { language })}</span>}
          icon={<Box />}
        />
        <KpiCard
          label={t('catalog.summary.services')}
          value={<span className="numeric">{formatNumber(summary?.services ?? 0, { language })}</span>}
          icon={<Wrench />}
        />
        <KpiCard
          label={t('catalog.summary.inventoryValue')}
          value={<CurrencyDisplay amount={summary?.inventoryValueH ?? 0} />}
          icon={<AlertTriangle />}
          changeLabel={
            lowStockTotal > 0
              ? t('catalog.summary.lowStockCount', {
                  count: formatNumber(lowStockTotal, { language }),
                })
              : undefined
          }
        />
      </div>

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as TabValue)}
        aria-label={t('catalog.title')}
        items={[
          { value: 'all', label: t('catalog.tabs.all'), count: summary?.total },
          { value: 'products', label: t('catalog.tabs.products'), count: summary?.products },
          { value: 'services', label: t('catalog.tabs.services'), count: summary?.services },
          { value: 'categories', label: t('catalog.tabs.categories'), count: categories.length },
        ]}
      />

      {tab === 'categories' ? (
        <div className="space-y-4">
          <CategoriesPanel
            categories={categories}
            usage={usage}
            onCreate={
              canCreate
                ? async (input) => {
                    const result = await safeCall(() => categoryService.create(input));
                    if (result.ok) {
                      toast.success(t('catalog.toast.categoryCreated'));
                      await loadReference();
                      return true;
                    }
                    return categoryFailure(result.error);
                  }
                : undefined
            }
            onUpdate={
              canEdit
                ? async (category, input) => {
                    const result = await safeCall(() => categoryService.update(category.id, input));
                    if (result.ok) {
                      toast.success(t('catalog.toast.categoryUpdated'));
                      await loadReference();
                      return true;
                    }
                    return categoryFailure(result.error);
                  }
                : undefined
            }
            onToggleStatus={
              canToggle
                ? async (category) => {
                    const activating = category.status !== 'active';
                    const result = await safeCall(() =>
                      categoryService.setActive(category.id, activating),
                    );
                    if (result.ok) {
                      toast.success(
                        activating
                          ? t('catalog.toast.categoryActivated')
                          : t('catalog.toast.categoryDeactivated'),
                      );
                      await loadReference();
                    } else if (result.error.cause instanceof DeactivationBlocked) {
                      /* The server's sentence names how many live items are in the way. */
                      toast.warning(t('catalog.toast.cannotDeactivate'), result.error.message);
                    } else {
                      toast.error(t('catalog.toast.saveFailed'), result.error.message);
                    }
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              className="sm:max-w-xs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />

            <div className="flex flex-1 items-center gap-3">
              <Select
                selectSize="md"
                className="sm:max-w-[12rem]"
                value={categoryId}
                onChange={(value) => setCategoryId(value)}
                options={categoryOptions}
              />

              <Select
                selectSize="md"
                className="sm:max-w-[11rem]"
                value={status}
                onChange={(value) => setStatus(value as RecordStatus | 'all')}
                options={[
                  { value: 'all', label: t('catalog.filters.allStatuses') },
                  { value: 'active', label: t('common.active') },
                  { value: 'inactive', label: t('common.inactive') },
                ]}
              />
            </div>
          </div>

          <CatalogTable
            items={items}
            categories={categories}
            loading={loading}
            error={error}
            filtered={isFiltered}
            onRetry={() => void loadItems()}
            onEdit={canEdit ? openEdit : undefined}
            onToggleStatus={canToggle ? handleToggleRequest : undefined}
            onCreate={canCreate ? () => openCreate('product') : undefined}
          />

          {total > PAGE_SIZE && (
            <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                className="border-t-0"
              />
            </div>
          )}
        </div>
      )}

      <CatalogItemForm
        open={form.isOpen}
        onClose={form.close}
        item={editing}
        defaultKind={defaultKind}
        /* A new assignment only to a live category; the item's own stays
           selectable so editing does not silently drop it. */
        categories={categories.filter(
          (category) => category.status === 'active' || category.id === editing?.categoryId,
        )}
        printGroups={printGroups}
        vendors={vendors}
        staff={staff}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(pendingToggle) && pendingToggle?.status === 'active'}
        onClose={() => setPendingToggle(null)}
        onConfirm={confirmToggle}
        loading={toggling}
        title={t('catalog.confirm.deactivateTitle')}
        description={t('catalog.confirm.deactivateDescription')}
        confirmLabel={t('catalog.actions.deactivate')}
      />
    </div>
  );
}
