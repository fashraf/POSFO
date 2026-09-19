import { useEffect, useState } from 'react';

/**
 * Which data has changed, and who needs to reload.
 *
 * A save that succeeds does not make the screen correct. Every list here loads
 * once into local state, so a record written after that load stays invisible
 * until the component remounts — and "Saved successfully" over a stale list
 * reads as the save having failed.
 *
 * Rather than have each screen guess when to refetch, a mutation announces what
 * it touched and any view depending on that subject reloads. A version number
 * per subject, not the data itself: this is a signal, not a cache, and a cache
 * would introduce its own staleness in place of the one it fixed.
 */

export type DataSubject =
  | 'catalog'
  | 'inventory'
  | 'vendors'
  | 'customers'
  | 'sales'
  | 'ledger'
  | 'expenses'
  | 'users'
  | 'devices';

/** Subjects that also change when another does. */
const CASCADES: Partial<Record<DataSubject, DataSubject[]>> = {
  /* A delivery changes stock, re-averages cost — which the catalog shows — and
     posts to the ledger. Announcing only "inventory" would leave the product
     list showing yesterday's cost. */
  inventory: ['catalog', 'ledger'],
  /* A sale moves stock, may take credit, and always posts. */
  sales: ['inventory', 'catalog', 'customers', 'ledger'],
  expenses: ['ledger'],
};

const versions = new Map<DataSubject, number>();
const listeners = new Set<() => void>();

/**
 * Announce that a subject changed.
 *
 * Call it after the write is confirmed, never before — announcing optimistically
 * makes every listener refetch data that may be about to be rolled back.
 */
export function invalidate(...subjects: DataSubject[]): void {
  const touched = new Set<DataSubject>();

  for (const subject of subjects) {
    touched.add(subject);
    for (const cascaded of CASCADES[subject] ?? []) touched.add(cascaded);
  }

  for (const subject of touched) {
    versions.set(subject, (versions.get(subject) ?? 0) + 1);
  }

  /* A copy, because a listener may unsubscribe while being notified. */
  for (const listener of [...listeners]) listener();
}

function versionOf(subjects: DataSubject[]): number {
  return subjects.reduce((sum, subject) => sum + (versions.get(subject) ?? 0), 0);
}

/**
 * A number that changes whenever any of these subjects does.
 *
 * Put it in the dependency array of the effect that loads the screen, and the
 * screen reloads when the data behind it moves:
 *
 *   const version = useDataVersion('catalog', 'inventory');
 *   useEffect(() => { void load(); }, [load, version]);
 *
 * Filters, search and paging live in their own state and are untouched, so the
 * user keeps their place — which a full reload would lose.
 */
export function useDataVersion(...subjects: DataSubject[]): number {
  const key = subjects.join(',');
  const [version, setVersion] = useState(() => versionOf(subjects));

  useEffect(() => {
    const listener = () => setVersion(versionOf(key.split(',') as DataSubject[]));
    listeners.add(listener);

    /* Sync on subscribe: a mutation may have landed between the initial render
       and this effect running. */
    listener();

    return () => {
      listeners.delete(listener);
    };
  }, [key]);

  return version;
}
