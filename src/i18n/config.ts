export const LANGUAGES = ['ar', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];
export type Direction = 'rtl' | 'ltr';

/** Arabic is the primary language of this product, so it is the default. */
export const DEFAULT_LANGUAGE: Language = 'ar';

export const LANGUAGE_STORAGE_KEY = 'app.language';

export const LANGUAGE_META: Record<
  Language,
  { label: string; nativeLabel: string; direction: Direction }
> = {
  ar: { label: 'Arabic', nativeLabel: 'العربية', direction: 'rtl' },
  en: { label: 'English', nativeLabel: 'English', direction: 'ltr' },
};

export function directionFor(language: Language): Direction {
  return LANGUAGE_META[language].direction;
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}
