import type { BranchSettings } from '@/types/settings';
import { branchSettingsApi, type ApiBranchSettings } from './api';
import { invalidate } from './dataVersion';
import { utc } from './mappers/time';

/**
 * Branch settings.
 *
 * Keyed by branch so switching branches switches the rules with it. A branch
 * that has never been configured comes back with the server's defaults rather
 * than an error — a new branch should work on day one.
 */

function toSettings(row: ApiBranchSettings): BranchSettings {
  return {
    branchId: row.branchId,
    defaultCustomerMode: row.defaultCustomerMode,
    servedBy: row.servedBy,
    allowNegativeStock: row.allowNegativeStock,
    defaultBillTemplateId: row.defaultBillTemplateId ?? null,
    autoPrintCustomerBill: row.autoPrintCustomerBill,
    autoPrintGroupTickets: row.autoPrintGroupTickets,
    vatRatePercent: row.vatRatePercent,
    pricesIncludeVat: row.pricesIncludeVat,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

export const settingsService = {
  async get(branchId: string): Promise<BranchSettings> {
    return toSettings(await branchSettingsApi.get(branchId));
  },

  async update(
    branchId: string,
    input: Omit<BranchSettings, 'branchId' | 'createdAt' | 'updatedAt'>,
  ): Promise<BranchSettings> {
    /* Field by field: the page spreads its whole state in here, and anything
       extra it carries is not the server's business. */
    const saved = await branchSettingsApi.save(branchId, {
      defaultCustomerMode: input.defaultCustomerMode,
      servedBy: input.servedBy,
      allowNegativeStock: input.allowNegativeStock,
      defaultBillTemplateId: input.defaultBillTemplateId,
      autoPrintCustomerBill: input.autoPrintCustomerBill,
      autoPrintGroupTickets: input.autoPrintGroupTickets,
      vatRatePercent: input.vatRatePercent,
      pricesIncludeVat: input.pricesIncludeVat,
    });
    invalidate('settings');
    return toSettings(saved);
  },

  /**
   * Copy one branch's configuration onto another. Refused (409
   * source_not_configured) when the source has never been saved.
   */
  async copyFrom(sourceBranchId: string, targetBranchId: string): Promise<BranchSettings> {
    const copied = await branchSettingsApi.copy(targetBranchId, sourceBranchId);
    invalidate('settings');
    return toSettings(copied);
  },
};
