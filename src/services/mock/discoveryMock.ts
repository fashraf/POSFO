import type { DiscoveredDevice } from '../api/discoveryApi';
import type { VerificationOutcome, VerificationProgress } from '../discoveryService';

/**
 * Discovered terminals for development.
 *
 * Covers the three outcomes the modal must tell apart, because two of them are
 * easy to get wrong and neither can be staged on demand: one terminal that is
 * new, one already registered here, and one whose record exists but was never
 * completed. A list of three new devices would let the duplicate-prevention
 * path go untested.
 */

const secondsAgo = (n: number) => new Date(Date.now() - n * 1000).toISOString();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let announced: DiscoveredDevice[] = [
  {
    serialNumber: 'SN2026RYD0007', claimedDeviceId: null, deviceName: 'SUNMI V2',
    manufacturer: 'SUNMI', deviceModel: 'T5930', appVersion: '1.0.12',
    localIpAddress: '192.168.1.25', networkName: 'Riyadh-Main-WiFi',
    firstSeenAtUtc: secondsAgo(40), lastSeenAtUtc: secondsAgo(4), secondsSinceSeen: 4,
    matchedDeviceId: null, matchedDeviceName: null,
    matchedBranchId: null, matchedBranchNameEn: null,
    discoveryStatus: 'available',
  },
  {
    /* Already ours. The modal must offer to open it, never to duplicate it. */
    serialNumber: 'SN2026RYD0001', claimedDeviceId: 'POS-RYD-001', deviceName: 'SUNMI POS 01',
    manufacturer: 'SUNMI', deviceModel: 'T5930', appVersion: '1.0.12',
    localIpAddress: '192.168.1.22', networkName: 'Riyadh-Main-WiFi',
    firstSeenAtUtc: secondsAgo(300), lastSeenAtUtc: secondsAgo(6), secondsSinceSeen: 6,
    matchedDeviceId: 'POS-RYD-001', matchedDeviceName: 'SUNMI POS 01',
    matchedBranchId: 'brn_001', matchedBranchNameEn: 'Riyadh Main',
    discoveryStatus: 'already_registered',
  },
  {
    /* A record was created but the terminal never completed registration. */
    serialNumber: 'SN2026RYD0009', claimedDeviceId: null, deviceName: 'SUNMI V2',
    manufacturer: 'SUNMI', deviceModel: 'T5930', appVersion: '1.0.11',
    localIpAddress: '192.168.1.31', networkName: 'Riyadh-Main-WiFi',
    firstSeenAtUtc: secondsAgo(120), lastSeenAtUtc: secondsAgo(11), secondsSinceSeen: 11,
    matchedDeviceId: 'POS-RYD-003', matchedDeviceName: 'SUNMI POS 05',
    matchedBranchId: 'brn_001', matchedBranchNameEn: 'Riyadh Main',
    discoveryStatus: 'awaiting_registration',
  },
];

export const mockDiscoveryService = {
  async list(_withinSeconds = 120): Promise<DiscoveredDevice[]> {
    /* Long enough to exercise the waiting state. An instant answer would let
       the screen be built around a response that never arrives that fast. */
    await delay(1_600);
    return announced;
  },

  async verify(
    serialNumber: string,
    onProgress?: (progress: VerificationProgress) => void,
  ): Promise<VerificationOutcome> {
    const startedAt = Date.now();

    onProgress?.({ phase: 'issued', elapsedMs: 0 });
    await delay(900);
    onProgress?.({ phase: 'waiting', elapsedMs: Date.now() - startedAt });
    await delay(1_600);
    onProgress?.({ phase: 'done', elapsedMs: Date.now() - startedAt });

    /* A terminal that has registered before can prove itself; a new one cannot,
       and the screen has to handle both. */
    const known = announced.find(
      (d) => d.serialNumber === serialNumber && d.matchedDeviceId !== null,
    );

    if (known) return { verified: true, message: 'Identity confirmed.' };

    return {
      verified: false,
      reason: 'no_credential',
      message:
        'The terminal answered but has no stored credential, which is normal '
        + 'for a first registration. Confirm the serial number matches the '
        + 'terminal in front of you before continuing.',
    };
  },

  async connect(body: { serialNumber: string; deviceId: string; deviceName: string }) {
    await delay(700);

    announced = announced.map((d) =>
      d.serialNumber === body.serialNumber
        ? { ...d, discoveryStatus: 'awaiting_registration' as const,
            matchedDeviceId: body.deviceId, matchedDeviceName: body.deviceName }
        : d);

    return {
      success: true,
      deviceId: body.deviceId,
      registrationStatus: 'awaiting_device',
      note: 'The terminal will finish registering within a few seconds.',
    };
  },
};
