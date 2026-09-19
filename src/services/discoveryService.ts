import { USE_MOCKS } from '@/config/env';
import {
  discoveryApi,
  type DiscoveredDevice,
} from './api/discoveryApi';
import { mockDiscoveryService } from './mock/discoveryMock';
import { invalidate } from './dataVersion';

/**
 * Discovery, behind one contract.
 *
 * The UI never learns how a terminal was found. Today it is announcement-based,
 * because the server cannot see a customer's network; if that ever becomes a
 * local agent or mDNS, only this file changes.
 *
 * One thing the UI does need to know: **there is no scan.** The server is
 * reading announcements that have already arrived, so the honest indicator is
 * elapsed time and a count, never a progress bar implying a search with an end.
 */

export interface VerificationProgress {
  phase: 'issued' | 'waiting' | 'done';
  elapsedMs: number;
}

export interface VerificationOutcome {
  verified: boolean;
  /**
   * Why, when it failed.
   *
   * `no_credential` is not a failure of the exchange — a terminal registering
   * for the first time shares no secret with this server and has nothing to
   * sign with. The screen needs to say that differently from "it did not
   * answer", because the next step differs.
   */
  reason?: 'no_answer' | 'no_credential' | 'expired' | 'mismatch';
  message: string;
}

const VERIFY_TIMEOUT_MS = 30_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const discoveryService = {
  /**
   * Terminals seen recently.
   *
   * Called on demand only. Nothing polls in the background — a modal left open
   * should not keep a tablet awake.
   */
  list(withinSeconds = 120): Promise<DiscoveredDevice[]> {
    return USE_MOCKS ? mockDiscoveryService.list(withinSeconds) : discoveryApi.list(withinSeconds);
  },

  /**
   * Ask a terminal to prove its identity, and wait for the answer.
   *
   * The terminal collects the challenge on its next announcement, so this takes
   * a few seconds rather than being instant.
   */
  async verify(
    serialNumber: string,
    onProgress?: (progress: VerificationProgress) => void,
  ): Promise<VerificationOutcome> {
    if (USE_MOCKS) return mockDiscoveryService.verify(serialNumber, onProgress);

    const startedAt = Date.now();
    const { challengeId } = await discoveryApi.challenge(serialNumber);

    onProgress?.({ phase: 'issued', elapsedMs: 0 });

    for (;;) {
      const elapsedMs = Date.now() - startedAt;

      if (elapsedMs > VERIFY_TIMEOUT_MS) {
        return {
          verified: false,
          reason: 'no_answer',
          message: 'The terminal did not answer. Check the POS app is running and connected.',
        };
      }

      await sleep(elapsedMs < 6_000 ? 700 : 2_000);

      const state = await discoveryApi.challengeStatus(challengeId);

      if (state.status === 'expired') {
        return { verified: false, reason: 'expired', message: 'The verification expired.' };
      }

      if (state.status === 'answered') {
        onProgress?.({ phase: 'done', elapsedMs: Date.now() - startedAt });

        if (state.verified) {
          return { verified: true, message: 'Identity confirmed.' };
        }

        /* Answered, but could not prove anything. Almost always a terminal
           registering for the first time. */
        return {
          verified: false,
          reason: 'no_credential',
          message:
            'The terminal answered but has no stored credential, which is normal '
            + 'for a first registration. Confirm the serial number matches the '
            + 'terminal in front of you before continuing.',
        };
      }

      onProgress?.({ phase: 'waiting', elapsedMs: Date.now() - startedAt });
    }
  },

  /** Create the record. The terminal finishes registering on its next announcement. */
  async connect(body: {
    serialNumber: string; deviceId: string; branchId: string;
    location?: string | null; deviceName: string;
  }) {
    const result = USE_MOCKS
      ? await mockDiscoveryService.connect(body)
      : await discoveryApi.connect(body);

    invalidate('devices');
    return result;
  },
};
