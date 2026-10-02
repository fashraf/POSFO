import { apiCatalogService, apiCategoryService, apiItemActivation } from './apiCatalogService';
import { userApi } from './api';
import { utc } from './mappers/time';
import type { ListQuery } from '@/types';
import type { CatalogFilters, StaffMember } from '@/types/catalog';

export type { CatalogSummary, CategoryInput } from './apiCatalogService';

/**
 * Catalog service.
 *
 * This is the contract the UI codes against, and every method resolves from
 * the API (see apiCatalogService.ts).
 */

export interface CatalogListQuery extends ListQuery {
  filters?: CatalogFilters & Record<string, string | number | boolean | undefined>;
}

export const catalogService = {
  ...apiCatalogService,
  /* Last, so activate and deactivate are the activation-route versions. */
  ...apiItemActivation,
};

export const categoryService = apiCategoryService;

/**
 * People who can be assigned as a service provider.
 *
 * Every user is staff — there is no separate staff table — so this is the user
 * list in the shape the catalog form expects.
 */
export const staffService = {
  async list(): Promise<StaffMember[]> {
    const rows = await userApi.list();

    return rows.map((row) => ({
      id: row.id,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      /* The role's name stands in for a job title, which users do not have. */
      role: row.roleNameEn || row.roleId,
      /* Invited is active and simply not signed in yet — still assignable. */
      status: row.status === 'active' || row.status === 'invited' ? 'active' : 'inactive',
      createdAt: utc(row.createdAt),
      updatedAt: utc(row.updatedAt),
    }));
  },
};

/** Someone working at a branch, as the till lists them. */
export interface BranchStaff {
  id: string;
  nameAr: string;
  nameEn: string;
  roleId: string;
  roleNameAr: string;
  roleNameEn: string;
}

/**
 * Active people at one branch — who can be credited with a sale or asked to
 * approve a discount. Needs only pos.create_sale, unlike the user list.
 */
export const branchStaffService = {
  async list(branchId?: string | null): Promise<BranchStaff[]> {
    const rows = await userApi.staff(branchId);
    return rows.map((row) => ({
      id: row.id,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      roleId: row.roleId,
      roleNameAr: row.roleNameAr ?? '',
      roleNameEn: row.roleNameEn ?? '',
    }));
  },
};
