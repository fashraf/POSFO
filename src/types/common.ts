/** Primitive identifier used across every entity. */
export type ID = string;

/** A record that carries audit stamps. Extend your entities from this. */
export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

/** Generic active/archived lifecycle used by most list screens. */
export type RecordStatus = 'active' | 'inactive' | 'archived';

/** Query shape accepted by every list endpoint. */
export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, string | number | boolean | undefined>;
}

/** Envelope returned by every list endpoint. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Discriminated result so callers handle failure explicitly. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  /**
   * The error this was built from, when there was one.
   *
   * Lets a caller test `cause instanceof SomeError` for a refusal it knows how
   * to present — a server saying "this category still has 5 active items" needs
   * a different message from a failed request, and the flattened shape alone
   * cannot tell them apart.
   */
  cause?: unknown;
}

/** A generic option for selects, tabs, and filter chips. */
export interface Option<T = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Async lifecycle used by page-level state. */
export type LoadState = 'idle' | 'loading' | 'success' | 'error';
