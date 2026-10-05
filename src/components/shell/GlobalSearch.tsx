import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Contact, Loader2, Package, Receipt } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';
import { safeCall } from '@/services';
import {
  searchService,
  type SearchGroup,
  type SearchHit,
  type SearchResults,
} from '@/services/searchService';

const MIN_LENGTH = 2;

const GROUP_ICON: Record<SearchGroup, typeof Package> = {
  items: Package,
  customers: Contact,
  vendors: Building2,
  invoices: Receipt,
};

/**
 * Where a hit opens: the list page that owns it, already searched for the
 * term that identifies it (SKU, phone, invoice number), so the record is the
 * row on screen. The page reads `?q=` — see useSearchParamSeed.
 */
function destination(group: SearchGroup, hit: SearchHit): string {
  const term = (value: string) => `?q=${encodeURIComponent(value)}`;
  switch (group) {
    case 'items':
      return `/catalog${term(hit.subtitle || hit.title)}`;
    case 'customers':
      return `/customers${term(hit.title)}`;
    case 'vendors':
      return `/vendors${term(hit.title)}`;
    case 'invoices':
      return `/sales${term(hit.title)}`;
  }
}

/**
 * The header search: items, customers, vendors and invoices in one box.
 *
 * Results come grouped from GET /api/search, which leaves out any group the
 * signed-in user has no permission to see. Arrow keys move through the hits,
 * Enter opens one, Escape closes.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounced = useDebouncedValue(query.trim(), 250);

  useOnClickOutside(containerRef, () => setOpen(false), open);

  useEffect(() => {
    if (debounced.length < MIN_LENGTH) {
      setResults(null);
      setLoading(false);
      return;
    }

    /* A slower earlier answer must not overwrite a later one. */
    const controller = new AbortController();
    setLoading(true);

    void (async () => {
      const result = await safeCall(() => searchService.search(debounced, controller.signal));
      if (controller.signal.aborted) return;
      setResults(result.ok ? result.data : { query: debounced, groups: [] });
      setActive(0);
      setLoading(false);
    })();

    return () => controller.abort();
  }, [debounced]);

  /* One flat list for the keyboard, in the order the groups render. */
  const flat = useMemo(
    () =>
      (results?.groups ?? []).flatMap(({ group, hits }) => hits.map((hit) => ({ group, hit }))),
    [results],
  );

  function go(group: SearchGroup, hit: SearchHit) {
    setOpen(false);
    setQuery('');
    setResults(null);
    navigate(destination(group, hit));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || flat.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = flat[active];
      if (target) go(target.group, target.hit);
    }
  }

  const showPanel = open && query.trim().length > 0;
  let position = -1;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <SearchInput
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onClear={() => {
          setQuery('');
          setResults(null);
        }}
        placeholder={t('globalSearch.placeholder')}
        aria-label={t('common.search')}
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        role="combobox"
        autoComplete="off"
      />

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute start-0 top-[calc(100%+0.375rem)] z-overlay max-h-[26rem] w-[min(28rem,90vw)] overflow-y-auto rounded-md border border-ink-200 bg-surface shadow-md animate-scale-in"
        >
          {query.trim().length < MIN_LENGTH ? (
            <p className="px-3 py-3 text-2xs text-ink-400">{t('globalSearch.minChars')}</p>
          ) : loading && !results ? (
            <p className="flex items-center gap-2 px-3 py-3 text-2xs text-ink-500">
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              {t('globalSearch.searching')}
            </p>
          ) : flat.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm font-medium text-ink-700">{t('globalSearch.noResults')}</p>
              <p className="mt-0.5 text-2xs text-ink-400">{t('globalSearch.noResultsHint')}</p>
            </div>
          ) : (
            results?.groups.map(({ group, hits }) => {
              const Icon = GROUP_ICON[group];
              return (
                <section key={group} className="border-b border-dashed border-ink-100 py-1 last:border-0">
                  <h3 className="px-3 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                    {t(`globalSearch.groups.${group}`)}
                  </h3>
                  <ul>
                    {hits.map((hit) => {
                      position += 1;
                      const index = position;
                      return (
                        <li key={`${group}-${hit.id}`}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={index === active}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => go(group, hit)}
                            className={cn(
                              'flex w-full items-center gap-2.5 px-3 py-1.5 text-start transition-colors',
                              index === active ? 'bg-brand-50/60' : 'hover:bg-ink-50',
                            )}
                          >
                            <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-ink-800">{hit.title}</span>
                              {hit.subtitle && (
                                <span className="numeric block truncate text-2xs text-ink-400" dir="auto">
                                  {hit.subtitle}
                                </span>
                              )}
                            </span>
                            {hit.status === 'inactive' && (
                              <span className="shrink-0 text-2xs text-ink-400">
                                {t('common.inactive')}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
