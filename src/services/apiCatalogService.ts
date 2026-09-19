import type { ListQuery, Paginated } from '@/types';
import type { CatalogFilters, CatalogItem, Category } from '@/types/catalog';
import { activationApi, catalogApi, inventoryApi, type ApiCatalogItem } from './api';
import { invalidate } from './dataVersion';

/**
 * Catalog, from the API.
 *
 * Method-for-method the same shape as the mock service, so `catalogService`
 * swaps between them on one flag and no component knows the difference.
 *
 * The API already speaks the domain — integer halalas, both language columns —
 * so this layer renames fields and nothing more. Anything more would mean the
 * two sides disagree about what a catalog item is.
 */

function toItem(row: ApiCatalogItem): CatalogItem {
  /*
   * Field by field, with no cast.
   *
   * The previous version ended in `as unknown as CatalogItem` and invented
   * field names — `stock` and `tracksStock` instead of `stockQuantity` and
   * `trackInventory`, and no `showOnPos` at all. The compiler accepted it and
   * the POS grid showed nothing, because it filters on a flag that was always
   * undefined. That is the whole argument against the cast, in one bug.
   */
  const base = {
    id: row.itemId,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    categoryId: row.categoryId ?? null,
    description: '',
    imageUrl: null,
    priceH: row.priceH,
    costH: row.costH,
    /* The API has no per-item POS visibility flag; being active is what
       decides it. Omitting this is what emptied the grid. */
    showOnPos: row.isActive,
    requiresPreparation: row.requiresPreparation,
    printGroupId: row.printGroupId ?? null,
    status: (row.isActive ? 'active' : 'inactive') as CatalogItem['status'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (row.kind === 'service') {
    return {
      ...base,
      kind: 'service',
      durationMinutes: null,
      providerId: null,
    };
  }

  return {
    ...base,
    kind: 'product',
    sku: row.sku ?? '',
    barcode: row.barcode ?? '',
    vendorId: null,
    unit: 'piece',
    trackInventory: row.tracksStock,
    stockQuantity: row.quantity,
    minStockLevel: row.reorderLevel,
  };
}

export const apiCatalogService = {
  async list(
    query: ListQuery & CatalogFilters & { branchId?: string | null } = {},
  ): Promise<Paginated<CatalogItem>> {
    const page = await catalogApi.items({
      search: query.search,
      categoryId: (query as { categoryId?: string }).categoryId,
      kind: (query as { kind?: string }).kind,
      /* Fall back to the active branch. Without one the stock join matches
         nothing and every quantity reads zero — which looks like empty shelves
         rather than a missing parameter. */
      branchId: query.branchId ?? activeBranchId ?? undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 100,
      /* The list screen offers an inactive filter, so do not force active-only. */
      activeOnly: (query as { status?: string }).status === 'active',
    });

    return {
      items: page.items.map(toItem),
      page: page.page,
      pageSize: page.pageSize,
      total: page.totalCount,
    } as Paginated<CatalogItem>;
  },

  async get(id: string): Promise<CatalogItem> {
    /* No single-item route yet; the search is exact and returns one row. */
    const page = await catalogApi.items({ search: id, pageSize: 1 });
    const found = page.items.find((i) => i.itemId === id) ?? page.items[0];

    if (!found) throw new Error('Item not found.');
    return toItem(found);
  },

  /** The POS grid: sellable items for one branch, with live stock. */
  async posItems(branchId?: string | null): Promise<CatalogItem[]> {
    const page = await catalogApi.items({
      branchId: branchId ?? activeBranchId ?? undefined,
      activeOnly: true,
      pageSize: 200,
    });
    return page.items.map(toItem);
  },

  /** Items at or below their reorder level, as full catalog items. */
  async lowStock(branchId?: string | null): Promise<CatalogItem[]> {
    const page = await inventoryApi.levels({
      branchId: branchId ?? activeBranchId,
      lowOnly: true,
      pageSize: 100,
    });

    /* The levels endpoint returns a stock-shaped row. Callers expect catalog
       items, so map rather than leak a second shape into the screens. */
    return page.items.map((row) => ({
      id: row.itemId,
      kind: 'product',
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      sku: row.sku ?? undefined,
      categoryId: row.categoryId ?? null,
      priceH: row.priceH,
      costH: row.costH,
      tracksStock: true,
      trackInventory: true,
      stock: row.quantity,
      stockQuantity: row.quantity,
      reorderLevel: row.reorderLevel,
      status: 'active',
    })) as unknown as CatalogItem[];
  },

  /**
   * Adjust stock by a delta, matching the mock's signature.
   *
   * The API takes an absolute quantity, because the procedure posts the
   * difference against what is really on hand — a delta applied blind would
   * drift the moment two people adjusted at once. So the current level is read
   * first and the delta applied to that.
   */
  async adjustStock(id: string, delta: number): Promise<CatalogItem> {
    const branchId = activeBranchId;

    if (!branchId) {
      throw new Error(
        'No branch is selected. Stock is held per branch, so an adjustment needs one.',
      );
    }

    const levels = await inventoryApi.levels({ branchId, search: id, pageSize: 50 });
    const current = levels.items.find((row) => row.itemId === id);

    if (!current) throw new Error('That item does not track stock at this branch.');

    await inventoryApi.adjust(id, {
      branchId,
      newQuantity: Math.max(0, current.quantity + delta),
      reasonEn: delta >= 0 ? 'Manual increase' : 'Manual decrease',
      reasonAr: delta >= 0 ? 'زيادة يدوية' : 'خصم يدوي',
    });

    invalidate('inventory');

    return apiCatalogService.get(id);
  },
};

/*
 * The branch stock adjustments apply to.
 *
 * Stock is physical and belongs to a branch, but the mock signature this
 * mirrors has no room for one. The app sets it when the active branch changes,
 * which keeps the shared signature intact without guessing a branch.
 */
let activeBranchId: string | null = null;

export function setActiveBranchForStock(branchId: string | null): void {
  activeBranchId = branchId;
}

/** The branch stock writes apply to, or null if none is selected. */
export function activeBranchForStock(): string | null {
  return activeBranchId;
}

/**
 * Take a record out of circulation, or put it back.
 *
 * The server refuses when something depends on it — a category with live items,
 * a customer who still owes money — and says what. That refusal surfaces as
 * DeactivationBlocked so a screen can show the reason rather than "failed".
 */
export const apiItemActivation = {
  /**
   * Take an item out of circulation, or put it back.
   *
   * Named to match the mock service so the switch in catalogService picks it up
   * with no component change. The server refuses when something depends on the
   * record and says what — that refusal arrives as DeactivationBlocked, whose
   * message is written for the person reading it.
   */
  async deactivate(id: string): Promise<CatalogItem> {
    await activationApi.set('item', id, false);
    invalidate('catalog', 'inventory');
    return apiCatalogService.get(id);
  },

  async activate(id: string): Promise<CatalogItem> {
    await activationApi.set('item', id, true);
    invalidate('catalog', 'inventory');
    return apiCatalogService.get(id);
  },
};

export const apiActivationService = {
  async setItemActive(itemId: string, isActive: boolean) {
    await activationApi.set('item', itemId, isActive);
    invalidate('catalog', 'inventory');
  },

  async setCategoryActive(categoryId: string, isActive: boolean) {
    await activationApi.set('category', categoryId, isActive);
    invalidate('catalog');
  },

  async setVendorActive(vendorId: string, isActive: boolean) {
    await activationApi.set('vendor', vendorId, isActive);
    invalidate('vendors');
  },

  async setCustomerActive(customerId: string, isActive: boolean) {
    await activationApi.set('customer', customerId, isActive);
    invalidate('customers');
  },

  async setPrintGroupActive(printGroupId: string, isActive: boolean) {
    await activationApi.set('printGroup', printGroupId, isActive);
    invalidate('catalog');
  },

  async setDiscountActive(discountId: string, isActive: boolean) {
    await activationApi.set('discount', discountId, isActive);
    invalidate('catalog');
  },
};

export const apiCategoryService = {
  async list(): Promise<Category[]> {
    const rows = await catalogApi.categories();
    return rows.map((r) => ({
      id: r.id,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
    })) as unknown as Category[];
  },
};

export const apiPrintGroupService = {
  list() {
    return catalogApi.printGroups();
  },
};
