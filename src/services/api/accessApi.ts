import { api } from '../apiClient';

/**
 * Users, roles and branches.
 *
 * Shapes are the server's DTOs as sent (Features/Access/UserEndpoints.cs and
 * Features/Settings/ReferenceEndpoints.cs). Null fields are omitted from the
 * JSON, so every nullable one is optional here. Timestamps are UTC without a
 * trailing "Z"; dates are "YYYY-MM-DD".
 */

export interface ApiUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  nameAr: string;
  nameEn: string;
  email: string;
  phone: string;
  address: string;
  employeeId: string;
  avatarUrl?: string | null;
  roleId: string;
  roleNameAr: string;
  roleNameEn: string;
  defaultBranchId?: string | null;
  branchIds: string[];
  /** "invited" is an active account that has never signed in. */
  status: 'active' | 'suspended' | 'expired' | 'invited';
  extraPermissions: string[];
  deniedPermissions: string[];
  lastActiveAt?: string | null;
  accessExpiresAt?: string | null;
  ticketReference?: string | null;
  isExternal: boolean;
  baseSalaryH: number;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSaveUser {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  nameAr: string;
  nameEn?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  employeeId?: string | null;
  roleId: string;
  defaultBranchId?: string | null;
  branchIds: string[];
  status?: 'active' | 'suspended' | 'invited';
  extraPermissions?: string[];
  deniedPermissions?: string[];
  accessExpiresAt?: string | null;
  ticketReference?: string | null;
  /** Null keeps the current salary; omitted on create is zero. */
  baseSalaryH?: number | null;
  /** Omitted on edit keeps the current password. */
  password?: string;
}

export interface ApiRole {
  id: string;
  kind: 'owner' | 'manager' | 'cashier' | 'accountant' | 'inventory_manager' | 'maintenance' | 'custom';
  nameAr: string;
  nameEn: string;
  name: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  description: string;
  permissions: string[];
  status: 'active' | 'inactive';
  builtIn: boolean;
  external: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSaveRole {
  nameAr: string;
  nameEn: string;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  permissions: string[];
  status?: 'active' | 'inactive';
  /** Read on create only. */
  external: boolean;
}

/** A branch the signed-in user works at. */
export interface ApiBranch {
  branchId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  phone?: string | null;
  isActive: boolean;
}

const enc = encodeURIComponent;

export const accessApi = {
  users(query: { search?: string; activeOnly?: boolean } = {}) {
    return api.get<ApiUser[]>('/api/users', { query });
  },

  user(userId: string) {
    return api.get<ApiUser>(`/api/users/${enc(userId)}`);
  },

  createUser(payload: ApiSaveUser) {
    return api.post<ApiUser>('/api/users', payload);
  },

  updateUser(userId: string, payload: ApiSaveUser) {
    return api.put<ApiUser>(`/api/users/${enc(userId)}`, payload);
  },

  setUserStatus(userId: string, status: 'active' | 'suspended') {
    return api.patch<ApiUser>(`/api/users/${enc(userId)}/status`, { status });
  },

  revokeAccess(userId: string) {
    return api.post<ApiUser>(`/api/users/${enc(userId)}/revoke-access`);
  },

  roles() {
    return api.get<{ roles: ApiRole[]; permissions: { roleId: string; permissionKey: string }[] }>(
      '/api/users/roles',
    );
  },

  role(roleId: string) {
    return api.get<ApiRole>(`/api/users/roles/${enc(roleId)}`);
  },

  roleUsage() {
    return api.get<Record<string, number>>('/api/users/roles/usage');
  },

  createRole(payload: ApiSaveRole) {
    return api.post<ApiRole>('/api/users/roles', payload);
  },

  updateRole(roleId: string, payload: ApiSaveRole) {
    return api.put<ApiRole>(`/api/users/roles/${enc(roleId)}`, payload);
  },

  deleteRole(roleId: string) {
    return api.delete<void>(`/api/users/roles/${enc(roleId)}`);
  },

  /** Only the branches the signed-in user works at. */
  /**
   * The branches the caller works at; with `all`, every active branch
   * (needs branches.view or users.view, else 403 branches_forbidden).
   */
  branches(options: { all?: boolean } = {}) {
    return api.get<ApiBranch[]>('/api/branches', {
      query: { all: options.all ? true : undefined },
    });
  },
};
