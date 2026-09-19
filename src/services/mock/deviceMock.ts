import type {
  CommandType, DeviceCommandResult, DeviceEvent, DeviceRow,
} from '../api/deviceApi';
import type { CommandProgress } from '../deviceService';

/**
 * Devices for development.
 *
 * Deliberately includes the states that are easy to get wrong and impossible to
 * stage on demand: a device that is online with no paper, one offline for an
 * hour, one created but never registered, and one whose printer is reporting an
 * error. Three healthy devices would let every one of those render wrongly
 * without anyone noticing.
 */

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const secondsAgo = (n: number) => new Date(Date.now() - n * 1_000).toISOString();

let devices: DeviceRow[] = [
  {
    deviceId: 'POS-RYD-001', deviceName: 'SUNMI POS 01', deviceType: 'sunmi_v2',
    deviceModel: 'T5930', serialNumber: 'SN2026RYD0001',
    branchId: 'brn_001', branchNameAr: 'الرياض الرئيسي', branchNameEn: 'Riyadh Main',
    location: 'Counter 01', description: null, paperWidth: 80, printerKind: 'sunmi_builtin',
    connectionStatus: 'online', printerStatus: 'ready', paperStatus: 'available',
    lastHeartbeatAtUtc: secondsAgo(12), secondsSinceHeartbeat: 12,
    printerError: null, batteryPercent: 78, networkType: 'wifi', appVersion: '1.0.12',
    registeredAtUtc: minutesAgo(4320), registrationCode: null, codeExpiresAtUtc: null,
    isRegistered: true, isActive: true, pendingCommands: 0,
  },
  {
    /* Online, and cannot print. The case a single status indicator hides. */
    deviceId: 'POS-RYD-002', deviceName: 'SUNMI POS 02', deviceType: 'sunmi_v2',
    deviceModel: 'T5930', serialNumber: 'SN2026RYD0002',
    branchId: 'brn_001', branchNameAr: 'الرياض الرئيسي', branchNameEn: 'Riyadh Main',
    location: 'Counter 02', description: null, paperWidth: 58, printerKind: 'sunmi_builtin',
    connectionStatus: 'online', printerStatus: 'ready', paperStatus: 'empty',
    lastHeartbeatAtUtc: secondsAgo(8), secondsSinceHeartbeat: 8,
    printerError: null, batteryPercent: 45, networkType: 'wifi', appVersion: '1.0.12',
    registeredAtUtc: minutesAgo(2880), registrationCode: null, codeExpiresAtUtc: null,
    isRegistered: true, isActive: true, pendingCommands: 0,
  },
  {
    /* Gone. Its printer state is unknown, not whatever it last reported. */
    deviceId: 'POS-JED-001', deviceName: 'SUNMI POS 03', deviceType: 'sunmi_v2',
    deviceModel: 'T5930', serialNumber: 'SN2026JED0001',
    branchId: 'brn_002', branchNameAr: 'جدة', branchNameEn: 'Jeddah',
    location: 'Counter 01', description: null, paperWidth: 80, printerKind: 'sunmi_builtin',
    connectionStatus: 'offline', printerStatus: 'unknown', paperStatus: 'unknown',
    lastHeartbeatAtUtc: minutesAgo(62), secondsSinceHeartbeat: 3720,
    printerError: null, batteryPercent: null, networkType: null, appVersion: '1.0.11',
    registeredAtUtc: minutesAgo(10080), registrationCode: null, codeExpiresAtUtc: null,
    isRegistered: true, isActive: true, pendingCommands: 0,
  },
  {
    /* Online with a printer fault — distinct from having no paper. */
    deviceId: 'POS-JED-002', deviceName: 'SUNMI POS 04', deviceType: 'sunmi_v2',
    deviceModel: 'T5930', serialNumber: 'SN2026JED0002',
    branchId: 'brn_002', branchNameAr: 'جدة', branchNameEn: 'Jeddah',
    location: 'Drive-through', description: null, paperWidth: 80, printerKind: 'sunmi_builtin',
    connectionStatus: 'online', printerStatus: 'error', paperStatus: 'unknown',
    lastHeartbeatAtUtc: secondsAgo(20), secondsSinceHeartbeat: 20,
    printerError: 'Print head overheated', batteryPercent: 91, networkType: 'mobile',
    appVersion: '1.0.12',
    registeredAtUtc: minutesAgo(1440), registrationCode: null, codeExpiresAtUtc: null,
    isRegistered: true, isActive: true, pendingCommands: 0,
  },
  {
    /* Created, never registered. It has a code and has never been seen. */
    deviceId: 'POS-RYD-003', deviceName: 'SUNMI POS 05', deviceType: 'sunmi_v2',
    deviceModel: null, serialNumber: null,
    branchId: 'brn_001', branchNameAr: 'الرياض الرئيسي', branchNameEn: 'Riyadh Main',
    location: 'Counter 03', description: 'Awaiting delivery', paperWidth: 80,
    printerKind: 'sunmi_builtin',
    connectionStatus: 'unregistered', printerStatus: 'unknown', paperStatus: 'unknown',
    lastHeartbeatAtUtc: null, secondsSinceHeartbeat: null,
    printerError: null, batteryPercent: null, networkType: null, appVersion: null,
    registeredAtUtc: null, registrationCode: 'HKMP-7Q2V',
    codeExpiresAtUtc: new Date(Date.now() + 20 * 3600_000).toISOString(),
    isRegistered: false, isActive: true, pendingCommands: 0,
  },
];

let events: Record<string, DeviceEvent[]> = {
  'POS-RYD-001': [
    { eventId: 3, eventType: 'heartbeat', severity: 'info',
      messageEn: 'Heartbeat received', messageAr: 'تم استلام النبض',
      occurredAtUtc: secondsAgo(12) },
    { eventId: 2, eventType: 'printer', severity: 'info',
      messageEn: 'Printer status: ready', messageAr: 'حالة الطابعة: جاهزة',
      occurredAtUtc: minutesAgo(1) },
    { eventId: 1, eventType: 'registered', severity: 'info',
      messageEn: 'Device registered', messageAr: 'تم تسجيل الجهاز',
      occurredAtUtc: minutesAgo(4320) },
  ],
  'POS-RYD-002': [
    { eventId: 5, eventType: 'paper', severity: 'warning',
      messageEn: 'Paper empty', messageAr: 'الورق فارغ', occurredAtUtc: minutesAgo(6) },
  ],
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const code = () => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => a[Math.floor(Math.random() * a.length)];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
};

export const mockDeviceService = {
  async list(query: { branchId?: string; status?: string; deviceType?: string; search?: string } = {}) {
    await delay(180);

    return devices.filter((d) => {
      if (query.branchId && d.branchId !== query.branchId) return false;
      if (query.status && d.connectionStatus !== query.status) return false;
      if (query.deviceType && d.deviceType !== query.deviceType) return false;

      if (query.search) {
        const needle = query.search.toLowerCase();
        return [d.deviceName, d.deviceId, d.serialNumber, d.location]
          .some((field) => field?.toLowerCase().includes(needle));
      }

      return true;
    });
  },

  async get(deviceId: string): Promise<DeviceRow> {
    await delay(120);
    const found = devices.find((d) => d.deviceId === deviceId);
    if (!found) throw new Error('No such device.');
    return found;
  },

  async events(deviceId: string, take = 50): Promise<DeviceEvent[]> {
    await delay(120);
    return (events[deviceId] ?? []).slice(0, take);
  },

  async create(body: {
    deviceId: string; deviceName: string; deviceType?: string; deviceModel?: string | null;
    branchId: string; location?: string | null; description?: string | null;
    paperWidth?: number; isActive?: boolean;
  }) {
    await delay(300);

    if (devices.some((d) => d.deviceId === body.deviceId)) {
      throw new Error('That device id is already in use.');
    }

    const registrationCode = code();

    devices = [...devices, {
      deviceId: body.deviceId, deviceName: body.deviceName,
      deviceType: body.deviceType ?? 'sunmi_v2', deviceModel: body.deviceModel ?? null,
      serialNumber: null, branchId: body.branchId,
      branchNameAr: body.branchId === 'brn_002' ? 'جدة' : 'الرياض الرئيسي',
      branchNameEn: body.branchId === 'brn_002' ? 'Jeddah' : 'Riyadh Main',
      location: body.location ?? null, description: body.description ?? null,
      paperWidth: body.paperWidth ?? 80, printerKind: 'sunmi_builtin',
      connectionStatus: 'unregistered', printerStatus: 'unknown', paperStatus: 'unknown',
      lastHeartbeatAtUtc: null, secondsSinceHeartbeat: null, printerError: null,
      batteryPercent: null, networkType: null, appVersion: null,
      registeredAtUtc: null, registrationCode,
      codeExpiresAtUtc: new Date(Date.now() + 24 * 3600_000).toISOString(),
      isRegistered: false, isActive: body.isActive ?? true, pendingCommands: 0,
    }];

    return { deviceId: body.deviceId, registrationCode, expiresInHours: 24 };
  },

  async update(deviceId: string, body: Record<string, unknown>) {
    await delay(250);
    devices = devices.map((d) => (d.deviceId === deviceId ? { ...d, ...body } as DeviceRow : d));
    return { deviceId };
  },

  async regenerateCode(deviceId: string) {
    await delay(200);
    const registrationCode = code();
    devices = devices.map((d) => (d.deviceId === deviceId
      ? { ...d, registrationCode,
          codeExpiresAtUtc: new Date(Date.now() + 24 * 3600_000).toISOString() }
      : d));
    return { deviceId, registrationCode, expiresInHours: 24 };
  },

  /**
   * A command, with the delay a real one has.
   *
   * An instant mock would let the screen be built around a response that never
   * arrives that fast, and the waiting states would go untested until the
   * hardware was on a desk.
   */
  async runCommand(
    deviceId: string,
    commandType: CommandType,
    onProgress?: (progress: CommandProgress) => void,
  ): Promise<DeviceCommandResult> {
    const startedAt = Date.now();
    const device = devices.find((d) => d.deviceId === deviceId);

    onProgress?.({ phase: 'queued', elapsedMs: 0 });
    await delay(600);
    onProgress?.({ phase: 'waiting', elapsedMs: Date.now() - startedAt });

    const base = {
      commandId: `cmd_${Math.random().toString(36).slice(2, 10)}`,
      commandType,
      queuedAtUtc: new Date(startedAt).toISOString(),
    };

    /* An offline device answers nothing. The screen has to handle that, so the
       mock has to produce it. */
    if (!device || device.connectionStatus !== 'online') {
      await delay(1_800);
      onProgress?.({ phase: 'done', elapsedMs: Date.now() - startedAt });

      return {
        ...base, status: 'expired', succeeded: false,
        resultMessage: 'No response received.',
        resultData: null, roundTripMs: Date.now() - startedAt, completedAtUtc: null,
      };
    }

    await delay(1_400);
    onProgress?.({ phase: 'done', elapsedMs: Date.now() - startedAt });

    if (commandType === 'test_printer') {
      if (device.paperStatus === 'empty') {
        return {
          ...base, status: 'failed', succeeded: false,
          resultMessage: 'Paper not detected. Insert a roll and try again.',
          resultData: JSON.stringify({ printerStatus: 'ready', paperStatus: 'empty' }),
          roundTripMs: Date.now() - startedAt,
          completedAtUtc: new Date().toISOString(),
        };
      }

      if (device.printerStatus === 'error') {
        return {
          ...base, status: 'failed', succeeded: false,
          resultMessage: device.printerError ?? 'Printer error.',
          resultData: JSON.stringify({ printerStatus: 'error', paperStatus: 'unknown' }),
          roundTripMs: Date.now() - startedAt,
          completedAtUtc: new Date().toISOString(),
        };
      }

      return {
        ...base, status: 'succeeded', succeeded: true,
        resultMessage: 'Test receipt printed.',
        resultData: JSON.stringify({ printerStatus: 'ready', paperStatus: 'available' }),
        roundTripMs: Date.now() - startedAt,
        completedAtUtc: new Date().toISOString(),
      };
    }

    return {
      ...base, status: 'succeeded', succeeded: true,
      resultMessage: 'Device acknowledged the ping.',
      resultData: null, roundTripMs: Date.now() - startedAt,
      completedAtUtc: new Date().toISOString(),
    };
  },
};
