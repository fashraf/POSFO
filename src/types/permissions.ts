import type { ID, Timestamped } from './common';

/**
 * Permissions use structured `module.action` identifiers.
 *
 * The module half is not decoration: it decides which menu entry a permission
 * unlocks, drives the "select all" control on the matrix, and lets the menu be
 * derived from permissions rather than maintained as a second list that drifts.
 */
export type PermissionModule =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'products'
  | 'inventory'
  | 'vendors'
  | 'customers'
  | 'branches'
  | 'discounts'
  | 'users'
  | 'roles'
  | 'company'
  | 'bill_builder'
  | 'finance'
  | 'reports'
  | 'settings'
  | 'audit'
  | 'devices';

export type PermissionKey =
  | 'dashboard.view'
  | 'pos.view'
  | 'pos.create_sale'
  | 'pos.apply_discount'
  | 'pos.override_price'
  | 'pos.void_sale'
  | 'pos.return_sale'
  | 'sales.view'
  | 'sales.view_details'
  | 'sales.return'
  | 'sales.void'
  | 'sales.reprint'
  | 'products.view'
  | 'products.create'
  | 'products.edit'
  | 'products.delete'
  | 'inventory.view'
  | 'inventory.adjust'
  | 'inventory.stocktake'
  | 'inventory.purchase_entry'
  | 'vendors.view'
  | 'vendors.create'
  | 'vendors.edit'
  | 'vendors.delete'
  | 'customers.view'
  | 'customers.create'
  | 'customers.edit'
  | 'customers.delete'
  | 'branches.view'
  | 'branches.create'
  | 'branches.edit'
  | 'discounts.view'
  | 'discounts.create'
  | 'discounts.edit'
  | 'discounts.delete'
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.disable'
  | 'roles.view'
  | 'roles.create'
  | 'roles.edit'
  | 'roles.delete'
  | 'company.view'
  | 'company.edit'
  | 'bill_builder.view'
  | 'bill_builder.edit'
  | 'finance.view'
  | 'finance.expenses'
  | 'finance.ledger'
  | 'finance.reverse'
  | 'reports.view'
  | 'reports.export'
  | 'devices.view'
  | 'devices.manage'
  | 'devices.command'
  | 'audit.view'
  | 'audit.performance'
  | 'settings.view'
  | 'settings.edit';

/** Data a permission exposes. Used to keep external accounts away from it. */
export type Sensitivity = 'financial' | 'personal' | null;

/** The verb half of a permission key. Matches the `actions.*` dictionary. */
export type PermissionAction =
  | 'view'
  | 'manage'
  | 'command'
  | 'performance'
  | 'view_details'
  | 'create'
  | 'edit'
  | 'delete'
  | 'disable'
  | 'export'
  | 'create_sale'
  | 'apply_discount'
  | 'override_price'
  | 'void_sale'
  | 'return_sale'
  | 'return'
  | 'void'
  | 'reprint'
  | 'adjust'
  | 'stocktake'
  | 'purchase_entry'
  | 'expenses'
  | 'ledger'
  | 'reverse';

export interface PermissionDefinition {
  key: PermissionKey;
  module: PermissionModule;
  /** The verb half, used as the checkbox label. */
  action: PermissionAction;
  sensitivity: Sensitivity;
}

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'dashboard.view', module: 'dashboard', action: 'view', sensitivity: 'financial' },

  { key: 'pos.view', module: 'pos', action: 'view', sensitivity: null },
  { key: 'pos.create_sale', module: 'pos', action: 'create_sale', sensitivity: 'financial' },
  { key: 'pos.apply_discount', module: 'pos', action: 'apply_discount', sensitivity: 'financial' },
  { key: 'pos.override_price', module: 'pos', action: 'override_price', sensitivity: 'financial' },
  { key: 'pos.void_sale', module: 'pos', action: 'void_sale', sensitivity: 'financial' },
  { key: 'pos.return_sale', module: 'pos', action: 'return_sale', sensitivity: 'financial' },

  { key: 'sales.view', module: 'sales', action: 'view', sensitivity: 'financial' },
  { key: 'sales.view_details', module: 'sales', action: 'view_details', sensitivity: 'financial' },
  { key: 'sales.return', module: 'sales', action: 'return', sensitivity: 'financial' },
  { key: 'sales.void', module: 'sales', action: 'void', sensitivity: 'financial' },
  { key: 'sales.reprint', module: 'sales', action: 'reprint', sensitivity: null },

  { key: 'products.view', module: 'products', action: 'view', sensitivity: null },
  { key: 'products.create', module: 'products', action: 'create', sensitivity: null },
  { key: 'products.edit', module: 'products', action: 'edit', sensitivity: null },
  { key: 'products.delete', module: 'products', action: 'delete', sensitivity: null },

  { key: 'inventory.view', module: 'inventory', action: 'view', sensitivity: null },
  { key: 'inventory.adjust', module: 'inventory', action: 'adjust', sensitivity: null },
  { key: 'inventory.stocktake', module: 'inventory', action: 'stocktake', sensitivity: null },
  {
    key: 'inventory.purchase_entry',
    module: 'inventory',
    action: 'purchase_entry',
    sensitivity: 'financial',
  },

  { key: 'vendors.view', module: 'vendors', action: 'view', sensitivity: null },
  { key: 'vendors.create', module: 'vendors', action: 'create', sensitivity: null },
  { key: 'vendors.edit', module: 'vendors', action: 'edit', sensitivity: null },
  { key: 'vendors.delete', module: 'vendors', action: 'delete', sensitivity: null },

  { key: 'customers.view', module: 'customers', action: 'view', sensitivity: 'personal' },
  { key: 'customers.create', module: 'customers', action: 'create', sensitivity: 'personal' },
  { key: 'customers.edit', module: 'customers', action: 'edit', sensitivity: 'personal' },
  { key: 'customers.delete', module: 'customers', action: 'delete', sensitivity: 'personal' },

  { key: 'branches.view', module: 'branches', action: 'view', sensitivity: null },
  { key: 'branches.create', module: 'branches', action: 'create', sensitivity: null },
  { key: 'branches.edit', module: 'branches', action: 'edit', sensitivity: null },

  { key: 'discounts.view', module: 'discounts', action: 'view', sensitivity: null },
  { key: 'discounts.create', module: 'discounts', action: 'create', sensitivity: 'financial' },
  { key: 'discounts.edit', module: 'discounts', action: 'edit', sensitivity: 'financial' },
  { key: 'discounts.delete', module: 'discounts', action: 'delete', sensitivity: 'financial' },

  { key: 'users.view', module: 'users', action: 'view', sensitivity: null },
  { key: 'users.create', module: 'users', action: 'create', sensitivity: null },
  { key: 'users.edit', module: 'users', action: 'edit', sensitivity: null },
  { key: 'users.disable', module: 'users', action: 'disable', sensitivity: null },

  { key: 'roles.view', module: 'roles', action: 'view', sensitivity: null },
  { key: 'roles.create', module: 'roles', action: 'create', sensitivity: null },
  { key: 'roles.edit', module: 'roles', action: 'edit', sensitivity: null },
  { key: 'roles.delete', module: 'roles', action: 'delete', sensitivity: null },

  { key: 'company.view', module: 'company', action: 'view', sensitivity: null },
  { key: 'company.edit', module: 'company', action: 'edit', sensitivity: null },

  { key: 'bill_builder.view', module: 'bill_builder', action: 'view', sensitivity: null },
  { key: 'bill_builder.edit', module: 'bill_builder', action: 'edit', sensitivity: null },

  { key: 'finance.view', module: 'finance', action: 'view', sensitivity: 'financial' },
  { key: 'finance.expenses', module: 'finance', action: 'expenses', sensitivity: 'financial' },
  { key: 'finance.ledger', module: 'finance', action: 'ledger', sensitivity: 'financial' },
  { key: 'finance.reverse', module: 'finance', action: 'reverse', sensitivity: 'financial' },

  { key: 'reports.view', module: 'reports', action: 'view', sensitivity: 'financial' },
  { key: 'reports.export', module: 'reports', action: 'export', sensitivity: 'financial' },

  /* Mirrors migration 19. The trail records who did what, which is staff
     conduct, so it is marked personal; timings are not. */
  { key: 'devices.view', module: 'devices', action: 'view', sensitivity: null },
  { key: 'devices.manage', module: 'devices', action: 'manage', sensitivity: null },
  { key: 'devices.command', module: 'devices', action: 'command', sensitivity: null },
  { key: 'audit.view', module: 'audit', action: 'view', sensitivity: 'personal' },
  { key: 'audit.performance', module: 'audit', action: 'performance', sensitivity: null },
  { key: 'settings.view', module: 'settings', action: 'view', sensitivity: null },
  { key: 'settings.edit', module: 'settings', action: 'edit', sensitivity: null },
];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSIONS.map((permission) => permission.key);

/** Display order for the matrix and the menu preview. */
export const MODULE_ORDER: PermissionModule[] = [
  'dashboard',
  'pos',
  'sales',
  'products',
  'inventory',
  'vendors',
  'customers',
  'branches',
  'discounts',
  'users',
  'roles',
  'company',
  'bill_builder',
  'finance',
  'reports',
  'settings',
];

export function permissionsFor(module: PermissionModule): PermissionDefinition[] {
  return PERMISSIONS.filter((permission) => permission.module === module);
}

/** Permissions an external maintenance account may never hold. */
export const EXTERNAL_FORBIDDEN: PermissionKey[] = PERMISSIONS.filter(
  (permission) => permission.sensitivity !== null,
).map((permission) => permission.key);

/**
 * A module appears in the menu when its `view` permission is held.
 *
 * This is the whole reason permissions are structured rather than free-form:
 * the menu is derived, so it cannot drift out of step with what someone can
 * actually do.
 */
export function visibleModules(permissions: PermissionKey[]): PermissionModule[] {
  const held = new Set(permissions);
  return MODULE_ORDER.filter((module) => held.has(`${module}.view` as PermissionKey));
}

export function hasPermission(permissions: PermissionKey[], key: PermissionKey): boolean {
  return permissions.includes(key);
}

export function hasAny(permissions: PermissionKey[], keys: PermissionKey[]): boolean {
  return keys.some((key) => permissions.includes(key));
}

/* ------------------------------------------------------------------ */
/* Roles and users                                                     */
/* ------------------------------------------------------------------ */

export type RoleKind =
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'accountant'
  | 'inventory_manager'
  | 'maintenance'
  | 'custom';

export interface Role extends Timestamped {
  id: ID;
  kind: RoleKind;
  nameAr: string;
  nameEn: string;
  description: string;
  permissions: PermissionKey[];
  status: 'active' | 'inactive';
  /** Built-in roles cannot be renamed or deleted. Owner cannot be edited at all. */
  builtIn: boolean;
  /** An account belonging to the maintenance vendor rather than the business. */
  external: boolean;
}

export type UserStatus = 'active' | 'suspended' | 'invited';

export interface User extends Timestamped {
  id: ID;
  firstName: string;
  lastName: string;
  nameAr: string;
  nameEn: string;
  username: string;
  email: string;
  phone: string;
  address: string;
  employeeId: string;
  avatarUrl: string | null;
  roleId: ID;
  /** Branch the user lands in at sign-in. */
  defaultBranchId: ID | null;
  /** Every branch the user may switch to. Always includes the default. */
  branchIds: ID[];
  status: UserStatus;
  /** Granted on top of the role. */
  extraPermissions: PermissionKey[];
  /** Removed from the role. Denial always beats a grant. */
  deniedPermissions: PermissionKey[];
  lastActiveAt: string | null;
  accessExpiresAt: string | null;
  ticketReference: string | null;
}

export interface RoleInput {
  nameAr: string;
  nameEn: string;
  description: string;
  permissions: PermissionKey[];
  status: 'active' | 'inactive';
  external: boolean;
}

export interface UserInput {
  firstName: string;
  lastName: string;
  nameAr: string;
  nameEn: string;
  username: string;
  email: string;
  phone: string;
  address: string;
  employeeId: string;
  roleId: ID;
  defaultBranchId: ID | null;
  branchIds: ID[];
  status: UserStatus;
  extraPermissions: PermissionKey[];
  deniedPermissions: PermissionKey[];
  accessExpiresAt: string | null;
  ticketReference: string | null;
  /** Only sent on create, or when an admin resets it. */
  password?: string;
}

/** Where a permission came from, so the UI can show it honestly. */
export type PermissionOrigin = 'inherited' | 'granted' | 'denied' | 'none';

export function originOf(
  key: PermissionKey,
  role: Role | undefined,
  user: Pick<User, 'extraPermissions' | 'deniedPermissions'>,
): PermissionOrigin {
  if (user.deniedPermissions.includes(key)) return 'denied';
  if (user.extraPermissions.includes(key)) return 'granted';
  if (role?.permissions.includes(key)) return 'inherited';
  return 'none';
}

/**
 * What a user can actually do: the role's permissions, plus explicit grants,
 * minus explicit denials. Denial wins, so revoking one action from a role does
 * not require cloning the whole role.
 */
export function effectivePermissions(
  user: Pick<User, 'extraPermissions' | 'deniedPermissions'>,
  role: Role | undefined,
): PermissionKey[] {
  if (!role) return [];
  const granted = new Set([...role.permissions, ...user.extraPermissions]);
  for (const denied of user.deniedPermissions) granted.delete(denied);
  return ALL_PERMISSIONS.filter((key) => granted.has(key));
}

export function isAccessExpired(user: Pick<User, 'accessExpiresAt'>, now = new Date()): boolean {
  if (!user.accessExpiresAt) return false;
  return new Date(user.accessExpiresAt).getTime() <= now.getTime();
}

export function effectiveStatus(
  user: Pick<User, 'accessExpiresAt' | 'status'>,
  now?: Date,
): UserStatus {
  return isAccessExpired(user, now) ? 'suspended' : user.status;
}

export interface Branch extends Timestamped {
  id: ID;
  nameAr: string;
  nameEn: string;
  code: string;
  city: string;
  phone: string;
  status: 'active' | 'inactive';
}
