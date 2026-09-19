import type { Language } from '@/i18n/config';

const LOCALES: Record<Language, string> = {
  ar: 'ar-SA',
  en: 'en-SA',
};

export const DEFAULT_CURRENCY = 'SAR';

/** Resolve a BCP-47 locale for a supported UI language. */
export function localeFor(language: Language): string {
  return LOCALES[language] ?? LOCALES.en;
}

/**
 * Format money for display.
 *
 * Amounts are expected in minor units (halalas) so no floating point value ever
 * represents money in this application. Pass `fromMinorUnits: false` if you are
 * handing in a major-unit value from a form field.
 */
export function formatCurrency(
  amount: number,
  options: {
    language?: Language;
    currency?: string;
    fromMinorUnits?: boolean;
    withSymbol?: boolean;
  } = {},
): string {
  const {
    language = 'en',
    currency = DEFAULT_CURRENCY,
    fromMinorUnits = true,
    withSymbol = true,
  } = options;

  /*
   * Refuse to render a non-number.
   *
   * A missing field arrives as undefined, arithmetic on it produces NaN, and
   * Intl formats NaN as "NaN" — so a column the API never sent reached the till
   * as "SAR NaN" with nothing to say which field was missing. Failing here names
   * it, at the point where it can still be traced back.
   *
   * Development throws so it is caught while building; production shows a dash,
   * because a cashier mid-sale needs a readable screen more than a stack trace.
   */
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    const message =
      `formatCurrency received ${JSON.stringify(amount)} instead of a number. ` +
      'A field is missing from the API response or was never set.';

    if (import.meta.env.DEV) throw new TypeError(message);

    console.error(message);
    return withSymbol ? `${currency} —` : '—';
  }

  const value = fromMinorUnits ? amount / 100 : amount;

  const formatted = new Intl.NumberFormat(localeFor(language), {
    style: withSymbol ? 'currency' : 'decimal',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: 'latn',
  }).format(value);

  return formatted;
}

/** Format a plain number with grouping. */
export function formatNumber(
  value: number,
  options: { language?: Language; maximumFractionDigits?: number } = {},
): string {
  const { language = 'en', maximumFractionDigits = 0 } = options;
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits,
    numberingSystem: 'latn',
  }).format(value);
}

/** Format a ratio (0.125) as a percentage string ("12.5%"). */
export function formatPercent(
  ratio: number,
  options: { language?: Language; maximumFractionDigits?: number } = {},
): string {
  const { language = 'en', maximumFractionDigits = 1 } = options;
  return new Intl.NumberFormat(localeFor(language), {
    style: 'percent',
    maximumFractionDigits,
    numberingSystem: 'latn',
  }).format(ratio);
}

/** Format a date for display. */
export function formatDate(
  value: Date | string | number,
  options: { language?: Language; withTime?: boolean } = {},
): string {
  const { language = 'en', withTime = false } = options;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    numberingSystem: 'latn',
    calendar: 'gregory',
  }).format(date);
}

/** Convert a major-unit input ("12.50") to minor units (1250). */
export function toMinorUnits(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

/** Convert minor units (1250) back to a major-unit string ("12.50"). */
export function fromMinorUnits(value: number): string {
  return (value / 100).toFixed(2);
}

/** Initials for an avatar fallback, safe for Arabic and Latin names alike. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
