/**
 * Runtime configuration.
 *
 * Vite inlines these at build time, so anything here ends up readable in the
 * shipped bundle. Nothing secret belongs in this file — the API is what holds
 * the signing key and talks to the database.
 */

/**
 * Where the API lives.
 *
 * Empty is the normal case and means same origin: in development the Vite
 * proxy forwards /api to the backend, and in production the reverse proxy does.
 * Either way the browser makes a same-origin request, so CORS never applies.
 *
 * Set it only when pointing at an API on a different host.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

export const APP_ENV: string = import.meta.env.MODE;

export const IS_PRODUCTION: boolean = import.meta.env.PROD;
