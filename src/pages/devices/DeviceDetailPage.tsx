import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Battery, CheckCircle2, CircleDot,
  Printer, RefreshCw, Volume2, Wifi, XCircle,
} from 'lucide-react';
import { Badge, Button, Card, CardBody, PageHeader } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useToast } from '@/contexts/ToastContext';
import { deviceService } from '@/services/deviceService';
import type { DeviceEvent, DeviceRow } from '@/services/api/deviceApi';
import { ROUTES } from '@/routes/paths';

/**
 * One device, monitored.
 *
 * The three statuses stay apart here as they do on the list. A device online
 * with an empty printer is the case this page exists to make obvious — a single
 * combined indicator would show green and a cashier would find out at the till.
 */
export default function DeviceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { error: showError, success } = useToast();

  const [device, setDevice] = useState<DeviceRow | null>(null);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [phase, setPhase] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([
        deviceService.get(id),
        deviceService.events(id, 30),
      ]);
      setDevice(d);
      setEvents(e);
    } catch (caught) {
      showError('Could not load the device', (caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, showError]);

  useEffect(() => {
    void load();
  }, [load]);


  const run = async (
    kind: 'ping' | 'test_printer' | 'refresh_status',
    label: string,
  ) => {
    setRunning(kind);
    setPhase('Queued');

    try {
      const result = await deviceService.runCommand(id, kind, (progress) => {
        setPhase(
          progress.phase === 'queued' ? 'Queued'
            : progress.phase === 'waiting'
              ? `Waiting for device… ${Math.round(progress.elapsedMs / 1000)}s`
              : 'Done',
        );
      });

      if (result.succeeded) {
        success(
          `${label} succeeded`,
          kind === 'ping'
            ? `Responded in ${result.roundTripMs} ms. The terminal should have beeped.`
            : result.resultMessage ?? 'Done.',
        );
      } else {
        /* A refusal from the device is information, not a failure of the app —
           "paper not detected" is the answer, and it is actionable. */
        showError(
          `${label} failed`,
          result.resultMessage ?? 'The device did not answer.',
        );
      }

      await load();
    } catch (caught) {
      showError(`Could not send ${label.toLowerCase()}`, (caught as Error).message);
    } finally {
      setRunning(null);
      setPhase('');
    }
  };

  if (loading) return <p className="py-12 text-center text-ink-400">Loading…</p>;
  if (!device) return <p className="py-12 text-center text-ink-400">No such device.</p>;

  const lastSeen = device.secondsSinceHeartbeat === null
    ? 'never'
    : device.secondsSinceHeartbeat < 60
      ? `${device.secondsSinceHeartbeat} seconds ago`
      : device.secondsSinceHeartbeat < 3600
        ? `${Math.floor(device.secondsSinceHeartbeat / 60)} minutes ago`
        : `${Math.floor(device.secondsSinceHeartbeat / 3600)} hours ago`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={device.deviceName}
        description={`${device.deviceId} · ${device.branchNameEn}${device.location ? ` / ${device.location}` : ''}`}
        actions={
          <Button variant="outline" onClick={() => navigate(ROUTES.devices)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      {!device.isRegistered && device.registrationCode && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink-900">Awaiting registration</p>
              <p className="text-xs text-ink-500">
                Enter this code on the terminal. Usable once.
              </p>
            </div>
            <p className="font-mono text-2xl font-semibold tracking-widest text-ink-900">
              {device.registrationCode}
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Status
            </h2>
            <Row label="Connection" value={device.connectionStatus} />
            <Row label="Last heartbeat" value={lastSeen} plain />
            <Row label="Device" value={device.deviceType} plain />
            <Row label="Model" value={device.deviceModel ?? '—'} plain />
            <Row label="Serial" value={device.serialNumber ?? 'not registered'} plain mono />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Printer
            </h2>
            <Row label="Printer" value={device.printerStatus} />
            <Row label="Paper" value={device.paperStatus} />
            <Row label="Paper width" value={`${device.paperWidth} mm`} plain />
            <Row label="Error" value={device.printerError ?? 'none'} plain />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Device
            </h2>
            <Row
              label="Battery"
              value={device.batteryPercent === null ? 'unknown' : `${device.batteryPercent}%`}
              plain
              icon={<Battery className="h-3.5 w-3.5 text-ink-400" />}
            />
            <Row
              label="Network"
              value={device.networkType ?? 'unknown'}
              plain
              icon={<Wifi className="h-3.5 w-3.5 text-ink-400" />}
            />
            <Row label="App version" value={device.appVersion ?? 'unknown'} plain />
            <Row
              label="Registered"
              value={device.registeredAtUtc
                ? new Date(device.registeredAtUtc).toLocaleDateString()
                : 'not yet'}
              plain
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Actions
          </h2>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!device.isRegistered || running !== null}
              loading={running === 'ping'}
              onClick={() => void run('ping', 'Test connection')}
            >
              <Volume2 className="h-4 w-4" />
              {running === 'ping' ? phase : 'Test connection'}
            </Button>

            <Button
              variant="outline"
              disabled={!device.isRegistered || running !== null}
              loading={running === 'test_printer'}
              onClick={() => void run('test_printer', 'Printer test')}
            >
              <Printer className="h-4 w-4" />
              {running === 'test_printer' ? phase : 'Test printer'}
            </Button>

            <Button
              variant="outline"
              disabled={!device.isRegistered || running !== null}
              loading={running === 'refresh_status'}
              onClick={() => void run('refresh_status', 'Refresh status')}
            >
              <RefreshCw className="h-4 w-4" />
              {running === 'refresh_status' ? phase : 'Refresh status'}
            </Button>
          </div>

          <p className="text-xs text-ink-500">
            Commands are collected on the device's next heartbeat, so a response
            takes a couple of seconds. The beep comes from the terminal itself —
            that is what makes it a real test.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Activity
          </h2>

          {events.length === 0 && (
            <p className="py-4 text-center text-sm text-ink-400">Nothing recorded yet.</p>
          )}

          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.eventId} className="flex items-start gap-2 text-sm">
                <span className="w-16 shrink-0 text-xs text-ink-400">
                  {new Date(event.occurredAtUtc).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                <Badge tone={
                  event.severity === 'error' ? 'danger'
                    : event.severity === 'warning' ? 'warning' : 'neutral'
                }>
                  {event.eventType}
                </Badge>
                <span className="text-ink-700">{event.messageEn}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({
  label, value, plain, mono, icon,
}: {
  label: string;
  value: string;
  plain?: boolean;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  const tone =
    value === 'online' || value === 'ready' || value === 'available' ? 'good'
      : value === 'low' ? 'warn'
        : value === 'offline' || value === 'error' || value === 'empty' ? 'bad'
          : 'muted';

  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? AlertTriangle
    : tone === 'bad' ? XCircle : CircleDot;

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className={cn('flex items-center gap-1.5 text-ink-800', mono && 'font-mono text-xs')}>
        {icon}
        {!plain && (
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
        )}
        <span className={cn(!plain && 'capitalize')}>{value}</span>
      </span>
    </div>
  );
}
