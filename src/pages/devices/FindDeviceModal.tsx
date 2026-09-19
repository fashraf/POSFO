import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, Radar, RefreshCw, ShieldCheck, Wifi, XCircle,
} from 'lucide-react';
import { Badge, Button, FormField, Input, Modal, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useToast } from '@/contexts/ToastContext';
import { useSession } from '@/contexts/SessionContext';
import { discoveryService } from '@/services/discoveryService';
import type { DiscoveredDevice } from '@/services/api/discoveryApi';
import { ROUTES } from '@/routes/paths';

/**
 * Find a terminal without typing its address.
 *
 * **There is no scan.** The server cannot see a shop's network, so an
 * unregistered terminal announces itself and this reads what has arrived.
 * The wording throughout says "listening", never "scanning", and there is no
 * progress bar — a bar implies a search with an end, and this has neither.
 */
export default function FindDeviceModal({
  open, onClose, onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const navigate = useNavigate();
  const { error: showError, success } = useToast();
  const { branches } = useSession();

  const [phase, setPhase] = useState<'idle' | 'looking' | 'results' | 'error'>('idle');
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [failure, setFailure] = useState('');

  const [selected, setSelected] = useState<DiscoveredDevice | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyPhase, setVerifyPhase] = useState('');
  const [verified, setVerified] = useState<{ ok: boolean; message: string } | null>(null);

  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [location, setLocation] = useState('');
  const [connecting, setConnecting] = useState(false);

  const look = async () => {
    setPhase('looking');
    setFailure('');

    try {
      const found = await discoveryService.list(120);
      setDevices(found);
      setPhase('results');
    } catch (caught) {
      setFailure((caught as Error).message);
      setPhase('error');
    }
  };

  const choose = (device: DiscoveredDevice) => {
    setSelected(device);
    setVerified(null);
    setDeviceId(device.claimedDeviceId ?? '');
    setDeviceName(device.deviceName ?? 'SUNMI POS');
    setBranchId(branches[0]?.id ?? '');
    setLocation('');
  };

  const verify = async () => {
    if (!selected) return;

    setVerifying(true);
    setVerifyPhase('Asking the terminal…');

    try {
      const outcome = await discoveryService.verify(selected.serialNumber, (progress) => {
        setVerifyPhase(
          progress.phase === 'issued' ? 'Asking the terminal…'
            : progress.phase === 'waiting'
              ? `Waiting for a reply… ${Math.round(progress.elapsedMs / 1000)}s`
              : 'Done',
        );
      });

      setVerified({ ok: outcome.verified, message: outcome.message });
    } catch (caught) {
      showError('Verification failed', (caught as Error).message);
    } finally {
      setVerifying(false);
      setVerifyPhase('');
    }
  };

  const connect = async () => {
    if (!selected) return;

    if (!deviceId.trim() || !branchId) {
      showError('Missing details', 'A device id and a branch are required.');
      return;
    }

    setConnecting(true);

    try {
      await discoveryService.connect({
        serialNumber: selected.serialNumber,
        deviceId: deviceId.trim().toUpperCase(),
        branchId,
        location: location.trim() || null,
        deviceName: deviceName.trim(),
      });

      success(
        'Device connected',
        'The terminal will finish registering itself within a few seconds.',
      );

      onConnected();
      onClose();
    } catch (caught) {
      showError('Could not connect the device', (caught as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const seen = (device: DiscoveredDevice) =>
    device.secondsSinceSeen < 60
      ? `${device.secondsSinceSeen}s ago`
      : `${Math.floor(device.secondsSinceSeen / 60)} min ago`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Find a POS device"
      /* Roughly three-quarters of the viewport, as asked. */
      className="h-[75vh] w-[75vw] max-w-none"
      dismissible={!connecting}
    >
      <div className="flex h-full flex-col">
        <p className="text-sm text-ink-600">
          Terminals running the Nazad POS app announce themselves while they are
          unregistered. This shows the ones heard from in the last two minutes.
        </p>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-ink-700">
            <Wifi className="h-4 w-4 text-ink-400" aria-hidden />
            Listening for announcements
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void look()}
            loading={phase === 'looking'}
          >
            <RefreshCw className="h-4 w-4" />
            {phase === 'idle' ? 'Start listening' : 'Look again'}
          </Button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto">
          {phase === 'idle' && (
            <Empty
              icon={<Radar className="h-8 w-8 text-ink-300" />}
              title="Nothing looked for yet"
              body="Press Start listening to see which terminals have announced themselves."
            />
          )}

          {phase === 'looking' && (
            <Empty
              icon={<Radar className="h-8 w-8 animate-pulse text-brand-500" />}
              title="Listening…"
              /* No bar. Nothing here has a percentage, and implying one would
                 be inventing progress the server cannot report. */
              body="Reading announcements from the last two minutes."
            />
          )}

          {phase === 'error' && (
            <Empty
              icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
              title="Could not read announcements"
              body={failure || 'The request failed.'}
              action={<Button variant="outline" onClick={() => void look()}>Try again</Button>}
            />
          )}

          {phase === 'results' && devices.length === 0 && (
            <Empty
              icon={<Radar className="h-8 w-8 text-ink-300" />}
              title="No terminals heard from"
              body={
                <ul className="mx-auto mt-2 max-w-md list-disc space-y-1 ps-5 text-start text-sm text-ink-500">
                  <li>The terminal is switched on</li>
                  <li>The Nazad POS app is open</li>
                  <li>The terminal has internet access</li>
                  <li>It is not already registered — registered terminals stop announcing</li>
                </ul>
              }
              action={<Button variant="outline" onClick={() => void look()}>Look again</Button>}
            />
          )}

          {phase === 'results' && devices.length > 0 && !selected && (
            <>
              <p className="mb-3 text-sm font-medium text-ink-700">
                {devices.length} terminal{devices.length === 1 ? '' : 's'} heard from
              </p>

              <div className="grid gap-3 xl:grid-cols-2">
                {devices.map((device) => (
                  <article
                    key={device.serialNumber}
                    className="rounded-lg border border-ink-200 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">
                          {device.deviceName ?? 'SUNMI terminal'}
                        </p>
                        <p className="font-mono text-xs text-ink-500">
                          {device.serialNumber}
                        </p>
                      </div>
                      <StatusBadge status={device.discoveryStatus} />
                    </div>

                    <dl className="mt-3 space-y-1 text-xs text-ink-600">
                      <Line label="Model" value={`${device.manufacturer ?? '—'} ${device.deviceModel ?? ''}`} />
                      <Line label="App" value={device.appVersion ?? '—'} />
                      <Line label="Network" value={device.networkName ?? '—'} />
                      {/* Shown to help recognise the terminal, never used as
                          identity — an address changes with every lease. */}
                      <Line label="Local address" value={device.localIpAddress ?? '—'} />
                      <Line label="Last heard" value={seen(device)} />
                    </dl>

                    <div className="mt-3 flex justify-end gap-2">
                      {device.discoveryStatus === 'already_registered' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onClose();
                            navigate(
                              ROUTES.deviceDetail.replace(':id', device.matchedDeviceId ?? ''),
                            );
                          }}
                        >
                          Open device
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => choose(device)}>
                          Connect
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {selected && (
            <div className="mx-auto max-w-xl space-y-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm text-ink-500 hover:underline"
              >
                ← Back to the list
              </button>

              <div className="rounded-lg border border-ink-200 p-4">
                <p className="font-medium text-ink-900">
                  {selected.deviceName ?? 'SUNMI terminal'}
                </p>
                <p className="font-mono text-xs text-ink-500">{selected.serialNumber}</p>

                <dl className="mt-3 space-y-1 text-xs text-ink-600">
                  <Line label="Model" value={`${selected.manufacturer ?? '—'} ${selected.deviceModel ?? ''}`} />
                  <Line label="Local address" value={selected.localIpAddress ?? '—'} />
                  <Line label="Network" value={selected.networkName ?? '—'} />
                </dl>
              </div>

              {/* Verification before registration. Discovery is a claim by an
                  unauthenticated stranger until the terminal answers. */}
              <div className="rounded-lg border border-ink-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                    <ShieldCheck className="h-4 w-4 text-ink-400" aria-hidden />
                    Verify the terminal
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void verify()}
                    loading={verifying}
                  >
                    {verifying ? verifyPhase : 'Verify'}
                  </Button>
                </div>

                {verified && (
                  <p
                    className={cn(
                      'mt-3 flex items-start gap-2 text-sm',
                      verified.ok ? 'text-emerald-700' : 'text-amber-700',
                    )}
                  >
                    {verified.ok
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                    {verified.message}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Device id" required
                           hint="Read aloud and typed on terminals, so keep it short.">
                  <Input
                    dir="ltr"
                    value={deviceId}
                    onChange={(event) => setDeviceId(event.target.value.toUpperCase())}
                    placeholder="POS-RYD-001"
                  />
                </FormField>

                <FormField label="Device name" required>
                  <Input
                    value={deviceName}
                    onChange={(event) => setDeviceName(event.target.value)}
                  />
                </FormField>

                <FormField label="Branch" required>
                  <Select
                    value={branchId}
                    onChange={setBranchId}
                    placeholder="Choose a branch"
                    options={branches.map((b) => ({ value: b.id, label: b.nameEn }))}
                  />
                </FormField>

                <FormField label="Location" showOptional>
                  <Input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Counter 01"
                  />
                </FormField>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-200 pt-3">
          <p className="text-xs text-ink-500">
            A terminal only appears while it is unregistered and has internet access.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={connecting}>
              Close
            </Button>

            {selected && (
              <Button
                onClick={() => void connect()}
                loading={connecting}
                /* Verification is required first — the button stays inert until
                   the terminal has answered, whichever way it answered. */
                disabled={!verified}
              >
                Connect and register
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function StatusBadge({ status }: { status: DiscoveredDevice['discoveryStatus'] }) {
  if (status === 'already_registered') {
    return <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Registered</Badge>;
  }
  if (status === 'awaiting_registration') {
    return <Badge tone="warning">Awaiting registration</Badge>;
  }
  return <Badge tone="info">Available</Badge>;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className="truncate text-end">{value}</dd>
    </div>
  );
}

function Empty({
  icon, title, body, action,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
      {icon}
      <p className="font-medium text-ink-800">{title}</p>
      <div className="max-w-md text-sm text-ink-500">{body}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export { XCircle };
