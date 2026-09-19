import type { ApiError, ListQuery, Paginated, Result } from '@/types';

/**
 * The single place the application talks to the network.
 *
 * Nothing above this file knows about `fetch`, status codes, or URL shapes.
 * When the API is ready, set VITE_API_BASE_URL and the rest of the app is
 * unchanged.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class HttpError extends Error implements ApiError {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'HttpError';
    this.status = error.status;
    this.code = error.code;
    this.fieldErrors = error.fieldErrors;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  /** Appended to the URL as a query string. Undefined values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Serialised as JSON unless it is already FormData. */
  body?: unknown;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${suffix}`;

  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }

  const serialised = params.toString();
  return serialised ? `${url}?${serialised}` : url;
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* Not every failure returns JSON. */
  }

  const body = (payload ?? {}) as Partial<ApiError> & { title?: string; errors?: unknown };

  return {
    status: response.status,
    code: body.code ?? `http_${response.status}`,
    message: body.message ?? body.title ?? response.statusText ?? 'Request failed',
    fieldErrors: (body.fieldErrors ?? body.errors) as Record<string, string[]> | undefined,
  };
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { query, body, headers, ...rest } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const response = await fetch(buildUrl(path, query), {
    ...rest,
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(isFormData ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new HttpError(await toApiError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};

/** Wrap any call so the caller gets a Result instead of a thrown error. */
export async function safeCall<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof HttpError) {
      return { ok: false, error };
    }
    /*
     * Keep a code the caller can act on.
     *
     * Flattening every non-HttpError to "network_error" loses the one thing
     * that distinguishes a refusal from a failure — a server saying "this
     * category still has 5 active items" is not a network problem, and a
     * caller that cannot tell them apart shows the wrong message.
     */
    const code =
      error instanceof Error && error.name !== 'Error' ? error.name : 'network_error';

    return {
      ok: false,
      error: {
        status: 0,
        code,
        message: error instanceof Error ? error.message : 'Network request failed',
        /* The original, for a caller that wants instanceof. */
        cause: error,
      },
    };
  }
}

/**
 * Standard CRUD surface for a resource. Point a service at a path and you get
 * list/get/create/update/remove for free, all correctly typed.
 *
 *   export const productService = createResourceService<Product, ProductInput>('/products');
 */
export function createResourceService<TEntity, TInput = Partial<TEntity>>(basePath: string) {
  return {
    list: (query?: ListQuery) =>
      http.get<Paginated<TEntity>>(basePath, {
        query: {
          page: query?.page,
          pageSize: query?.pageSize,
          search: query?.search,
          sortBy: query?.sortBy,
          sortDirection: query?.sortDirection,
          ...query?.filters,
        },
      }),
    get: (id: string) => http.get<TEntity>(`${basePath}/${id}`),
    create: (input: TInput) => http.post<TEntity>(basePath, input),
    update: (id: string, input: TInput) => http.put<TEntity>(`${basePath}/${id}`, input),
    remove: (id: string) => http.delete<void>(`${basePath}/${id}`),
  };
}
