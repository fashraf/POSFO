import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Seed a page's own search box from `?q=` in the URL, then drop the parameter.
 *
 * The header search links to a list page with the term that found the record
 * (an invoice number, a SKU), so the page opens already filtered to it. The
 * parameter is removed once read, so clearing the box is not undone by the URL
 * and a refresh does not re-apply a stale search.
 */
export function useSearchParamSeed(onSeed: (value: string) => void, key = 'q'): void {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);

  useEffect(() => {
    if (!value) return;
    onSeed(value);
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next, { replace: true });
    // Only a new value in the URL should re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}
