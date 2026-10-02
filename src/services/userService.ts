import { HttpError } from './http';
import type {
  Branch,
  PermissionKey,
  Role,
  RoleInput,
  User,
  UserInput,
} from '@/types/permissions';
import { accessApi, type ApiBranch, type ApiRole, type ApiSaveUser, type ApiUser } from './api';
import { invalidate } from './dataVersion';
import { day, remapFieldErrors, utc, utcOrNull } from './mappers/time';

/**
 * Users, roles and branches, from the API.
 *
 * The server enforces every rule the screens care about — the last owner,
 * external accounts kept away from financial and personal data, a caller
 * unable to grant more than they hold — and says which field is wrong. This
 * layer renames fields and nothing more.
 */

export function toBranch(row: ApiBranch): Branch {
  return {
    id: row.branchId,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    code: row.code,
    /* The branch route does not return a city. */
    city: '',
    phone: row.phone ?? '',
    status: row.isActive ? 'active' : 'inactive',
    /* Nor timestamps: a branch row here is a lookup, not a record. */
    createdAt: '',
    updatedAt: '',
  };
}

export function toRole(row: ApiRole): Role {
  return {
    id: row.id,
    kind: row.kind,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    /* The form has one description box; the server picks the language. */
    description: row.description,
    permissions: row.permissions as PermissionKey[],
    status: row.status,
    builtIn: row.builtIn,
    external: row.external,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

export function toUser(row: ApiUser): User {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    username: row.username,
    email: row.email,
    phone: row.phone,
    address: row.address,
    employeeId: row.employeeId,
    avatarUrl: row.avatarUrl ?? null,
    roleId: row.roleId,
    defaultBranchId: row.defaultBranchId ?? null,
    branchIds: row.branchIds,
    /* The screen has no "expired" state of its own: an account past its end
       date is suspended as far as anyone signing in is concerned, which is
       also what effectiveStatus derives from accessExpiresAt. */
    status: row.status === 'expired' ? 'suspended' : row.status,
    extraPermissions: row.extraPermissions as PermissionKey[],
    deniedPermissions: row.deniedPermissions as PermissionKey[],
    lastActiveAt: utcOrNull(row.lastActiveAt),
    /* A calendar day, "YYYY-MM-DD". */
    accessExpiresAt: row.accessExpiresAt ?? null,
    ticketReference: row.ticketReference ?? null,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  };
}

function toSaveUser(input: UserInput): ApiSaveUser {
  const blank = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

  return {
    username: input.username.trim().toLowerCase(),
    firstName: blank(input.firstName),
    lastName: blank(input.lastName),
    nameAr: input.nameAr.trim(),
    /* Blank lets the server build it from first and last name. */
    nameEn: blank(input.nameEn),
    email: blank(input.email),
    phone: blank(input.phone),
    address: blank(input.address),
    employeeId: blank(input.employeeId),
    roleId: input.roleId,
    defaultBranchId: input.defaultBranchId,
    branchIds: input.branchIds,
    status: input.status,
    extraPermissions: input.extraPermissions,
    deniedPermissions: input.deniedPermissions,
    accessExpiresAt: day(input.accessExpiresAt),
    ticketReference: blank(input.ticketReference),
    /* Omitted rather than empty: on edit that keeps the current password. */
    ...(input.password ? { password: input.password } : {}),
  };
}

/*
 * The user form shows the English name as first + last, and every permission
 * override under one list — so the server's keys for those land there too.
 */
const USER_FIELD_MAP = { nameEn: 'firstName', deniedPermissions: 'extraPermissions' };

export const branchService = {
  /** The branches the signed-in user works at — the server filters them. */
  async list(): Promise<Branch[]> {
    const rows = await accessApi.branches();
    return rows.map(toBranch);
  },

  /**
   * Every active branch, for forms that assign people or rules to branches.
   * Falls back to the caller's own branches when they may not list them all.
   */
  async listAll(): Promise<Branch[]> {
    try {
      return (await accessApi.branches({ all: true })).map(toBranch);
    } catch (caught) {
      if (caught instanceof HttpError && caught.status === 403) return branchService.list();
      throw caught;
    }
  },
};

export const roleService = {
  async list(): Promise<Role[]> {
    const { roles } = await accessApi.roles();
    return roles.map(toRole);
  },

  async get(id: string): Promise<Role> {
    return toRole(await accessApi.role(id));
  },

  async create(input: RoleInput): Promise<Role> {
    const created = await accessApi.createRole({
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      description: input.description.trim() || null,
      permissions: input.permissions,
      status: input.status,
      external: input.external,
    });
    invalidate('roles');
    return toRole(created);
  },

  /** Built-in roles keep their names server-side; only permissions change. */
  async update(id: string, input: RoleInput): Promise<Role> {
    const updated = await accessApi.updateRole(id, {
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      description: input.description.trim() || null,
      permissions: input.permissions,
      status: input.status,
      external: input.external,
    });
    invalidate('roles');
    return toRole(updated);
  },

  /** Refused with 409 for a built-in role or one still assigned. */
  async remove(id: string): Promise<void> {
    await accessApi.deleteRole(id);
    invalidate('roles');
  },

  /** How many users hold each role — drives the count column and the warning. */
  async usage(): Promise<Record<string, number>> {
    return accessApi.roleUsage();
  },
};

export const userService = {
  async list(): Promise<User[]> {
    const rows = await accessApi.users();
    return rows.map(toUser);
  },

  async get(id: string): Promise<User> {
    return toUser(await accessApi.user(id));
  },

  async create(input: UserInput): Promise<User> {
    const created = await accessApi
      .createUser(toSaveUser(input))
      .catch((caught: unknown) => remapFieldErrors(caught, USER_FIELD_MAP));
    invalidate('users');
    return toUser(created);
  },

  async update(id: string, input: UserInput): Promise<User> {
    const updated = await accessApi
      .updateUser(id, toSaveUser(input))
      .catch((caught: unknown) => remapFieldErrors(caught, USER_FIELD_MAP));
    invalidate('users');
    return toUser(updated);
  },

  /**
   * Suspend rather than delete, so the audit trail keeps its actor. The server
   * also ends the account's sessions.
   */
  async setStatus(id: string, status: User['status']): Promise<User> {
    const updated = await accessApi.setUserStatus(id, status === 'suspended' ? 'suspended' : 'active');
    invalidate('users');
    return toUser(updated);
  },

  /** Ends an external account's window immediately, ahead of its expiry. */
  async revokeAccess(id: string): Promise<User> {
    const updated = await accessApi.revokeAccess(id);
    invalidate('users');
    return toUser(updated);
  },
};
