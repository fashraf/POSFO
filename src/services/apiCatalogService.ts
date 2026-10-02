import type { ListQuery, Paginated } from '@/types';
import type { PrintGroup } from '@/types/printing';
import type {
  CatalogFilters,
  CatalogItem,
  CatalogItemInput,
  Category,
  Product,
} from '@/types/catalog';
import { isProduct, stockLevelOf } from '@/types/catalog';
import {
  activationApi,
  catalogApi,
  categoryApi,
  inventoryApi,
  printGroupApi,
  type ApiCatalogItem,
  type ApiCategory,
  type ApiPrintGroup,
  type ApiSaveCatalogItem,
} from './api';
import { HttpError } from './http';
import { utc } from './mappers/time';
import { MAX_PAGE_SIZE } from './api/catalogApi';
import { invalidate } from './dataVersion';

/**
 * Catalog, from the API.
 *
 * `catalogService` re-exports these methods, so components never import this
 * file directly.
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
    /* The form has one description box; the table has one per language. Show
       whichever is filled, and save the box into both (see toPayload). */
    description: row.descriptionEn ?? row.descriptionAr ?? '',
    imageUrl: null,
    priceH: row.priceH,
    costH: row.costH,
    /* The API has no per-item POS visibility flag; being active is what
       decides it. Omitting this is what emptied the grid. */
    showOnPos: row.isActive,
    requiresPreparation: row.requiresPreparation,
    printGroupId: row.printGroupId ?? null,
    status: (row.isActive ? 'active' : 'inactive') as CatalogItem['status'],
    /* The item routes carry no timestamps; empty rather than invented. */
    createdAt: '',
    updatedAt: '',
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
    vendorId: row.vendorId ?? null,
    unit: 'piece',
    trackInventory: row.tracksStock,
    stockQuantity: row.quantity,
    minStockLevel: row.reorderLevel,
  };
}

/**
 * The form's input, in the API's shape.
 *
 * Blank strings go as null: an empty barcode means "no barcode", and sent as ''
 * it would collide with every other item that has none.
 */
function toPayload(input: CatalogItemInput): ApiSaveCatalogItem {
  const blank = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
  const isProductInput = input.kind === 'product';
  const description = blank(input.description);

  return {
    kind: input.kind,
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn.trim(),
    descriptionAr: description,
    descriptionEn: description,
    sku: isProductInput ? blank(input.sku) : null,
    barcode: isProductInput ? blank(input.barcode) : null,
    categoryId: input.categoryId || null,
    vendorId: isProductInput ? input.vendorId || null : null,
    printGroupId: input.printGroupId || null,
    priceH: input.priceH,
    costH: input.costH,
    tracksStock: isProductInput ? (input.trackInventory ?? true) : false,
    reorderLevel: isProductInput ? Math.round(input.minStockLevel ?? 0) : 0,
    requiresPreparation: input.requiresPreparation ?? false,
    isActive: input.status === 'active',
  };
}

/**
 * Bring the branch's stock to what the form says.
 *
 * The item save does not touch stock — quantity belongs to a branch and moves
 * only through recorded movements — so an opening or corrected quantity is
 * posted as an adjustment, which leaves a trail explaining it.
 */
async function syncStock(saved: ApiCatalogItem, input: CatalogItemInput): Promise<void> {
  if (input.kind !== 'product' || !saved.tracksStock) return;

  const wanted = Math.max(0, input.stockQuantity ?? 0);
  if (wanted === saved.quantity) return;

  const branchId = activeBranchId;
  if (!branchId) {
    throw new Error(
      'The item was saved, but its stock was not: no branch is selected, and stock is held per branch.',
    );
  }

  await inventoryApi.adjust(saved.itemId, {
    branchId,
    newQuantity: wanted,
    reasonEn: 'Set from product form',
    reasonAr: 'تعديل من نموذج المنتج',
  });
}

/** The page sends filters nested, with 'all' meaning "no filter". */
type CatalogListArgs = ListQuery &
  CatalogFilters & {
    branchId?: string | null;
    filters?: CatalogFilters & Record<string, unknown>;
  };

function filterValue(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' && value !== 'all' ? value : undefined;
}

export interface CatalogSummary {
  total: number;
  products: number;
  services: number;
  lowStock: number;
  outOfStock: number;
  /** Total cost value of tracked stock, in minor units. */
  inventoryValueH: number;
}

export const apiCatalogService = {
  async list(query: CatalogListArgs = {}): Promise<Paginated<CatalogItem>> {
    const filters = { ...query, ...(query.filters ?? {}) };
    const status = filterValue(filters.status);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;

    const criteria = {
      search: query.search?.trim() || undefined,
      categoryId: filterValue(filters.categoryId),
      kind: filterValue(filters.kind),
      /* Fall back to the active branch. Without one the stock join matches
         nothing and every quantity reads zero — which looks like empty shelves
         rather than a missing parameter. */
      branchId: query.branchId ?? activeBranchId ?? undefined,
      /* The list screen shows inactive items too, and can filter to either. */
      activeOnly: false,
      status: status === 'active' || status === 'inactive' ? (status as 'active' | 'inactive') : undefined,
    };

    /* The route caps a page at 200. A picker that asks for 500 wants all of
       them, so walk the pages rather than hand back the first 200 as if that
       were everything. */
    if (pageSize > MAX_PAGE_SIZE) {
      const all = await catalogApi.allItems(criteria);
      const start = (page - 1) * pageSize;

      return {
        items: all.slice(start, start + pageSize).map(toItem),
        page,
        pageSize,
        total: all.length,
      } as Paginated<CatalogItem>;
    }

    const result = await catalogApi.items({ ...criteria, page, pageSize });

    return {
      items: result.items.map(toItem),
      page: result.page,
      pageSize: result.pageSize,
      total: result.totalCount,
    } as Paginated<CatalogItem>;
  },

  async get(id: string): Promise<CatalogItem> {
    return toItem(await catalogApi.item(id, activeBranchId));
  },

  async create(input: CatalogItemInput): Promise<CatalogItem> {
    const saved = await catalogApi.create(toPayload(input), activeBranchId);

    try {
      await syncStock(saved, input);
    } finally {
      /* Announce even if the stock step failed: the item itself exists now. */
      invalidate('catalog', 'inventory');
    }

    return apiCatalogService.get(saved.itemId);
  },

  async update(id: string, input: CatalogItemInput): Promise<CatalogItem> {
    const saved = await catalogApi.update(id, toPayload(input), activeBranchId);

    try {
      await syncStock(saved, input);
    } finally {
      invalidate('catalog', 'inventory');
    }

    return apiCatalogService.get(saved.itemId);
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

  /**
   * Items at or below their reorder level, worst first.
   *
   * The levels route returns a stock-shaped row, which carries no barcode,
   * vendor or print group. Those read as empty here; the callers show names
   * and quantities only, and the full item is one `get` away.
   */
  async lowStock(limit = 5, branchId?: string | null): Promise<Product[]> {
    const rows = await inventoryApi.allLevels({
      branchId: branchId ?? activeBranchId,
      lowOnly: true,
    });

    return rows
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, limit)
      .map((row) => ({
        id: row.itemId,
        kind: 'product',
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        categoryId: row.categoryId ?? null,
        description: '',
        imageUrl: null,
        priceH: row.priceH,
        costH: row.costH,
        /* The levels route lists active items only. */
        showOnPos: true,
        requiresPreparation: false,
        printGroupId: null,
        status: 'active',
        sku: row.sku ?? '',
        barcode: '',
        vendorId: null,
        unit: 'piece',
        trackInventory: true,
        stockQuantity: row.quantity,
        minStockLevel: row.reorderLevel,
        /* The levels route carries no timestamps. */
        createdAt: '',
        updatedAt: '',
      }));
  },

  /**
   * Headline counts for the catalog page.
   *
   * Computed from the item list for the active branch, whose rows already
   * carry that branch's quantity — so the stock figures and the item counts
   * come from one read and cannot disagree.
   */
  async summary(): Promise<CatalogSummary> {
    const rows = await catalogApi.allItems({
      branchId: activeBranchId ?? undefined,
      activeOnly: false,
    });
    const items = rows.map(toItem);
    const products = items.filter(isProduct);

    return {
      total: items.length,
      products: products.length,
      services: items.length - products.length,
      lowStock: items.filter((item) => stockLevelOf(item) === 'low_stock').length,
      outOfStock: items.filter((item) => stockLevelOf(item) === 'out_of_stock').length,
      inventoryValueH: products
        .filter((product) => product.trackInventory)
        .reduce((sum, product) => sum + product.costH * Math.max(0, product.stockQuantity), 0),
    };
  },
};

/*
 * The branch stock adjustments apply to.
 *
 * Stock is physical and belongs to a branch, but the service signatures have
 * no room for one. The app sets it when the active branch changes,
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
   * The server refuses when something depends on the
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

/** The fields a category is created or edited with. */
export type CategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt'>;

function toCategory(row: ApiCategory): Category {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    appliesTo: row.appliesTo,
    sortOrder: row.sortOrder,
    status: row.status,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

function toCategoryPayload(input: CategoryInput) {
  return {
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn.trim(),
    appliesTo: input.appliesTo,
    sortOrder: input.sortOrder,
    /* The server knows active and inactive; archived is the screen's word for
       the same thing. */
    status: input.status === 'active' ? ('active' as const) : ('inactive' as const),
  };
}

export const apiCategoryService = {
  /**
   * Categories in rail order. Active only by default — what the POS rail
   * shows; the catalog screen asks for the inactive ones too.
   */
  async list(options: { includeInactive?: boolean } = {}): Promise<Category[]> {
    const rows = await categoryApi.list(options.includeInactive ?? false);
    return rows.map(toCategory);
  },

  /** How many catalog items point at each category. Drives the count column. */
  async usage(): Promise<Record<string, number>> {
    return categoryApi.usage();
  },

  async create(input: CategoryInput): Promise<Category> {
    const created = await categoryApi.create(toCategoryPayload(input));
    invalidate('catalog');
    return toCategory(created);
  },

  /** Refused (409 deactivation_blocked) when switching off one with live items. */
  async update(id: string, input: CategoryInput): Promise<Category> {
    const updated = await categoryApi.update(id, toCategoryPayload(input));
    invalidate('catalog');
    return toCategory(updated);
  },
};

function toPrintGroup(row: ApiPrintGroup): PrintGroup {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    ticketTitle: row.ticketTitle,
    sortOrder: row.sortOrder,
    status: row.status,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

export const apiPrintGroupService = {
  /**
   * Every print group, inactive included, in sort order. Callers that print
   * skip the inactive ones themselves (buildPrintDocuments), and a screen
   * naming an old template's group still finds it.
   */
  async list(): Promise<PrintGroup[]> {
    const rows = await printGroupApi.list(true);
    return rows.map(toPrintGroup).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async create(input: { nameAr: string; nameEn: string; ticketTitle: string }): Promise<PrintGroup> {
    const created = await printGroupApi.create({
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      /* Blank prints the English name. */
      ticketTitle: input.ticketTitle.trim() || null,
    });
    invalidate('catalog');
    return toPrintGroup(created);
  },

  async update(
    id: string,
    input: { nameAr: string; nameEn: string; ticketTitle: string; sortOrder?: number; status?: 'active' | 'inactive' },
  ): Promise<PrintGroup> {
    const updated = await printGroupApi.update(id, {
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      ticketTitle: input.ticketTitle.trim() || null,
      sortOrder: input.sortOrder ?? null,
      status: input.status,
    });
    invalidate('catalog');
    return toPrintGroup(updated);
  },

  /** Through the activation route, which refuses while active items use it. */
  async setStatus(id: string, status: 'active' | 'inactive'): Promise<PrintGroup> {
    await activationApi.set('printGroup', id, status === 'active');
    invalidate('catalog');

    const group = (await apiPrintGroupService.list()).find((candidate) => candidate.id === id);
    if (!group) {
      throw new HttpError({ status: 404, code: 'not_found', message: 'Print group not found.' });
    }
    return group;
  },
};
