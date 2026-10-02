import { HttpError } from './http';

/**
 * Small helpers the services share: errors raised before a request is sent
 * (a check the form can answer without the server), and a stable sort.
 */

export function notFound(resource: string, id: string): HttpError {
  return new HttpError({
    status: 404,
    code: 'not_found',
    message: `${resource} ${id} was not found.`,
  });
}

export function validationFailed(fieldErrors: Record<string, string[]>): HttpError {
  return new HttpError({
    status: 422,
    code: 'validation_failed',
    message: 'Some fields need attention.',
    fieldErrors,
  });
}

/** A sorted copy, comparing numbers as numbers and anything else as text. */
export function compareBy<T>(items: T[], key: string, direction: 'asc' | 'desc' = 'asc'): T[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    const left = (a as Record<string, unknown>)[key];
    const right = (b as Record<string, unknown>)[key];

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * factor;
    }
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true }) * factor;
  });
}
