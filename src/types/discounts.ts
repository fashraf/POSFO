import type { ID, Timestamped } from './common';

export type DiscountType = 'percentage' | 'fixed';

export type DiscountApplicability = 'all' | 'products' | 'services' | 'selected';

/**
 * A configured discount.
 *
 * The point of configuring these is that a cashier chooses from a list rather
 * than typing a number. Every restriction below exists so the owner decides the
 * ceiling once, instead of trusting each person at the till to remember it.
 */
export interface Discount extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  description: string;
  type: DiscountType;
  /** Percentage: basis points of a percent (1000 = 10%). Fixed: halalas. */
  value: number;
  /**
   * Ceiling on the resulting amount in halalas. Zero means no cap.
   * Only meaningful for a percentage — a 10% discount on a large basket can
   * otherwise run away.
   */
  maxAmountH: number;
  /** Basket must reach this before the discount is offered, in halalas. */
  minOrderH: number;
  applicability: DiscountApplicability;
  /** Item or category ids when applicability is `selected`. */
  appliesToIds: ID[];
  /** Branch ids this discount runs in. Empty means everywhere. */
  branchIds: ID[];
  /** Roles allowed to apply it. Empty means anyone at the till. */
  allowedRoleIds: ID[];
  /** Above this, a manager has to approve. Zero means never. */
  requiresApprovalAboveH: number;
  /**
   * Automatic discounts apply themselves the moment they qualify — a National
   * Day promotion should not depend on a cashier remembering it exists.
   * Manual ones stay in the dropdown for the cashier to choose.
   */
  isAutomatic: boolean;
  /**
   * Whether this may sit alongside another discount. Default is no: one
   * discount per order unless the owner deliberately allows stacking.
   */
  allowStacking: boolean;
  /** Days of the week it runs, 0 = Sunday. Empty means every day. */
  activeDays: number[];
  startsAt: string | null;
  endsAt: string | null;
  status: 'active' | 'inactive';
  /** How many times it has been applied. Read-only. */
  usageCount: number;
}

export interface DiscountInput {
  nameAr: string;
  nameEn: string;
  description: string;
  type: DiscountType;
  value: number;
  maxAmountH: number;
  minOrderH: number;
  applicability: DiscountApplicability;
  appliesToIds: ID[];
  branchIds: ID[];
  allowedRoleIds: ID[];
  requiresApprovalAboveH: number;
  isAutomatic: boolean;
  allowStacking: boolean;
  activeDays: number[];
  startsAt: string | null;
  endsAt: string | null;
  status: 'active' | 'inactive';
}

/** Percentage values are stored as basis points of a percent to stay integer. */
export const PERCENT_SCALE = 100;

export function percentToStored(percent: number): number {
  return Math.round(percent * PERCENT_SCALE);
}

export function storedToPercent(value: number): number {
  return value / PERCENT_SCALE;
}

/** Why a discount is not offered. Shown to the cashier rather than hidden. */
export type IneligibilityReason =
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'below_minimum'
  | 'wrong_branch'
  | 'role_not_allowed'
  | 'nothing_applicable'
  | 'wrong_day';

export interface DiscountEligibility {
  eligible: boolean;
  reason: IneligibilityReason | null;
  /** The amount it would take off, in halalas. Zero when not eligible. */
  amountH: number;
  /** True when the amount exceeds the approval threshold. */
  requiresApproval: boolean;
  /** True when `maxAmountH` clipped the result. Worth telling the cashier. */
  capped: boolean;
}

/** A basket line, reduced to what a discount needs to know about it. */
export interface DiscountableLine {
  itemId: ID;
  categoryId: ID | null;
  kind: 'product' | 'service';
  /** VAT-inclusive line total after any line discount, in halalas. */
  grossH: number;
}

/** The portion of a basket a discount actually applies to. */
export function applicableBaseH(discount: Discount, lines: DiscountableLine[]): number {
  return lines
    .filter((line) => {
      switch (discount.applicability) {
        case 'all':
          return true;
        case 'products':
          return line.kind === 'product';
        case 'services':
          return line.kind === 'service';
        case 'selected':
          return (
            discount.appliesToIds.includes(line.itemId) ||
            (line.categoryId !== null && discount.appliesToIds.includes(line.categoryId))
          );
        default:
          return false;
      }
    })
    .reduce((sum, line) => sum + line.grossH, 0);
}

/**
 * Work out whether a discount can be used on this basket, and what it takes off.
 *
 * Returns a reason rather than just a boolean, because a cashier facing a
 * greyed-out option needs to know whether to add another item or call a manager.
 */
export function evaluateDiscount(
  discount: Discount,
  context: {
    lines: DiscountableLine[];
    basketTotalH: number;
    roleId: ID | null;
    branchId: ID | null;
    now?: Date;
  },
): DiscountEligibility {
  const now = context.now ?? new Date();
  const nope = (reason: IneligibilityReason): DiscountEligibility => ({
    eligible: false,
    reason,
    amountH: 0,
    requiresApproval: false,
    capped: false,
  });

  if (discount.status !== 'active') return nope('inactive');

  if (discount.startsAt && new Date(discount.startsAt).getTime() > now.getTime()) {
    return nope('not_started');
  }
  if (discount.endsAt && new Date(discount.endsAt).getTime() < now.getTime()) {
    return nope('expired');
  }

  if (
    discount.branchIds.length > 0 &&
    context.branchId &&
    !discount.branchIds.includes(context.branchId)
  ) {
    return nope('wrong_branch');
  }

  if (
    discount.allowedRoleIds.length > 0 &&
    context.roleId &&
    !discount.allowedRoleIds.includes(context.roleId)
  ) {
    return nope('role_not_allowed');
  }

  /* A weekend promotion should not fire on a Tuesday. */
  if (discount.activeDays.length > 0 && !discount.activeDays.includes(now.getDay())) {
    return nope('wrong_day');
  }

  if (discount.minOrderH > 0 && context.basketTotalH < discount.minOrderH) {
    return nope('below_minimum');
  }

  const baseH = applicableBaseH(discount, context.lines);
  if (baseH <= 0) return nope('nothing_applicable');

  const rawH =
    discount.type === 'percentage'
      ? Math.round((baseH * discount.value) / (100 * PERCENT_SCALE))
      : discount.value;

  /* Never take off more than the part it applies to — a fixed 20.00 discount on
     an 8.00 basket must not produce a negative total. */
  const clampedH = Math.min(rawH, baseH);
  const cappedH =
    discount.maxAmountH > 0 ? Math.min(clampedH, discount.maxAmountH) : clampedH;

  return {
    eligible: true,
    reason: null,
    amountH: cappedH,
    requiresApproval:
      discount.requiresApprovalAboveH > 0 && cappedH > discount.requiresApprovalAboveH,
    capped: cappedH < clampedH,
  };
}

/** Formatted value for a list row: "10%" or "SAR 20.00". */
export function discountValueLabel(discount: Discount): string {
  return discount.type === 'percentage'
    ? `${storedToPercent(discount.value)}%`
    : (discount.value / 100).toFixed(2);
}

export type ApprovalState = 'not_required' | 'pending' | 'approved' | 'rejected';

export interface DiscountApproval {
  state: ApprovalState;
  approverName: string | null;
  reason: string;
  requestedAt: string | null;
  decidedAt: string | null;
}

export const NO_APPROVAL: DiscountApproval = {
  state: 'not_required',
  approverName: null,
  reason: '',
  requestedAt: null,
  decidedAt: null,
};

/**
 * Pick what applies to a basket without the cashier choosing.
 *
 * Automatic discounts that qualify are applied on the spot. Where several
 * qualify and none allows stacking, the largest wins — the customer gets the
 * better deal, which is the only defensible default.
 */
export function resolveAutomatic(
  candidates: { discount: Discount; eligibility: DiscountEligibility }[],
): { discount: Discount; eligibility: DiscountEligibility } | null {
  const automatic = candidates.filter(
    (entry) => entry.discount.isAutomatic && entry.eligibility.eligible,
  );
  if (automatic.length === 0) return null;

  return automatic.reduce((best, entry) =>
    entry.eligibility.amountH > best.eligibility.amountH ? entry : best,
  );
}
