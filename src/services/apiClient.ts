import { API_BASE_URL } from '@/config/env';
import { tokenStore } from './tokenStore';
import { HttpError } from './http';
import type { Language } from '@/i18n';

/**
 * The real network layer.
 *
 * Adds the bearer token, asks for the right language, and refreshes the session
 * once when a token has expired. Everything above this file works in terms of
 * services and never sees a status code.
 */

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  /** Skip the bearer token — only the auth endpoints need this. */
  anonymous?: boolean;
}

/** The error shape the API returns, carrying both languages. */
interface ApiErrorBody {
  code: string;
  messageEn: string;
  messageAr: string;
  fieldErrors?: Record<string, string[]>;
  traceId?: string;
}

let currentLanguage: Language = 'ar';

/** The route the user was on before this one. Set by the router. */
let previousPagePath: string | null = null;

export function setPreviousPage(path: string | null): void {
  previousPagePath = path;
}

/** Kept in step with the UI so responses come back in the right language. */
export function setApiLanguage(language: Language): void {
  currentLanguage = language;
}

function buildUrl(path: string, query?: ApiRequestOptions['query']): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;

  // With an empty base this resolves against the current origin, which is what
  // the proxy expects. With a base set it targets that host instead.
  const url = new URL(`${base}${suffix}`, window.location.origin);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

/**
 * Only one refresh runs at a time.
 *
 * Without this, a page that fires six requests on load would send six refreshes
 * the moment the token expires — and because refresh tokens rotate, five of them
 * would fail and sign the person out.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(buildUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        tokenStore.clear();
        return false;
      }

      const session = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        expiresAtUtc: string;
      };

      tokenStore.setSession(session.accessToken, session.expiresAtUtc, session.refreshToken);
      return true;
    } catch {
      tokenStore.clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function send<T>(path: string, options: ApiRequestOptions, retry: boolean): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': currentLanguage,
  };

  /* Where the user is, and where they came from.
   *
   * The audit trail records both. Referer is not used: browsers strip it on
   * same-origin navigations and it says nothing about client-side routing,
   * which is how this app moves between pages. */
  if (typeof window !== 'undefined') {
    headers['X-Current-Page'] = window.location.pathname;
    if (previousPagePath) headers['X-Previous-Page'] = previousPagePath;
  }

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (!options.anonymous) {
    const token = tokenStore.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      signal: options.signal,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch (caught) {
    /* A failed fetch is the network, not the server. Saying so is more useful
       than a generic error, because the fix is different. */
    throw new HttpError({
      status: 0,
      code: 'network_unreachable',
      message:
        currentLanguage === 'ar'
          ? 'تعذّر الوصول إلى الخادم. تحقّق من الاتصال.'
          : 'Could not reach the server. Check your connection.',
    });
  }

  /* An expired token is worth one silent retry. A second 401 after a fresh
     token means the session is genuinely gone. */
  if (response.status === 401 && retry && !options.anonymous) {
    const refreshed = await refreshSession();
    if (refreshed) return send<T>(path, options, false);

    tokenStore.clear();
    window.dispatchEvent(new CustomEvent('nazad:session-expired'));
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = payload as ApiErrorBody | null;

    throw new HttpError({
      status: response.status,
      code: error?.code ?? 'unknown_error',
      /* The API sends both languages; pick the one on screen. */
      message:
        (currentLanguage === 'ar' ? error?.messageAr : error?.messageEn) ??
        (currentLanguage === 'ar' ? 'حدث خطأ ما.' : 'Something went wrong.'),
      fieldErrors: error?.fieldErrors,
    });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) =>
    send<T>(path, { ...options, method: 'GET' }, true),

  post: <T>(path: string, body?: unknown, options: ApiRequestOptions = {}) =>
    send<T>(path, { ...options, method: 'POST', body }, true),

  put: <T>(path: string, body?: unknown, options: ApiRequestOptions = {}) =>
    send<T>(path, { ...options, method: 'PUT', body }, true),

  patch: <T>(path: string, body?: unknown, options: ApiRequestOptions = {}) =>
    send<T>(path, { ...options, method: 'PATCH', body }, true),

  delete: <T>(path: string, options: ApiRequestOptions = {}) =>
    send<T>(path, { ...options, method: 'DELETE' }, true),
};
