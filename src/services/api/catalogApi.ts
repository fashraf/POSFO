import { api } from '../apiClient';

/**
 * Catalog, from the API.
 *
 * The server returns money as integer halalas and both language columns, which
 * is what the domain types already expect — so this layer renames fields and
 * does nothing else. Any real transformation here would be a sign the API and
 * the frontend disagree about the domain.
 */

export interface ApiCatalogItem {
  itemId: string;
  kind: 'product' | 'service';
  nameAr: string;
  nameEn: string;
  name: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  vendorId: string | null;
  printGroupId: string | null;
  priceH: number;
  costH: number;
  tracksStock: boolean;
  quantity: number;
  reorderLevel: number;
  requiresPreparation: boolean;
  isActive: boolean;
}

/** What the create and edit routes accept. Cost is only honoured on create. */
export interface ApiSaveCatalogItem {
  kind: 'product' | 'service';
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  vendorId: string | null;
  printGroupId: string | null;
  priceH: number;
  costH: number;
  tracksStock: boolean;
  reorderLevel: number;
  requiresPreparation: boolean;
  isActive: boolean;
}

export interface ApiNamed {
  id: string;
  nameAr: string;
  nameEn: string;
  name: string;
}

export interface ApiPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface CatalogItemsQuery {
  search?: string;
  categoryId?: string | null;
  kind?: string | null;
  branchId?: string | null;
  activeOnly?: boolean;
  status?: 'active' | 'inactive';
  page?: number;
  pageSize?: number;
}

/** The server's page-size cap (PageQuery.MaxPageSize). */
export const MAX_PAGE_SIZE = 200;

export const catalogApi = {
  items(query: CatalogItemsQuery = {}) {
    return api.get<ApiPage<ApiCatalogItem>>('/api/catalog/items', {
      query: {
        search: query.search,
        categoryId: query.categoryId ?? undefined,
        kind: query.kind ?? undefined,
        branchId: query.branchId ?? undefined,
        activeOnly: query.activeOnly ?? true,
        status: query.status,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 100,
      },
    });
  },

  /**
   * Every item matching the filter, across pages.
   *
   * The route caps a page at 200, so a screen that needs the whole catalog —
   * a summary, a picker — must walk the pages rather than ask for a bigger one
   * and silently receive the first 200.
   */
  async allItems(query: Omit<CatalogItemsQuery, 'page' | 'pageSize'> = {}) {
    const all: ApiCatalogItem[] = [];

    for (let page = 1; ; page += 1) {
      const result = await catalogApi.items({ ...query, page, pageSize: MAX_PAGE_SIZE });
      all.push(...result.items);
      if (result.items.length < MAX_PAGE_SIZE || all.length >= result.totalCount) break;
    }

    return all;
  },

  item(itemId: string, branchId?: string | null) {
    return api.get<ApiCatalogItem>(`/api/catalog/items/${encodeURIComponent(itemId)}`, {
      query: { branchId: branchId ?? undefined },
    });
  },

  create(payload: ApiSaveCatalogItem, branchId?: string | null) {
    return api.post<ApiCatalogItem>('/api/catalog/items', payload, {
      query: { branchId: branchId ?? undefined },
    });
  },

  update(itemId: string, payload: ApiSaveCatalogItem, branchId?: string | null) {
    return api.put<ApiCatalogItem>(`/api/catalog/items/${encodeURIComponent(itemId)}`, payload, {
      query: { branchId: branchId ?? undefined },
    });
  },

  categories() {
    return api.get<ApiNamed[]>('/api/catalog/categories');
  },

  printGroups() {
    return api.get<ApiNamed[]>('/api/catalog/print-groups');
  },
};
