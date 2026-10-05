import { api } from './apiClient';

/**
 * The header search (GET /api/search).
 *
 * The server searches only what the caller may see — items need
 * products.view, customers customers.view, vendors vendors.view, invoices
 * sales.view and a visible branch. A group the caller cannot search comes back
 * null rather than empty, and is left out here.
 */

export type SearchGroup = 'items' | 'customers' | 'vendors' | 'invoices';

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
}

export interface SearchResults {
  query: string;
  groups: { group: SearchGroup; hits: SearchHit[] }[];
}

interface ApiSearchHit {
  id: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
}

type ApiSearchResults = { query: string } & Partial<Record<SearchGroup, ApiSearchHit[] | null>>;

const ORDER: SearchGroup[] = ['items', 'customers', 'vendors', 'invoices'];

export const searchService = {
  async search(query: string, signal?: AbortSignal): Promise<SearchResults> {
    const response = await api.get<ApiSearchResults>('/api/search', {
      query: { q: query.trim() },
      signal,
    });

    return {
      query: response.query,
      groups: ORDER.flatMap((group) => {
        const hits = response[group];
        if (!hits || hits.length === 0) return [];
        return [
          {
            group,
            hits: hits.map((hit) => ({
              id: hit.id,
              title: hit.title,
              subtitle: hit.subtitle ?? null,
              status: hit.status ?? null,
            })),
          },
        ];
      }),
    };
  },
};
