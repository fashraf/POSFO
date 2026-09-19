import { api } from '../apiClient';

/**
 * Finding a terminal without typing its address.
 *
 * There is no network scan. The server cannot see a shop's Wi-Fi, so an
 * unregistered terminal announces itself and this reads what has arrived
 * recently. The window is how far back to look, not how long to search.
 */

export type DiscoveryStatus = 'available' | 'already_registered' | 'awaiting_registration';

export interface DiscoveredDevice {
  serialNumber: string;
  claimedDeviceId: string | null;
  deviceName: string | null;
  manufacturer: string | null;
  deviceModel: string | null;
  appVersion: string | null;
  localIpAddress: string | null;
  networkName: string | null;
  firstSeenAtUtc: string;
  lastSeenAtUtc: string;
  secondsSinceSeen: number;

  /* Present only when this serial already matches a record. */
  matchedDeviceId: string | null;
  matchedDeviceName: string | null;
  matchedBranchId: string | null;
  matchedBranchNameEn: string | null;

  discoveryStatus: DiscoveryStatus;
}

export interface ChallengeState {
  challengeId: string;
  serialNumber: string;
  verified: boolean | null;
  answeredAtUtc: string | null;
  expiresAtUtc: string;
  status: 'waiting' | 'answered' | 'expired';
}

export const discoveryApi = {
  /** Terminals that have announced within the window. */
  list(withinSeconds = 120) {
    return api.get<DiscoveredDevice[]>('/api/devices/discovery', {
      query: { withinSeconds },
    });
  },

  /** Ask a terminal to prove it is what it claims. */
  challenge(serialNumber: string) {
    return api.post<{ challengeId: string; status: string; expiresInSeconds: number }>(
      '/api/devices/discovery/challenge', { serialNumber });
  },

  challengeStatus(challengeId: string) {
    return api.get<ChallengeState>(`/api/devices/discovery/challenge/${challengeId}`);
  },

  /** Create the record. Refused unless the proof is recent. */
  connect(body: {
    serialNumber: string; deviceId: string; branchId: string;
    location?: string | null; deviceName: string;
  }) {
    return api.post<{
      success: boolean; deviceId: string;
      registrationStatus: string; note: string;
    }>('/api/devices/discovery/connect', body);
  },
};
