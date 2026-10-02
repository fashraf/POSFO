import { api } from '../apiClient';
import type { BillTemplate } from '@/types/company';

/**
 * Company, bill templates, branch settings, categories, print groups,
 * discounts and commission rules.
 *
 * Shapes are the server's DTOs as sent. Null fields are omitted from the JSON,
 * so every nullable one is optional here. Timestamps are UTC without a
 * trailing "Z"; dates are "YYYY-MM-DD".
 */

const enc = encodeURIComponent;

/*-------------------------------------------------------------------- company */

export interface ApiCompany {
  nameEn: string;
  nameAr: string;
  /** Whichever language the request asked for. */
  name: string;
  description: string;
  descriptionAr: string;
  descriptionEn: string;
  logoUrl?: string | null;
  crNumber: string;
  vatNumber: string;
  phone: string;
  email: string;
  website: string;
  address: { street: string; district: string; city: string; postalCode: string; country: string };
  social: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSaveCompany {
  nameEn: string;
  nameAr: string;
  description?: string | null;
  /** Null keeps what is stored; "" clears it. */
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  logoUrl?: string | null;
  crNumber?: string | null;
  vatNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: ApiCompany['address'] | null;
  social?: Record<string, string | null> | null;
}

export const companyApi = {
  get() {
    return api.get<ApiCompany>('/api/company');
  },

  save(payload: ApiSaveCompany) {
    return api.put<ApiCompany>('/api/company', payload);
  },
};

/*------------------------------------------------------------- bill templates */

/** Field for field the bill builder's own type; only nullables are optional. */
export type ApiBillTemplate = Omit<BillTemplate, 'printGroupId'> & { printGroupId?: string | null };

export type ApiSaveBillTemplate = Omit<BillTemplate, 'id' | 'createdAt' | 'updatedAt'>;

export const billTemplateApi = {
  list() {
    return api.get<ApiBillTemplate[]>('/api/bill-templates');
  },

  get(billId: string) {
    return api.get<ApiBillTemplate>(`/api/bill-templates/${enc(billId)}`);
  },

  /** Any signed-in user: the till resolves a layout at print time. */
  resolve(audience: 'customer' | 'group', printGroupId?: string | null) {
    return api.get<ApiBillTemplate>('/api/bill-templates/resolve', {
      query: { audience, printGroupId: printGroupId ?? undefined },
    });
  },

  create(payload: ApiSaveBillTemplate) {
    return api.post<ApiBillTemplate>('/api/bill-templates', payload);
  },

  update(billId: string, payload: ApiSaveBillTemplate) {
    return api.put<ApiBillTemplate>(`/api/bill-templates/${enc(billId)}`, payload);
  },

  remove(billId: string) {
    return api.delete<void>(`/api/bill-templates/${enc(billId)}`);
  },
};

/*------------------------------------------------------------ branch settings */

export interface ApiBranchSettings {
  branchId: string;
  /** False when the branch has no row yet and these are the defaults. */
  configured: boolean;
  defaultCustomerMode: 'walkin' | 'customer';
  servedBy: 'off' | 'optional' | 'required';
  allowNegativeStock: boolean;
  defaultBillTemplateId?: string | null;
  autoPrintCustomerBill: boolean;
  autoPrintGroupTickets: boolean;
  vatRatePercent: number;
  pricesIncludeVat: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export type ApiSaveBranchSettings = Omit<
  ApiBranchSettings,
  'branchId' | 'configured' | 'createdAt' | 'updatedAt' | 'updatedBy'
>;

export const branchSettingsApi = {
  get(branchId: string) {
    return api.get<ApiBranchSettings>(`/api/branches/${enc(branchId)}/settings`);
  },

  save(branchId: string, payload: ApiSaveBranchSettings) {
    return api.put<ApiBranchSettings>(`/api/branches/${enc(branchId)}/settings`, payload);
  },

  copy(targetBranchId: string, sourceBranchId: string) {
    return api.post<ApiBranchSettings>(`/api/branches/${enc(targetBranchId)}/settings/copy`, {
      sourceBranchId,
    });
  },
};

/*-------------------------------------------------- categories & print groups */

export interface ApiCategory {
  id: string;
  nameAr: string;
  nameEn: string;
  name: string;
  appliesTo: 'product' | 'service' | 'both';
  sortOrder: number;
  status: 'active' | 'inactive';
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSaveCategory {
  nameAr: string;
  nameEn: string;
  appliesTo?: 'product' | 'service' | 'both';
  sortOrder?: number | null;
  status?: 'active' | 'inactive';
}

export interface ApiPrintGroup {
  id: string;
  nameAr: string;
  nameEn: string;
  name: string;
  ticketTitle: string;
  sortOrder: number;
  status: 'active' | 'inactive';
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSavePrintGroup {
  nameAr: string;
  nameEn: string;
  ticketTitle?: string | null;
  sortOrder?: number | null;
  status?: 'active' | 'inactive';
}

export const categoryApi = {
  /** Active only unless asked: that is what the POS rail shows. */
  list(includeInactive = false) {
    return api.get<ApiCategory[]>('/api/catalog/categories', {
      query: { includeInactive: includeInactive || undefined },
    });
  },

  usage() {
    return api.get<Record<string, number>>('/api/catalog/categories/usage');
  },

  create(payload: ApiSaveCategory) {
    return api.post<ApiCategory>('/api/catalog/categories', payload);
  },

  update(categoryId: string, payload: ApiSaveCategory) {
    return api.put<ApiCategory>(`/api/catalog/categories/${enc(categoryId)}`, payload);
  },
};

export const printGroupApi = {
  list(includeInactive = false) {
    return api.get<ApiPrintGroup[]>('/api/catalog/print-groups', {
      query: { includeInactive: includeInactive || undefined },
    });
  },

  create(payload: ApiSavePrintGroup) {
    return api.post<ApiPrintGroup>('/api/catalog/print-groups', payload);
  },

  update(printGroupId: string, payload: ApiSavePrintGroup) {
    return api.put<ApiPrintGroup>(`/api/catalog/print-groups/${enc(printGroupId)}`, payload);
  },
};

/*------------------------------------------------------------------ discounts */

export interface ApiDiscount {
  id: string;
  nameAr: string;
  nameEn: string;
  name: string;
  description: string;
  type: 'percentage' | 'fixed';
  /** Basis points of a percent, or halalas. */
  value: number;
  maxAmountH: number;
  minOrderH: number;
  applicability: 'all' | 'products' | 'services' | 'selected';
  appliesToIds: string[];
  branchIds: string[];
  allowedRoleIds: string[];
  requiresApprovalAboveH: number;
  isAutomatic: boolean;
  allowStacking: boolean;
  /** 0 = Sunday. Empty means every day. */
  activeDays: number[];
  startsAt?: string | null;
  endsAt?: string | null;
  status: 'active' | 'inactive';
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSaveDiscount {
  nameAr: string;
  nameEn: string;
  description?: string | null;
  type: 'percentage' | 'fixed';
  value: number;
  maxAmountH: number;
  minOrderH: number;
  applicability?: ApiDiscount['applicability'];
  appliesToIds?: string[];
  branchIds?: string[];
  allowedRoleIds?: string[];
  requiresApprovalAboveH: number;
  isAutomatic: boolean;
  allowStacking: boolean;
  activeDays?: number[];
  startsAt?: string | null;
  endsAt?: string | null;
  status?: 'active' | 'inactive';
}

/** Writes and single reads. The list and the till's lookup are on discountApi. */
export const discountAdminApi = {
  get(discountId: string) {
    return api.get<ApiDiscount>(`/api/discounts/${enc(discountId)}`);
  },

  create(payload: ApiSaveDiscount) {
    return api.post<ApiDiscount>('/api/discounts', payload);
  },

  update(discountId: string, payload: ApiSaveDiscount) {
    return api.put<ApiDiscount>(`/api/discounts/${enc(discountId)}`, payload);
  },

  /** Only a discount never used on a sale; otherwise 409 discount_in_use. */
  remove(discountId: string) {
    return api.delete<void>(`/api/discounts/${enc(discountId)}`);
  },
};

/*----------------------------------------------------------- commission rules */

export interface ApiCommissionRule {
  id: string;
  userIds: string[];
  basis: 'percentage' | 'fixed';
  value: number;
  itemIds: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ApiSaveCommissionRule {
  userIds?: string[];
  basis: 'percentage' | 'fixed';
  value: number;
  itemIds?: string[];
  status?: 'active' | 'inactive';
}

export const commissionRuleApi = {
  list() {
    return api.get<ApiCommissionRule[]>('/api/finance/commission-rules');
  },

  get(ruleId: string) {
    return api.get<ApiCommissionRule>(`/api/finance/commission-rules/${enc(ruleId)}`);
  },

  create(payload: ApiSaveCommissionRule) {
    return api.post<ApiCommissionRule>('/api/finance/commission-rules', payload);
  },

  update(ruleId: string, payload: ApiSaveCommissionRule) {
    return api.put<ApiCommissionRule>(`/api/finance/commission-rules/${enc(ruleId)}`, payload);
  },

  remove(ruleId: string) {
    return api.delete<void>(`/api/finance/commission-rules/${enc(ruleId)}`);
  },
};
