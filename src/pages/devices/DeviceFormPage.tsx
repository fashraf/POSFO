import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, KeyRound } from 'lucide-react';
import {
  Button, Card, CardBody, FormField, Input, PageHeader, Select,
} from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useSession } from '@/contexts/SessionContext';
import { deviceService } from '@/services/deviceService';
import { ROUTES } from '@/routes/paths';

/**
 * Create a device record, then hand over its registration code.
 *
 * The record exists before the terminal does. That ordering is deliberate: the
 * admin decides which branch and counter a device belongs to, and the code is
 * what binds the physical terminal to that decision — rather than a device
 * arriving and announcing where it thinks it is.
 */
export default function DeviceFormPage() {
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const { branches } = useSession();

  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceModel, setDeviceModel] = useState('T5930');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [paperWidth, setPaperWidth] = useState('80');

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ deviceId: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const validate = () => {
    const found: Record<string, string> = {};

    if (!deviceId.trim()) found.deviceId = 'A device id is required.';
    else if (!/^[A-Z0-9-]+$/.test(deviceId.trim())) {
      /* It gets read aloud across a shop floor and typed on a terminal, so it
         stays to characters that survive that. */
      found.deviceId = 'Use capitals, digits and hyphens only, e.g. POS-RYD-001.';
    }

    if (!deviceName.trim()) found.deviceName = 'A name is required.';
    if (!branchId) found.branchId = 'Choose a branch.';

    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;

    setSaving(true);

    try {
      const result = await deviceService.create({
        deviceId: deviceId.trim().toUpperCase(),
        deviceName: deviceName.trim(),
        deviceModel: deviceModel.trim() || null,
        branchId,
        location: location.trim() || null,
        description: description.trim() || null,
        paperWidth: Number(paperWidth),
      });

      /* Stay on the page. The code is the only thing that matters now, it is
         shown once, and navigating away would lose it. */
      setCreated({ deviceId: result.deviceId, code: result.registrationCode });
    } catch (caught) {
      showError('Could not create the device', (caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader title="Device created" description="Register the terminal with this code." />

        <Card>
          <CardBody className="space-y-4 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-brand-600" aria-hidden />

            <div>
              <p className="text-sm text-ink-500">Registration code</p>
              <p className="mt-1 font-mono text-3xl font-semibold tracking-widest text-ink-900">
                {created.code}
              </p>
              <p className="mt-2 text-xs text-ink-500">
                Valid for 24 hours, and usable once.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(created.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy code'}
            </Button>

            <div className="rounded-lg bg-ink-50 p-4 text-start text-sm text-ink-700">
              <p className="font-medium">On the terminal</p>
              <ol className="mt-2 list-decimal space-y-1 ps-5 text-ink-600">
                <li>Open the Nazad POS app</li>
                <li>Choose Register device</li>
                <li>Enter this code</li>
              </ol>
              <p className="mt-3 text-xs text-ink-500">
                The terminal sends its serial number, which binds it to this
                record. A second terminal cannot use the same code.
              </p>
            </div>

            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => navigate(ROUTES.devices)}>
                Back to devices
              </Button>
              <Button
                onClick={() => navigate(ROUTES.deviceDetail.replace(':id', created.deviceId))}
              >
                View device
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Add POS device"
        description="Create the record first; the terminal registers against it."
      />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Device information
            </p>
          </div>

          <FormField label="Device id" required error={errors.deviceId}
                     hint="Read aloud and typed on the terminal, so keep it short.">
            <Input
              dir="ltr"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value.toUpperCase())}
              placeholder="POS-RYD-001"
            />
          </FormField>

          <FormField label="Device name" required error={errors.deviceName}>
            <Input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder="SUNMI POS 01"
            />
          </FormField>

          <FormField label="Device model" showOptional>
            <Input
              dir="ltr"
              value={deviceModel}
              onChange={(event) => setDeviceModel(event.target.value)}
              placeholder="T5930"
            />
          </FormField>

          <FormField label="Branch" required error={errors.branchId}>
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

          <FormField label="Description" showOptional>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>

          <div className="mt-2 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Configuration
            </p>
          </div>

          <FormField label="Printer">
            <Input value="Built-in SUNMI printer" disabled readOnly />
          </FormField>

          <FormField label="Paper width"
                     hint="The receipt formatter uses this to set its column count.">
            <Select
              value={paperWidth}
              onChange={setPaperWidth}
              options={[
                { value: '58', label: '58 mm (32 characters)' },
                { value: '80', label: '80 mm (48 characters)' },
              ]}
            />
          </FormField>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(ROUTES.devices)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} loading={saving}>
          Create device
        </Button>
      </div>
    </div>
  );
}
