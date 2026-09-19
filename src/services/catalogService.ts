import { USE_MOCKS } from '@/config/env';
import { apiCatalogService, apiCategoryService, apiItemActivation } from './apiCatalogService';
import type { ListQuery, Paginated } from '@/types';
import type {
  CatalogFilters,
  CatalogItem,
  CatalogItemInput,
  Category,
  Product,
  Service,
  StaffMember,
} from '@/types/catalog';
import { isProduct, stockLevelOf } from '@/types/catalog';
import { SEED_CATALOG, SEED_CATEGORIES, SEED_STAFF } from './mock/seed';
import {
  compareBy,
  delay,
  matches,
  nextId,
  notFound,
  paginate,
  timestamp,
  validationFailed,
} from './mock/store';

/**
 * Catalog service.
 *
 * This is the contract the UI codes against. Today it resolves from an
 * in-memory collection; tomorrow each method becomes a single `http.get`/
 * `http.post` call against `/api/catalog/items`. The signatures do not change,
 * so no component needs touching.
 */

/* Mutable session state. Reloading the page restores the seed. */
let items: CatalogItem[] = [...SEED_CATALOG];
let categories: Category[] = [...SEED_CATEGORIES];
const staff: StaffMember[] = [...SEED_STAFF];

export interface CatalogListQuery extends ListQuery {
  filters?: CatalogFilters & Record<string, string | number | boolean | undefined>;
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

function searchable(item: CatalogItem): string {
  const base = [item.nameAr, item.nameEn, item.description];
  if (isProduct(item)) base.push(item.sku, item.barcode);
  return base.filter(Boolean).join(' ');
}

function validate(input: CatalogItemInput): void {
  const errors: Record<string, string[]> = {};

  if (!input.nameAr.trim()) errors.nameAr = ['Arabic name is required.'];
  if (!input.nameEn.trim()) errors.nameEn = ['English name is required.'];
  if (!Number.isFinite(input.priceH) || input.priceH < 0) {
    errors.priceH = ['Enter a selling price of zero or more.'];
  }
  if (!Number.isFinite(input.costH) || input.costH < 0) {
    errors.costH = ['Enter a cost of zero or more.'];
  }

  if (input.kind === 'product') {
    if (!input.sku?.trim()) errors.sku = ['SKU is required for a product.'];

    const barcode = input.barcode?.trim();
    if (barcode) {
      const clash = items.find((item) => isProduct(item) && item.barcode === barcode);
      if (clash) errors.barcode = ['This barcode is already in use.'];
    }
  }

  if (Object.keys(errors).length > 0) throw validationFailed(errors);
}

function buildItem(input: CatalogItemInput, existing?: CatalogItem): CatalogItem {
  const now = timestamp();

  const base = {
    id: existing?.id ?? nextId('itm'),
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn.trim(),
    categoryId: input.categoryId,
    description: input.description.trim(),
    imageUrl: existing?.imageUrl ?? null,
    priceH: input.priceH,
    costH: input.costH,
    showOnPos: input.showOnPos,
    requiresPreparation: input.requiresPreparation ?? false,
    printGroupId: input.printGroupId ?? null,
    status: input.status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (input.kind === 'product') {
    const product: Product = {
      ...base,
      kind: 'product',
      sku: input.sku?.trim() ?? '',
      barcode: input.barcode?.trim() ?? '',
      vendorId: input.vendorId ?? null,
      unit: input.unit ?? 'piece',
      trackInventory: input.trackInventory ?? true,
      stockQuantity: input.stockQuantity ?? 0,
      minStockLevel: input.minStockLevel ?? 0,
    };
    return product;
  }

  const service: Service = {
    ...base,
    kind: 'service',
    durationMinutes: input.durationMinutes ?? null,
    providerId: input.providerId ?? null,
  };
  return service;
}

const mockCatalogService = {
  async list(query?: CatalogListQuery): Promise<Paginated<CatalogItem>> {
    await delay();

    const { kind, categoryId, status, stockLevel } = query?.filters ?? {};

    let result = items.filter((item) => {
      if (kind && kind !== 'all' && item.kind !== kind) return false;
      if (categoryId && categoryId !== 'all' && item.categoryId !== categoryId) return false;
      if (status && status !== 'all' && item.status !== status) return false;
      if (stockLevel && stockLevel !== 'all' && stockLevelOf(item) !== stockLevel) return false;
      if (query?.search && !matches(searchable(item), query.search)) return false;
      return true;
    });

    result = compareBy(result, query?.sortBy ?? 'nameEn', query?.sortDirection ?? 'asc');

    return paginate(result, query);
  },

  async get(id: string): Promise<CatalogItem> {
    await delay(120);
    const item = items.find((candidate) => candidate.id === id);
    if (!item) throw notFound('Catalog item', id);
    return item;
  },

  async create(input: CatalogItemInput): Promise<CatalogItem> {
    await delay(320);
    validate(input);
    const created = buildItem(input);
    items = [created, ...items];
    return created;
  },

  async update(id: string, input: CatalogItemInput): Promise<CatalogItem> {
    await delay(320);
    const existing = items.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Catalog item', id);

    /* Exclude self from the barcode uniqueness check. */
    const others = items.filter((candidate) => candidate.id !== id);
    const previous = items;
    items = others;
    try {
      validate(input);
    } finally {
      items = previous;
    }

    const updated = buildItem(input, existing);
    items = items.map((candidate) => (candidate.id === id ? updated : candidate));
    return updated;
  },

  /**
   * Deactivates rather than deletes. Sales history references catalog items, so
   * removing a row would orphan it — the same rule the accounting layer applies.
   */
  async deactivate(id: string): Promise<CatalogItem> {
    await delay(260);
    const existing = items.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Catalog item', id);

    const updated = { ...existing, status: 'inactive' as const, showOnPos: false, updatedAt: timestamp() };
    items = items.map((candidate) => (candidate.id === id ? updated : candidate));
    return updated;
  },

  async activate(id: string): Promise<CatalogItem> {
    await delay(260);
    const existing = items.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Catalog item', id);

    const updated = { ...existing, status: 'active' as const, updatedAt: timestamp() };
    items = items.map((candidate) => (candidate.id === id ? updated : candidate));
    return updated;
  },

  /**
   * Items the POS may sell: active, flagged for POS, and — for tracked products
   * — not already at zero. The sell grid never shows something a cashier cannot
   * actually put in a cart.
   */
  async posItems(): Promise<CatalogItem[]> {
    await delay(180);
    return items.filter((item) => {
      if (item.status !== 'active' || !item.showOnPos) return false;
      if (isProduct(item) && item.trackInventory && item.stockQuantity <= 0) return false;
      return true;
    });
  },

  /**
   * Move stock by a signed delta. Called by the sales service on commit and by
   * inventory adjustments. A no-op for services and untracked products, which
   * is what keeps the sale path from having to branch on item kind.
   */
  async adjustStock(id: string, delta: number): Promise<CatalogItem> {
    const existing = items.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Catalog item', id);
    if (!isProduct(existing) || !existing.trackInventory) return existing;

    const updated: Product = {
      ...existing,
      stockQuantity: Math.max(0, existing.stockQuantity + delta),
      updatedAt: timestamp(),
    };
    items = items.map((candidate) => (candidate.id === id ? updated : candidate));
    return updated;
  },

  /** Set an item's cost, used when a purchase re-averages it. */
  async setCost(id: string, costH: number): Promise<CatalogItem> {
    const existing = items.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Catalog item', id);

    const updated = { ...existing, costH, updatedAt: timestamp() };
    items = items.map((candidate) => (candidate.id === id ? updated : candidate));
    return updated;
  },

  /** Items at or below their threshold, worst first. */
  async lowStock(limit = 5): Promise<Product[]> {
    await delay(140);
    return items
      .filter(isProduct)
      .filter((item) => {
        const level = stockLevelOf(item);
        return level === 'low_stock' || level === 'out_of_stock';
      })
      .sort((a, b) => a.stockQuantity - b.stockQuantity)
      .slice(0, limit);
  },

  async summary(): Promise<CatalogSummary> {
    await delay(140);

    const products = items.filter(isProduct);

    return {
      total: items.length,
      products: products.length,
      services: items.length - products.length,
      lowStock: items.filter((item) => stockLevelOf(item) === 'low_stock').length,
      outOfStock: items.filter((item) => stockLevelOf(item) === 'out_of_stock').length,
      inventoryValueH: products
        .filter((product) => product.trackInventory)
        .reduce((sum, product) => sum + product.costH * product.stockQuantity, 0),
    };
  },
};

const mockCategoryService = {
  async list(): Promise<Category[]> {
    await delay(120);
    return compareBy(categories, 'sortOrder', 'asc');
  },

  async create(input: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category> {
    await delay(240);
    if (!input.nameAr.trim() || !input.nameEn.trim()) {
      throw validationFailed({
        nameAr: input.nameAr.trim() ? [] : ['Arabic name is required.'],
        nameEn: input.nameEn.trim() ? [] : ['English name is required.'],
      });
    }

    const now = timestamp();
    const created: Category = { ...input, id: nextId('cat'), createdAt: now, updatedAt: now };
    categories = [...categories, created];
    return created;
  },

  /** How many catalog items point at each category. Drives the count column. */
  async usage(): Promise<Record<string, number>> {
    await delay(100);
    return items.reduce<Record<string, number>>((counts, item) => {
      if (!item.categoryId) return counts;
      counts[item.categoryId] = (counts[item.categoryId] ?? 0) + 1;
      return counts;
    }, {});
  },
};

export const staffService = {
  async list(): Promise<StaffMember[]> {
    await delay(120);
    return staff;
  },
};


/*==============================================================================
  Which implementation the app actually uses.

  Components import `catalogService` and `categoryService` and are unaware there
  are two. Renaming the mocks above and re-exporting here means the switch is
  one flag rather than an edit in every page — and it is why a category renamed
  in the database now shows up in the POS, which it did not while these names
  pointed straight at the seed data.
==============================================================================*/

export const catalogService = USE_MOCKS
  ? mockCatalogService
  : ({
      ...mockCatalogService,
      ...apiCatalogService,
      /* Last, so activate and deactivate reach the API rather than the mock
         copies above them. */
      ...apiItemActivation,
    } as typeof mockCatalogService);

export const categoryService = USE_MOCKS
  ? mockCategoryService
  : ({ ...mockCategoryService, ...apiCategoryService } as typeof mockCategoryService);
