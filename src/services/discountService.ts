import type {
  Discount,
  DiscountEligibility,
  DiscountInput,
  DiscountableLine,
} from '@/types/discounts';
import { evaluateDiscount } from '@/types/discounts';
import { HttpError } from './http';
import { SEED_DISCOUNTS } from './mock/seed';
import { compareBy, delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

let discounts: Discount[] = [...SEED_DISCOUNTS];

/** A discount plus why it is or is not offered on the current basket. */
export interface ResolvedDiscount {
  discount: Discount;
  eligibility: DiscountEligibility;
}

function validate(input: DiscountInput, currentId?: string): void {
  const errors: Record<string, string[]> = {};

  if (!input.nameAr.trim()) errors.nameAr = ['Arabic name is required.'];
  if (!input.nameEn.trim()) errors.nameEn = ['English name is required.'];

  if (
    discounts.some(
      (discount) =>
        discount.id !== currentId &&
        discount.nameEn.trim().toLowerCase() === input.nameEn.trim().toLowerCase(),
    )
  ) {
    errors.nameEn = ['Another discount already uses this name.'];
  }

  if (input.value <= 0) {
    errors.value = ['Enter a value above zero, or the discount does nothing.'];
  }

  /* A percentage over 100 would hand money back rather than discount a sale. */
  if (input.type === 'percentage' && input.value > 100 * 100) {
    errors.value = ['A percentage discount cannot exceed 100%.'];
  }

  if (input.maxAmountH < 0) errors.maxAmountH = ['A maximum cannot be negative.'];
  if (input.minOrderH < 0) errors.minOrderH = ['A minimum cannot be negative.'];

  if (input.type === 'fixed' && input.maxAmountH > 0 && input.maxAmountH < input.value) {
    errors.maxAmountH = [
      'The maximum is below the discount itself, so it would always be clipped. Raise it or remove it.',
    ];
  }

  if (input.applicability === 'selected' && input.appliesToIds.length === 0) {
    errors.appliesToIds = ['Choose at least one item or category, or switch to "All".'];
  }

  if (input.startsAt && input.endsAt) {
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
      errors.endsAt = ['The end date must be after the start date.'];
    }
  }

  if (Object.keys(errors).length > 0) throw validationFailed(errors);
}

export const discountService = {
  async list(): Promise<Discount[]> {
    await delay(180);
    return compareBy(discounts, 'nameEn', 'asc');
  },

  async get(id: string): Promise<Discount> {
    await delay(140);
    const discount = discounts.find((candidate) => candidate.id === id);
    if (!discount) throw notFound('Discount', id);
    return discount;
  },

  async create(input: DiscountInput): Promise<Discount> {
    await delay(360);
    validate(input);

    const now = timestamp();
    const created: Discount = {
      id: nextId('dsc'),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      description: input.description.trim(),
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
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    discounts = [created, ...discounts];
    return created;
  },

  async update(id: string, input: DiscountInput): Promise<Discount> {
    await delay(360);

    const existing = discounts.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Discount', id);

    validate(input, id);

    const updated: Discount = {
      ...existing,
      ...input,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      description: input.description.trim(),
      updatedAt: timestamp(),
    };

    discounts = discounts.map((discount) => (discount.id === id ? updated : discount));
    return updated;
  },

  /**
   * Deactivate rather than delete: a discount is referenced by every sale it
   * was applied to, so removing the row would orphan that history.
   */
  async setStatus(id: string, status: 'active' | 'inactive'): Promise<Discount> {
    await delay(280);

    const existing = discounts.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Discount', id);

    const updated: Discount = { ...existing, status, updatedAt: timestamp() };
    discounts = discounts.map((discount) => (discount.id === id ? updated : discount));
    return updated;
  },

  async remove(id: string): Promise<void> {
    await delay(280);

    const existing = discounts.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Discount', id);

    if (existing.usageCount > 0) {
      throw new HttpError({
        status: 409,
        code: 'discount_in_use',
        message:
          'This discount has been used on real sales. Deactivate it instead so the history stays intact.',
      });
    }

    discounts = discounts.filter((discount) => discount.id !== id);
  },

  /**
   * Every discount, each with whether it applies to this basket and what it
   * would take off. The POS shows ineligible ones greyed with the reason rather
   * than hiding them — a cashier needs to know a discount exists but needs
   * another 50 riyals on the basket.
   */
  async resolveForCart(context: {
    lines: DiscountableLine[];
    basketTotalH: number;
    roleId: string | null;
    branchId: string | null;
  }): Promise<ResolvedDiscount[]> {
    await delay(160);

    return discounts
      .filter((discount) => discount.status === 'active')
      .map((discount) => ({ discount, eligibility: evaluateDiscount(discount, context) }))
      .sort((a, b) => {
        if (a.eligibility.eligible !== b.eligibility.eligible) {
          return a.eligibility.eligible ? -1 : 1;
        }
        return b.eligibility.amountH - a.eligibility.amountH;
      });
  },

  /** Bump the usage counter once a sale actually completes. */
  async recordUsage(id: string): Promise<void> {
    const existing = discounts.find((candidate) => candidate.id === id);
    if (!existing) return;

    discounts = discounts.map((discount) =>
      discount.id === id
        ? { ...discount, usageCount: discount.usageCount + 1, updatedAt: timestamp() }
        : discount,
    );
  },
};

