import type { ID, Timestamped } from './common';

/** Which tab the checkout customer panel opens on. */
export type DefaultCustomerMode = 'walkin' | 'customer';

/** Whether the cashier must record who performed the work. */
export type ServedByRequirement = 'off' | 'optional' | 'required';

/**
 * Settings are per branch, not per business.
 *
 * A salon branch may need "served by" on every ticket for commission, while
 * the shop next door does not care. One global switch would force the stricter
 * rule on everyone.
 */
export interface BranchSettings extends Timestamped {
  branchId: ID;

  /* Checkout */
  defaultCustomerMode: DefaultCustomerMode;
  servedBy: ServedByRequirement;
  /** Let a cashier sell a tracked product that has run out. */
  allowNegativeStock: boolean;

  /* Receipts */
  defaultBillTemplateId: ID | null;
  autoPrintCustomerBill: boolean;
  autoPrintGroupTickets: boolean;

  /* Money */
  vatRatePercent: number;
  /** Prices as entered already include VAT. Saudi retail convention. */
  pricesIncludeVat: boolean;
}

export const DEFAULT_BRANCH_SETTINGS: Omit<
  BranchSettings,
  'branchId' | 'createdAt' | 'updatedAt'
> = {
  defaultCustomerMode: 'walkin',
  servedBy: 'optional',
  allowNegativeStock: false,
  defaultBillTemplateId: null,
  autoPrintCustomerBill: true,
  autoPrintGroupTickets: true,
  vatRatePercent: 15,
  pricesIncludeVat: true,
};
