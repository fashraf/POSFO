import { HttpError } from '../http';

/**
 * A server timestamp as an ISO string.
 *
 * The API stores UTC and serialises it without the trailing "Z", which
 * `new Date()` would read as local time — every stamp off by the browser's
 * offset. Appending it here is the one place that knowledge lives.
 */
export function utc(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

/** As `utc`, but null when the server sent nothing. */
export function utcOrNull(value: string | null | undefined): string | null {
  return utc(value) || null;
}

/** A calendar day for the API: "YYYY-MM-DD", from an ISO string or a day. */
export function day(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

/**
 * Re-key a validation error so the form puts it under the right field.
 *
 * The server names fields after its own columns; where a form shows that
 * message under a different input, the message is copied across (the original
 * key stays, so nothing else reading it loses it).
 */
export function remapFieldErrors(caught: unknown, map: Record<string, string>): never {
  if (caught instanceof HttpError && caught.fieldErrors) {
    const fieldErrors = { ...caught.fieldErrors };
    for (const [from, to] of Object.entries(map)) {
      if (fieldErrors[from] && !fieldErrors[to]) fieldErrors[to] = fieldErrors[from];
    }
    throw new HttpError({
      status: caught.status,
      code: caught.code,
      message: caught.message,
      fieldErrors,
    });
  }
  throw caught;
}
