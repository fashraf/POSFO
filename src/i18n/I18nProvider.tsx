import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  directionFor,
  isLanguage,
  type Direction,
  type Language,
} from './config';
import { ar } from './locales/ar';
import { en, type Dictionary } from './locales/en';

const DICTIONARIES: Record<Language, Dictionary> = { ar, en };

/**
 * Every dot-path that exists in the dictionary, e.g. `"common.save"`.
 * This is what makes `t()` autocomplete and reject typos at compile time.
 */
type Leaves<T> = T extends string
  ? ''
  : {
      [K in Extract<keyof T, string>]: Leaves<T[K]> extends infer R
        ? R extends ''
          ? K
          : `${K}.${R & string}`
        : never;
    }[Extract<keyof T, string>];

export type TranslationKey = Leaves<Dictionary>;

/** Values interpolated into `{placeholder}` slots. */
export type TranslationValues = Record<string, string | number>;

interface I18nContextValue {
  language: Language;
  direction: Direction;
  isRTL: boolean;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function resolve(dictionary: Dictionary, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
      dictionary,
    );

  /* A missing key renders its own path. Loud in development, harmless in production. */
  return typeof value === 'string' ? value : key;
}

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, token: string) =>
    Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const direction = directionFor(language);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = direction;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      /* Storage unavailable — the language still applies for this session. */
    }
  }, [language, direction]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((current) => (current === 'ar' ? 'en' : 'ar'));
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      interpolate(resolve(DICTIONARIES[language], key), values),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      direction,
      isRTL: direction === 'rtl',
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language, direction, setLanguage, toggleLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside <I18nProvider>.');
  }
  return context;
}

/** Shorthand for components that only need the translate function. */
export function useTranslation() {
  const { t, language, direction, isRTL } = useI18n();
  return { t, language, direction, isRTL };
}
