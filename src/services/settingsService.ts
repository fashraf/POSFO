import type { BranchSettings } from '@/types/settings';
import { DEFAULT_BRANCH_SETTINGS } from '@/types/settings';
import { delay, timestamp, validationFailed } from './mock/store';

/**
 * Branch settings.
 *
 * Keyed by branch so switching branches switches the rules with it. A branch
 * that has never been configured falls back to the defaults rather than
 * erroring — a new branch should work on day one.
 */
let settings: Record<string, BranchSettings> = {};

function ensure(branchId: string): BranchSettings {
  if (!settings[branchId]) {
    const now = timestamp();
    settings[branchId] = {
      ...DEFAULT_BRANCH_SETTINGS,
      branchId,
      createdAt: now,
      updatedAt: now,
    };
  }
  return settings[branchId];
}

export const settingsService = {
  async get(branchId: string): Promise<BranchSettings> {
    await delay(120);
    return ensure(branchId);
  },

  async update(
    branchId: string,
    input: Omit<BranchSettings, 'branchId' | 'createdAt' | 'updatedAt'>,
  ): Promise<BranchSettings> {
    await delay(320);

    const errors: Record<string, string[]> = {};
    if (input.vatRatePercent < 0 || input.vatRatePercent > 100) {
      errors.vatRatePercent = ['Enter a VAT rate between 0 and 100.'];
    }
    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    const existing = ensure(branchId);
    const updated: BranchSettings = { ...existing, ...input, updatedAt: timestamp() };
    settings = { ...settings, [branchId]: updated };
    return updated;
  },

  /** Copy one branch's configuration onto another. */
  async copyFrom(sourceBranchId: string, targetBranchId: string): Promise<BranchSettings> {
    await delay(280);

    const source = ensure(sourceBranchId);
    const target = ensure(targetBranchId);

    const updated: BranchSettings = {
      ...source,
      branchId: targetBranchId,
      createdAt: target.createdAt,
      updatedAt: timestamp(),
    };

    settings = { ...settings, [targetBranchId]: updated };
    return updated;
  },
};
