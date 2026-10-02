import {
  deviceApi,
  type CommandType,
  type DeviceCommandResult,
  type DeviceEvent,
  type DeviceRow,
} from './api/deviceApi';

/**
 * POS devices.
 *
 * The one thing worth understanding here: **the server cannot reach a
 * terminal.** A SUNMI on shop Wi-Fi sits behind NAT with no address to connect
 * to, so a command is queued and collected on the device's next heartbeat.
 *
 * That makes every command asynchronous in a way a normal API call is not.
 * `runCommand` hides the polling but not the waiting — the caller gets progress
 * updates, because a spinner that implies an open connection would misrepresent
 * what is happening. The device may genuinely be asleep.
 */

export interface CommandProgress {
  phase: 'queued' | 'waiting' | 'done';
  elapsedMs: number;
}

/** How long to keep asking before giving up on a device. */
const COMMAND_TIMEOUT_MS = 60_000;

/**
 * How often to ask.
 *
 * Fast at first, then slower. A responsive device answers within a couple of
 * seconds and the early polls catch it immediately; a dead one is not going to
 * improve, and hammering the server for a minute to learn that helps nobody.
 */
function pollDelay(elapsedMs: number): number {
  if (elapsedMs < 5_000) return 500;
  if (elapsedMs < 15_000) return 1_500;
  return 3_000;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const deviceService = {
  list(query: { branchId?: string; status?: string; deviceType?: string; search?: string } = {}) {
    return deviceApi.list(query);
  },

  get(deviceId: string): Promise<DeviceRow> {
    return deviceApi.get(deviceId);
  },

  events(deviceId: string, take = 50): Promise<DeviceEvent[]> {
    return deviceApi.events(deviceId, take);
  },

  create(body: Parameters<typeof deviceApi.create>[0]) {
    return deviceApi.create(body);
  },

  update(deviceId: string, body: Record<string, unknown>) {
    return deviceApi.update(deviceId, body);
  },

  regenerateCode(deviceId: string) {
    return deviceApi.regenerateCode(deviceId);
  },

  /**
   * Queue a command and wait for the device to answer it.
   *
   * Resolves with the result whichever way it went — succeeded, failed or
   * expired. It rejects only if the queuing itself failed, because "the device
   * did not answer" is an answer about the device, not an error in the app, and
   * the screen needs to show it as such.
   */
  async runCommand(
    deviceId: string,
    commandType: CommandType,
    onProgress?: (progress: CommandProgress) => void,
  ): Promise<DeviceCommandResult> {
    const startedAt = Date.now();
    const { commandId } = await deviceApi.queueCommand(deviceId, commandType);

    onProgress?.({ phase: 'queued', elapsedMs: 0 });

    for (;;) {
      const elapsedMs = Date.now() - startedAt;

      if (elapsedMs > COMMAND_TIMEOUT_MS) {
        /* Report it as expired rather than throwing. The command may still be
           collected later — this is us giving up watching, not the queue
           failing. */
        return {
          commandId,
          commandType,
          status: 'expired',
          succeeded: false,
          resultMessage: 'The device did not respond in time.',
          resultData: null,
          roundTripMs: elapsedMs,
          queuedAtUtc: new Date(startedAt).toISOString(),
          completedAtUtc: null,
        };
      }

      await sleep(pollDelay(elapsedMs));

      const result = await deviceApi.commandStatus(deviceId, commandId);

      if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'expired') {
        onProgress?.({ phase: 'done', elapsedMs: Date.now() - startedAt });
        return result;
      }

      onProgress?.({ phase: 'waiting', elapsedMs: Date.now() - startedAt });
    }
  },

  /** Make the terminal beep. The sound must come from the device, not the browser. */
  ping(deviceId: string, onProgress?: (progress: CommandProgress) => void) {
    return deviceService.runCommand(deviceId, 'ping', onProgress);
  },

  /** Read live printer and paper state, and print a test slip. */
  testPrinter(deviceId: string, onProgress?: (progress: CommandProgress) => void) {
    return deviceService.runCommand(deviceId, 'test_printer', onProgress);
  },

  refreshStatus(deviceId: string, onProgress?: (progress: CommandProgress) => void) {
    return deviceService.runCommand(deviceId, 'refresh_status', onProgress);
  },
};
