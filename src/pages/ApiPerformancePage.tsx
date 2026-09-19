import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Database, Repeat } from 'lucide-react';
import { Badge, Button, KpiCard, PageHeader, Tabs } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { auditApi, type EndpointPerformance } from '@/services/api';

/**
 * API performance and query monitor.
 *
 * Figures come from what actually ran, recorded per request, not from a
 * synthetic benchmark. Averages are shown next to the worst case because an
 * average hides the tail: nineteen calls at 40ms and one at 4 seconds averages
 * 238ms and looks healthy, while the twentieth caller is the one complaining.
 */

type Tab = 'endpoints' | 'slow' | 'nplusone';

const RATING_TONE = {
  Excellent: 'success',
  Good: 'success',
  Acceptable: 'info',
  Slow: 'warning',
  Critical: 'danger',
} as const;

export default function ApiPerformancePage() {
  const { error: showError } = useToast();

  const [tab, setTab] = useState<Tab>('endpoints');
  const [loading, setLoading] = useState(true);

  const [endpoints, setEndpoints] = useState<EndpointPerformance[]>([]);
  const [summary, setSummary] = useState<{
    totalCalls: number;
    avgMs: number;
    worstMs: number;
    failures: number;
    criticalCalls: number;
    slowCalls: number;
  } | null>(null);

  const [slowRequests, setSlowRequests] = useState<Record<string, unknown>[]>([]);
  const [slowQueries, setSlowQueries] = useState<Record<string, unknown>[]>([]);
  const [nPlusOne, setNPlusOne] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [performance, slow, repeated] = await Promise.all([
        auditApi.performance(),
        auditApi.slow(300, 50),
        auditApi.nPlusOne(),
      ]);

      setEndpoints(performance.endpoints);
      setSummary(performance.summary);
      setSlowRequests(slow.requests);
      setSlowQueries(slow.queries);
      setNPlusOne(repeated);
    } catch (caught) {
      showError('Could not load performance data', (caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Milliseconds for judging, seconds for reading aloud. Both derived from the
     one stored measurement, so they cannot disagree. */
  const ms = (value: unknown) => (typeof value === 'number' ? `${value} ms` : '—');
  const seconds = (value: unknown) =>
    typeof value === 'number' ? `${(value / 1000).toFixed(3)} s` : '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title="API performance"
        description="Measured from real requests, not a benchmark."
        actions={<Button onClick={() => void load()} loading={loading}>Refresh</Button>}
      />

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Calls recorded" value={String(summary.totalCalls)} icon={<Activity />} />
          <KpiCard label="Average" value={`${summary.avgMs ?? 0} ms`} icon={<Activity />} />
          <KpiCard label="Worst" value={`${summary.worstMs ?? 0} ms`} icon={<AlertTriangle />} />
          <KpiCard
            label="Over 2 seconds"
            value={String(summary.criticalCalls ?? 0)}
            icon={<AlertTriangle />}
          />
        </div>
      )}

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        items={[
          { value: 'endpoints', label: 'By endpoint' },
          { value: 'slow', label: 'Slowest' },
          { value: 'nplusone', label: 'Repeated queries' },
        ]}
      />

      {tab === 'endpoints' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start">Endpoint</th>
                <th className="px-3 py-2 text-start">Method</th>
                <th className="px-3 py-2 text-end">Calls</th>
                <th className="px-3 py-2 text-end">Average</th>
                <th className="px-3 py-2 text-end">Worst</th>
                <th className="px-3 py-2 text-end">Database</th>
                <th className="px-3 py-2 text-end">Failures</th>
                <th className="px-3 py-2 text-start">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {endpoints.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    Nothing recorded yet. Use the app and refresh.
                  </td>
                </tr>
              )}

              {endpoints.map((row) => (
                <tr key={`${row.httpMethod}-${row.apiPath}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{row.apiPath}</td>
                  <td className="px-3 py-2">{row.httpMethod}</td>
                  <td className="px-3 py-2 text-end">{row.calls}</td>
                  <td className="px-3 py-2 text-end">{row.avgMs} ms</td>
                  <td className="px-3 py-2 text-end">{row.maxMs} ms</td>
                  <td className="px-3 py-2 text-end text-slate-500">{row.avgDatabaseMs} ms</td>
                  <td className="px-3 py-2 text-end">
                    {row.failures > 0
                      ? <span className="text-red-600">{row.failures} ({row.failurePercent}%)</span>
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={RATING_TONE[row.rating] ?? 'neutral'}>{row.rating}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'slow' && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <Activity className="h-4 w-4" /> Slowest requests
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">When</th>
                    <th className="px-3 py-2 text-start">Endpoint</th>
                    <th className="px-3 py-2 text-start">Page</th>
                    <th className="px-3 py-2 text-start">Came from</th>
                    <th className="px-3 py-2 text-end">Total</th>
                    <th className="px-3 py-2 text-end">Seconds</th>
                    <th className="px-3 py-2 text-end">Database</th>
                    <th className="px-3 py-2 text-end">Queries</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slowRequests.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                        Nothing slower than 300 ms. That is the good outcome.
                      </td>
                    </tr>
                  )}

                  {slowRequests.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                        {new Date(String(row.occurredAtUtc)).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {String(row.httpMethod)} {String(row.apiPath)}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{String(row.currentPage ?? '—')}</td>
                      <td className="px-3 py-2 text-slate-400">{String(row.previousPage ?? '—')}</td>
                      <td className="px-3 py-2 text-end font-medium">{ms(row.totalMs)}</td>
                      <td className="px-3 py-2 text-end text-slate-500">{seconds(row.totalMs)}</td>
                      <td className="px-3 py-2 text-end text-slate-500">{ms(row.databaseMs)}</td>
                      <td className="px-3 py-2 text-end">{String(row.queryCount ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <Database className="h-4 w-4" /> Slowest statements
            </h3>
            <p className="mb-2 text-xs text-slate-500">
              Parameter values are never recorded — only their names. A query log
              holding values would be a second copy of every card reference and
              phone number that passed through a WHERE clause.
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">Type</th>
                    <th className="px-3 py-2 text-start">Statement</th>
                    <th className="px-3 py-2 text-start">Parameters</th>
                    <th className="px-3 py-2 text-end">Time</th>
                    <th className="px-3 py-2 text-end">Seconds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slowQueries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                        No statements recorded yet.
                      </td>
                    </tr>
                  )}

                  {slowQueries.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-3 py-2"><Badge>{String(row.queryType)}</Badge></td>
                      <td className="max-w-md truncate px-3 py-2 font-mono text-xs">
                        {String(row.commandText)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400">
                        {String(row.parameterNames ?? '—')}
                      </td>
                      <td className="px-3 py-2 text-end font-medium">{ms(row.durationMs)}</td>
                      <td className="px-3 py-2 text-end text-slate-500">{seconds(row.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'nplusone' && (
        <div>
          <p className="mb-3 text-sm text-slate-600">
            One request running the same statement many times. Usually a loop
            issuing a query per row where a single query would do.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">Endpoint</th>
                  <th className="px-3 py-2 text-start">Statement</th>
                  <th className="px-3 py-2 text-end">Executions</th>
                  <th className="px-3 py-2 text-end">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nPlusOne.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      <Repeat className="mx-auto mb-2 h-5 w-5" />
                      No repeated-query patterns detected.
                    </td>
                  </tr>
                )}

                {nPlusOne.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">
                      {String(row.httpMethod)} {String(row.apiPath)}
                    </td>
                    <td className="max-w-md truncate px-3 py-2 font-mono text-xs">
                      {String(row.statement)}
                    </td>
                    <td className="px-3 py-2 text-end font-medium text-amber-600">
                      {String(row.executions)}
                    </td>
                    <td className="px-3 py-2 text-end">{ms(row.totalMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
