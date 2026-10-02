import type {
  Discount,
  DiscountEligibility,
  DiscountInput,
  DiscountableLine,
} from '@/types/discounts';
import { evaluateDiscount } from '@/types/discounts';
import { activationApi, discountAdminApi, discountApi, type ApiDiscount } from './api';
import { invalidate } from './dataVersion';
import { day, utc } from './mappers/time';

/** A discount plus why it is or is not offered on the current basket. */
export interface ResolvedDiscount {
  discount: Discount;
  eligibility: DiscountEligibility;
}

function toDiscount(row: ApiDiscount): Discount {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    description: row.description,
    type: row.type,
    value: row.value,
    maxAmountH: row.maxAmountH,
    minOrderH: row.minOrderH,
    applicability: row.applicability,
    appliesToIds: row.appliesToIds,
    branchIds: row.branchIds,
    allowedRoleIds: row.allowedRoleIds,
    requiresApprovalAboveH: row.requiresApprovalAboveH,
    isAutomatic: row.isAutomatic,
    allowStacking: row.allowStacking,
    activeDays: row.activeDays,
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    status: row.status,
    usageCount: row.usageCount,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

function toPayload(input: DiscountInput) {
  return {
    nameAr: input.nameAr.trim(),
    nameEn: input.nameEn.trim(),
    description: input.description.trim() || null,
    type: input.type,
    value: input.value,
    maxAmountH: input.maxAmountH,
    minOrderH: input.minOrderH,
    applicability: input.applicability,
    appliesToIds: input.appliesToIds,
    branchIds: input.branchIds,
    allowedRoleIds: input.allowedRoleIds,
    requiresApprovalAboveH: input.requiresApprovalAboveH,
    isAutomatic: input.isAutomatic,
    allowStacking: input.allowStacking,
    activeDays: input.activeDays,
    /* Calendar days. */
    startsAt: day(input.startsAt),
    endsAt: day(input.endsAt),
    status: input.status,
  };
}

export const discountService = {
  async list(): Promise<Discount[]> {
    const rows = await discountApi.list();
    return rows.map(toDiscount);
  },

  async get(id: string): Promise<Discount> {
    return toDiscount(await discountAdminApi.get(id));
  },

  async create(input: DiscountInput): Promise<Discount> {
    const created = await discountAdminApi.create(toPayload(input));
    invalidate('discounts');
    return toDiscount(created);
  },

  async update(id: string, input: DiscountInput): Promise<Discount> {
    const updated = await discountAdminApi.update(id, toPayload(input));
    invalidate('discounts');
    return toDiscount(updated);
  },

  /**
   * Deactivate rather than delete: a discount is referenced by every sale it
   * was applied to, so removing the row would orphan that history.
   */
  async setStatus(id: string, status: 'active' | 'inactive'): Promise<Discount> {
    await activationApi.set('discount', id, status === 'active');
    invalidate('discounts');
    return discountService.get(id);
  },

  /** Only a discount never used; a used one is refused with 409 discount_in_use. */
  async remove(id: string): Promise<void> {
    await discountAdminApi.remove(id);
    invalidate('discounts');
  },

  /**
   * What the till may offer on this basket, each with whether it applies and
   * what it would take off.
   *
   * The server decides what is live here and now — status, dates, weekday,
   * the basket's minimum, the branch and the cashier's role — and lists only
   * those. What needs the basket's lines (which items or categories a
   * discount covers, and so its amount and cap) is worked out here, and a
   * discount covering nothing in the basket is shown greyed with the reason.
   */
  async resolveForCart(context: {
    lines: DiscountableLine[];
    basketTotalH: number;
    roleId: string | null;
    branchId: string | null;
  }): Promise<ResolvedDiscount[]> {
    const rows = await discountApi.applicable(
      Math.max(0, Math.round(context.basketTotalH)),
      context.branchId,
    );

    return rows
      .map(toDiscount)
      .map((discount) => ({
        discount,
        /* Only the line rules: the scopes the server already applied are
           cleared, so a browser clock or time zone cannot disagree with it
           (a discount ending today would otherwise read as expired). */
        eligibility: evaluateDiscount(
          {
            ...discount,
            startsAt: null,
            endsAt: null,
            activeDays: [],
            branchIds: [],
            allowedRoleIds: [],
            minOrderH: 0,
          },
          context,
        ),
      }))
      .sort((a, b) => {
        if (a.eligibility.eligible !== b.eligibility.eligible) {
          return a.eligibility.eligible ? -1 : 1;
        }
        return b.eligibility.amountH - a.eligibility.amountH;
      });
  },
};
