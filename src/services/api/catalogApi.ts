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
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  printGroupId: string | null;
  priceH: number;
  costH: number;
  tracksStock: boolean;
  quantity: number;
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

export const catalogApi = {
  items(query: {
    search?: string;
    categoryId?: string | null;
    kind?: string | null;
    branchId?: string | null;
    activeOnly?: boolean;
    page?: number;
    pageSize?: number;
  } = {}) {
    return api.get<ApiPage<ApiCatalogItem>>('/api/catalog/items', {
      query: {
        search: query.search,
        categoryId: query.categoryId ?? undefined,
        kind: query.kind ?? undefined,
        branchId: query.branchId ?? undefined,
        activeOnly: query.activeOnly ?? true,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 100,
      },
    });
  },

  categories() {
    return api.get<ApiNamed[]>('/api/catalog/categories');
  },

  printGroups() {
    return api.get<ApiNamed[]>('/api/catalog/print-groups');
  },
};
