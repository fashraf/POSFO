import { api } from '../apiClient';

/** POS device registry, heartbeats and commands. */

export type ConnectionStatus = 'online' | 'offline' | 'unknown' | 'unregistered';
export type PrinterStatus = 'ready' | 'error' | 'unavailable' | 'unknown';
export type PaperStatus = 'available' | 'low' | 'empty' | 'unknown';
export type CommandType =
  | 'ping' | 'test_printer' | 'refresh_status' | 'print_test_receipt' | 'get_info';

export interface DeviceRow {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  deviceModel: string | null;
  serialNumber: string | null;
  branchId: string;
  branchNameAr: string;
  branchNameEn: string;
  location: string | null;
  description: string | null;
  paperWidth: number;
  printerKind: string;

  /* Three separate statuses, never combined. A device can be online with an
     empty printer, and a single indicator would hide exactly that. */
  connectionStatus: ConnectionStatus;
  printerStatus: PrinterStatus;
  paperStatus: PaperStatus;

  lastHeartbeatAtUtc: string | null;
  secondsSinceHeartbeat: number | null;
  printerError: string | null;
  batteryPercent: number | null;
  networkType: string | null;
  appVersion: string | null;

  registeredAtUtc: string | null;
  registrationCode: string | null;
  codeExpiresAtUtc: string | null;
  isRegistered: boolean;
  isActive: boolean;
  pendingCommands: number;
}

export interface DeviceCommandResult {
  commandId: string;
  commandType: CommandType;
  status: 'pending' | 'sent' | 'succeeded' | 'failed' | 'expired';
  succeeded: boolean | null;
  resultMessage: string | null;
  resultData: string | null;
  roundTripMs: number | null;
  queuedAtUtc: string;
  completedAtUtc: string | null;
}

export interface DeviceEvent {
  eventId: number;
  eventType: string;
  severity: 'info' | 'warning' | 'error';
  messageEn: string;
  messageAr: string;
  occurredAtUtc: string;
}

export const deviceApi = {
  list(query: { branchId?: string; status?: string; deviceType?: string; search?: string } = {}) {
    return api.get<DeviceRow[]>('/api/devices', { query });
  },

  get(deviceId: string) {
    return api.get<DeviceRow>(`/api/devices/${deviceId}`);
  },

  events(deviceId: string, take = 50) {
    return api.get<DeviceEvent[]>(`/api/devices/${deviceId}/events`, { query: { take } });
  },

  create(body: {
    deviceId: string; deviceName: string; deviceType?: string; deviceModel?: string | null;
    branchId: string; location?: string | null; description?: string | null;
    paperWidth?: number; printerKind?: string; isActive?: boolean;
  }) {
    return api.post<{ deviceId: string; registrationCode: string; expiresInHours: number }>(
      '/api/devices', body);
  },

  update(deviceId: string, body: Record<string, unknown>) {
    return api.patch<{ deviceId: string }>(`/api/devices/${deviceId}`, body);
  },

  regenerateCode(deviceId: string) {
    return api.post<{ deviceId: string; registrationCode: string; expiresInHours: number }>(
      `/api/devices/${deviceId}/code`);
  },

  /** Queues a command. It is not done when this resolves — only accepted. */
  queueCommand(deviceId: string, commandType: CommandType, payload?: string) {
    return api.post<{ commandId: string; status: string }>(
      `/api/devices/${deviceId}/commands`, { commandType, payload: payload ?? null });
  },

  commandStatus(deviceId: string, commandId: string) {
    return api.get<DeviceCommandResult>(`/api/devices/${deviceId}/commands/${commandId}`);
  },
};
