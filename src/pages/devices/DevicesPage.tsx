import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, CircleDot, Plus, Printer, Radar, RefreshCw, Volume2, XCircle,
} from 'lucide-react';
import { Badge, Button, PageHeader, SearchInput, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useToast } from '@/contexts/ToastContext';
import { useSession } from '@/contexts/SessionContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { deviceService } from '@/services/deviceService';
import type { DeviceRow } from '@/services/api/deviceApi';
import { ROUTES } from '@/routes/paths';
import FindDeviceModal from './FindDeviceModal';

/**
 * POS devices.
 *
 * Cards rather than table rows, because each device carries three independent
 * statuses — connection, printer, paper — and a row cannot hold them legibly.
 * Collapsing them into one column would hide the case that matters most: a
 * device that is online and cannot print.
 */
export default function DevicesPage() {
  const navigate = useNavigate();
  const { error: showError, success } = useToast();
  const { branches } = useSession();

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [pinging, setPinging] = useState<string | null>(null);
  const [pingPhase, setPingPhase] = useState('');
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [findOpen, setFindOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    try {
      setDevices(await deviceService.list({
        search: debouncedSearch || undefined,
        branchId: branchId || undefined,
        status: status || undefined,
      }));
      setReadAt(new Date());
    } catch (caught) {
      showError('Could not load devices', (caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, branchId, status, showError]);

  useEffect(() => {
    void load();
  }, [load]);


  const ping = async (device: DeviceRow) => {
    setPinging(device.deviceId);
    setPingPhase('Queued');

    try {
      const result = await deviceService.ping(device.deviceId, (progress) => {
        /* Say what is actually happening. A plain spinner would imply an open
           connection to a device that may simply be asleep. */
        setPingPhase(
          progress.phase === 'queued' ? 'Queued'
            : progress.phase === 'waiting'
              ? `Waiting for device… ${Math.round(progress.elapsedMs / 1000)}s`
              : 'Done',
        );
      });

      if (result.succeeded) {
        success(
          'Device responded',
          `${device.deviceName} acknowledged the ping in ${result.roundTripMs} ms. The terminal should have beeped.`,
        );
      } else {
        showError(
          'No response',
          result.resultMessage ?? 'The device did not answer.',
        );
      }

      await load();
    } catch (caught) {
      showError('Could not send the ping', (caught as Error).message);
    } finally {
      setPinging(null);
      setPingPhase('');
    }
  };

  const lastSeen = (device: DeviceRow) => {
    if (device.secondsSinceHeartbeat === null) return 'never';
    const s = device.secondsSinceHeartbeat;
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    return `${Math.floor(s / 3600)} h ago`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="POS devices"
        description="Registered terminals, their connection, and their printers."
        actions={
          <div className="flex items-center gap-2">
            {readAt && (
              /* Connection is worked out from a clock, so these figures age
                 from the moment they are read. Saying when keeps that honest
                 now that nothing refreshes on its own. */
              <span className="text-xs text-ink-400">
                Read at {readAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <Button variant="outline" onClick={() => void load()} loading={loading}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            {/* Discovery first: it is the path that needs no code typed.
                Manual registration stays, because discovery needs the terminal
                switched on and online, and often it is neither. */}
            <Button variant="outline" onClick={() => setFindOpen(true)}>
              <Radar className="h-4 w-4" /> Find nearby device
            </Button>
            <Button onClick={() => navigate(ROUTES.deviceNew)}>
              <Plus className="h-4 w-4" /> Add device
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="Name, device id, serial or location"
          className="min-w-64 flex-1"
        />

        <Select
          value={branchId}
          onChange={setBranchId}
          placeholder="All branches"
          isClearable
          options={branches.map((b) => ({ value: b.id, label: b.nameEn }))}
        />

        <Select
          value={status}
          onChange={setStatus}
          placeholder="Any status"
          isClearable
          options={[
            { value: 'online', label: 'Online' },
            { value: 'offline', label: 'Offline' },
            { value: 'unregistered', label: 'Not registered' },
          ]}
        />
      </div>

      {loading && <p className="py-8 text-center text-ink-400">Loading…</p>}

      {!loading && devices.length === 0 && (
        <div className="rounded-lg border border-dashed border-ink-300 py-12 text-center">
          <p className="text-ink-500">No devices match those filters.</p>
        </div>
      )}

      <FindDeviceModal
        open={findOpen}
        onClose={() => setFindOpen(false)}
        onConnected={() => void load()}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {devices.map((device) => (
          <article
            key={device.deviceId}
            className="rounded-lg border border-ink-200 bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to={ROUTES.deviceDetail.replace(':id', device.deviceId)}
                  className="font-semibold text-ink-900 hover:underline"
                >
                  {device.deviceName}
                </Link>
                <p className="font-mono text-xs text-ink-500">{device.deviceId}</p>
                <p className="truncate text-xs text-ink-500">
                  {device.branchNameEn}
                  {device.location ? ` / ${device.location}` : ''}
                </p>
              </div>

              {!device.isRegistered && (
                <Badge tone="warning">Not registered</Badge>
              )}
            </div>

            {/* Three statuses, never combined. Online does not mean ready. */}
            <dl className="mt-4 space-y-1.5 text-sm">
              <StatusRow
                label="Connection"
                value={device.connectionStatus}
                detail={device.isRegistered ? `Last seen ${lastSeen(device)}` : undefined}
              />
              <StatusRow label="Printer" value={device.printerStatus} detail={device.printerError ?? undefined} />
              <StatusRow label="Paper" value={device.paperStatus} />
            </dl>

            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(ROUTES.deviceDetail.replace(':id', device.deviceId))}
              >
                View
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!device.isRegistered || pinging !== null}
                loading={pinging === device.deviceId}
                onClick={() => void ping(device)}
              >
                <Volume2 className="h-4 w-4" />
                {pinging === device.deviceId ? pingPhase : 'Test connection'}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/** One status line, coloured by state. */
function StatusRow({
  label, value, detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  const tone =
    value === 'online' || value === 'ready' || value === 'available'
      ? 'good'
      : value === 'low'
        ? 'warn'
        : value === 'offline' || value === 'error' || value === 'empty'
          ? 'bad'
          : 'muted';

  const Icon =
    tone === 'good' ? CheckCircle2 : tone === 'warn' ? AlertTriangle
      : tone === 'bad' ? XCircle : CircleDot;

  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="flex items-center gap-1.5 text-end">
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            tone === 'good' && 'text-emerald-600',
            tone === 'warn' && 'text-amber-500',
            tone === 'bad' && 'text-red-600',
            tone === 'muted' && 'text-ink-300',
          )}
          aria-hidden
        />
        <span className="capitalize text-ink-800">{value}</span>
        {detail && <span className="text-xs text-ink-400">· {detail}</span>}
      </dd>
    </div>
  );
}

export { Printer };
