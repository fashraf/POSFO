import { useCallback, useEffect, useState } from 'react';
import { Eye, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import {
  Badge,
  Button,
  DatePicker,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/contexts/ToastContext';
import { auditApi, type AuditRow } from '@/services/api';

/**
 * The audit trail.
 *
 * Read-only by design. Entries are written by middleware from what actually
 * happened, and there is no endpoint to create or edit one — a trail a user can
 * write to is worth nothing as evidence of what that user did.
 */
export default function AuditPage() {
  const { error: showError } = useToast();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [module, setModule] = useState('');
  const [result, setResult] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [filters, setFilters] = useState<{
    actions: string[];
    modules: string[];
    users: { userId: string; username: string }[];
  }>({ actions: [], modules: [], users: [] });

  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await auditApi.list({
        search: debouncedSearch || undefined,
        action: action || undefined,
        module: module || undefined,
        result: result || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize,
      });
      setRows(response.items);
      setTotal(response.totalCount);
    } catch (error) {
      showError('Could not load the audit trail', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, action, module, result, from, to, page, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    auditApi.filters().then(setFilters).catch(() => {
      /* The page still works with free-text search if the lists fail. */
    });
  }, []);

  /* Any filter change returns to the first page: staying on page 7 of a
     narrower result set shows an empty table and reads as "no results". */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, action, module, result, from, to]);

  const openDetail = async (auditId: number) => {
    try {
      setDetail(await auditApi.get(auditId));
    } catch (error) {
      showError('Could not load that entry', (error as Error).message);
    }
  };

  const resultBadge = (value: AuditRow['result']) => {
    if (value === 'success') {
      return <Badge tone="success"><ShieldCheck className="h-3 w-3" /> Success</Badge>;
    }
    if (value === 'denied') {
      return <Badge tone="warning"><ShieldX className="h-3 w-3" /> Denied</Badge>;
    }
    return <Badge tone="danger"><ShieldAlert className="h-3 w-3" /> Failed</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description="Every change, who made it, and where they made it from."
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="User, path, record or page"
          className="min-w-64 flex-1"
        />

        <Select
          value={action}
          onChange={setAction}
          placeholder="All actions"
          isClearable
          options={filters.actions.map((value) => ({ value, label: value }))}
        />

        <Select
          value={module}
          onChange={setModule}
          placeholder="All modules"
          isClearable
          options={filters.modules.map((value) => ({ value, label: value }))}
        />

        <Select
          value={result}
          onChange={setResult}
          placeholder="Any result"
          isClearable
          options={[
            { value: 'success', label: 'Success' },
            { value: 'failure', label: 'Failed' },
            { value: 'denied', label: 'Denied' },
          ]}
        />

        {/* The picker has no placeholder, so the label carries the meaning. */}
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          From
          <DatePicker value={from} onChange={setFrom} max={to || undefined} />
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-500">
          To
          {/* min = from, so an end date before the start cannot be chosen. */}
          <DatePicker value={to} onChange={setTo} min={from || undefined} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-start text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-start">When</th>
              <th className="px-3 py-2 text-start">User</th>
              <th className="px-3 py-2 text-start">Action</th>
              <th className="px-3 py-2 text-start">Module</th>
              <th className="px-3 py-2 text-start">Record</th>
              <th className="px-3 py-2 text-start">Page</th>
              <th className="px-3 py-2 text-start">Came from</th>
              <th className="px-3 py-2 text-start">Result</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  Nothing matches those filters.
                </td>
              </tr>
            )}

            {rows.map((row) => (
              <tr key={row.auditId} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {new Date(row.occurredAtUtc).toLocaleString()}
                </td>
                <td className="px-3 py-2">{row.username ?? '—'}</td>
                <td className="px-3 py-2"><Badge>{row.action}</Badge></td>
                <td className="px-3 py-2">{row.module}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.entityId ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500">{row.currentPage ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400">{row.previousPage ?? '—'}</td>
                <td className="px-3 py-2">{resultBadge(row.result)}</td>
                <td className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void openDetail(row.auditId)}
                    aria-label="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
      />

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold">Audit entry</h2>
            <pre className="overflow-auto rounded bg-slate-50 p-4 text-xs">
              {JSON.stringify(detail, null, 2)}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setDetail(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
