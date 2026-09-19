import type {
  Branch,
  PermissionKey,
  Role,
  RoleInput,
  User,
  UserInput,
} from '@/types/permissions';
import { EXTERNAL_FORBIDDEN } from '@/types/permissions';
import { HttpError } from './http';
import { SEED_BRANCHES, SEED_ROLES, SEED_USERS } from './mock/seed';
import { compareBy, delay, nextId, notFound, timestamp, validationFailed } from './mock/store';

let roles: Role[] = [...SEED_ROLES];
let users: User[] = [...SEED_USERS];
const branches: Branch[] = [...SEED_BRANCHES];

const roleById = (id: string) => roles.find((role) => role.id === id);

/**
 * External accounts belong to the maintenance vendor, not the business, so they
 * are refused anything exposing money or personal data. Enforced here because a
 * check in the form is a hint, not a rule.
 */
function rejectForbiddenExternal(permissions: PermissionKey[], external: boolean): void {
  if (!external) return;

  const offending = permissions.filter((key) => EXTERNAL_FORBIDDEN.includes(key));
  if (offending.length > 0) {
    throw new HttpError({
      status: 422,
      code: 'external_permission_forbidden',
      message:
        'A maintenance account cannot be given access to financial or customer data. Remove those permissions first.',
      fieldErrors: { permissions: offending },
    });
  }
}

export const branchService = {
  async list(): Promise<Branch[]> {
    await delay(120);
    return compareBy(branches, 'nameEn', 'asc');
  },
};

export const roleService = {
  async list(): Promise<Role[]> {
    await delay(160);
    return compareBy(roles, 'nameEn', 'asc');
  },

  async get(id: string): Promise<Role> {
    await delay(120);
    const role = roleById(id);
    if (!role) throw notFound('Role', id);
    return role;
  },

  async create(input: RoleInput): Promise<Role> {
    await delay(340);

    const errors: Record<string, string[]> = {};
    if (!input.nameAr.trim()) errors.nameAr = ['Arabic name is required.'];
    if (!input.nameEn.trim()) errors.nameEn = ['English name is required.'];
    if (input.permissions.length === 0) {
      errors.permissions = ['Give the role at least one permission, or nobody can use it.'];
    }
    if (roles.some((role) => role.nameEn.trim().toLowerCase() === input.nameEn.trim().toLowerCase())) {
      errors.nameEn = ['Another role already uses this name.'];
    }
    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    rejectForbiddenExternal(input.permissions, input.external);

    const now = timestamp();
    const created: Role = {
      id: nextId('rol'),
      kind: 'custom',
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      description: input.description.trim(),
      permissions: input.permissions,
      status: input.status,
      builtIn: false,
      external: input.external,
      createdAt: now,
      updatedAt: now,
    };

    roles = [...roles, created];
    return created;
  },

  async update(id: string, input: RoleInput): Promise<Role> {
    await delay(340);

    const existing = roleById(id);
    if (!existing) throw notFound('Role', id);

    /* The owner role is deliberately immutable: an owner who can lock
       themselves out of user administration has no way back in. */
    if (existing.kind === 'owner') {
      throw new HttpError({
        status: 409,
        code: 'owner_role_immutable',
        message: 'The owner role always holds every permission and cannot be edited.',
      });
    }

    if (input.permissions.length === 0) {
      throw validationFailed({
        permissions: ['Give the role at least one permission, or nobody can use it.'],
      });
    }

    rejectForbiddenExternal(input.permissions, existing.external);

    const updated: Role = {
      ...existing,
      /* Built-in roles keep their names; only permissions are tunable. */
      nameAr: existing.builtIn ? existing.nameAr : input.nameAr.trim(),
      nameEn: existing.builtIn ? existing.nameEn : input.nameEn.trim(),
      description: input.description.trim(),
      permissions: input.permissions,
      status: input.status,
      updatedAt: timestamp(),
    };

    roles = roles.map((role) => (role.id === id ? updated : role));
    return updated;
  },

  async remove(id: string): Promise<void> {
    await delay(280);

    const existing = roleById(id);
    if (!existing) throw notFound('Role', id);

    if (existing.builtIn) {
      throw new HttpError({
        status: 409,
        code: 'builtin_role',
        message: 'Built-in roles cannot be deleted.',
      });
    }

    const assigned = users.filter((user) => user.roleId === id).length;
    if (assigned > 0) {
      throw new HttpError({
        status: 409,
        code: 'role_in_use',
        message: `${assigned} user(s) still hold this role. Move them to another role first.`,
      });
    }

    roles = roles.filter((role) => role.id !== id);
  },

  /** How many users hold each role — drives the count column and the warning. */
  async usage(): Promise<Record<string, number>> {
    await delay(100);
    return users.reduce<Record<string, number>>((counts, user) => {
      counts[user.roleId] = (counts[user.roleId] ?? 0) + 1;
      return counts;
    }, {});
  },
};

function validateUser(input: UserInput, currentId?: string): void {
  const errors: Record<string, string[]> = {};

  if (!input.firstName.trim()) errors.firstName = ['First name is required.'];
  if (!input.lastName.trim()) errors.lastName = ['Last name is required.'];
  if (!input.nameAr.trim()) errors.nameAr = ['Arabic name is required.'];

  const username = input.username.trim().toLowerCase();
  if (!username) {
    errors.username = ['A username is required to sign in.'];
  } else if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    errors.username = ['At least 3 characters: letters, numbers, dot, dash, or underscore.'];
  } else if (users.some((user) => user.username.toLowerCase() === username && user.id !== currentId)) {
    errors.username = ['Another user already has this username.'];
  }

  const email = input.email.trim().toLowerCase();
  if (!email) {
    errors.email = ['Email is required.'];
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = ['Enter a valid email address.'];
  } else if (users.some((user) => user.email.toLowerCase() === email && user.id !== currentId)) {
    errors.email = ['Another user already uses this email.'];
  }

  /* Password is required on create only; blank on edit keeps the current one. */
  if (!currentId) {
    if (!input.password) {
      errors.password = ['Set a password so this person can sign in.'];
    } else if (input.password.length < 8) {
      errors.password = ['Use at least 8 characters.'];
    }
  } else if (input.password && input.password.length < 8) {
    errors.password = ['Use at least 8 characters, or leave it blank to keep the current one.'];
  }

  const role = roleById(input.roleId);
  if (!role) {
    errors.roleId = ['Choose a role.'];
  } else if (role.external) {
    if (!input.accessExpiresAt) {
      errors.accessExpiresAt = ['A maintenance account needs an end date.'];
    }
    if (!input.ticketReference?.trim()) {
      errors.ticketReference = ['Record the ticket that justifies this access.'];
    }
    if (input.extraPermissions.some((key) => EXTERNAL_FORBIDDEN.includes(key))) {
      errors.extraPermissions = [
        'A maintenance account cannot hold financial or customer permissions.',
      ];
    }
  }

  if (input.branchIds.length === 0) {
    errors.branchIds = ['Assign at least one branch.'];
  } else if (input.defaultBranchId && !input.branchIds.includes(input.defaultBranchId)) {
    errors.defaultBranchId = ['The default branch must be one of the assigned branches.'];
  }

  if (Object.keys(errors).length > 0) throw validationFailed(errors);
}

export const userService = {
  async list(): Promise<User[]> {
    await delay(200);
    return compareBy(users, 'nameEn', 'asc');
  },

  async get(id: string): Promise<User> {
    await delay(140);
    const user = users.find((candidate) => candidate.id === id);
    if (!user) throw notFound('User', id);
    return user;
  },

  /** The signed-in user. Stands in for a real session until auth exists. */
  async current(): Promise<User> {
    await delay(80);
    return users[0];
  },

  async create(input: UserInput): Promise<User> {
    await delay(380);
    validateUser(input);

    const now = timestamp();
    const created: User = {
      id: nextId('usr'),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim() || `${input.firstName} ${input.lastName}`.trim(),
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      employeeId: input.employeeId.trim(),
      avatarUrl: null,
      roleId: input.roleId,
      defaultBranchId: input.defaultBranchId,
      branchIds: input.branchIds,
      status: 'invited',
      extraPermissions: input.extraPermissions,
      deniedPermissions: input.deniedPermissions,
      lastActiveAt: null,
      accessExpiresAt: input.accessExpiresAt,
      ticketReference: input.ticketReference,
      createdAt: now,
      updatedAt: now,
    };

    users = [created, ...users];
    return created;
  },

  async update(id: string, input: UserInput): Promise<User> {
    await delay(380);

    const existing = users.find((user) => user.id === id);
    if (!existing) throw notFound('User', id);

    validateUser(input, id);

    /* The last active owner must stay an owner, or nobody can administer the
       business and the only route back is a support call. */
    const ownerRole = roles.find((role) => role.kind === 'owner');
    if (ownerRole && existing.roleId === ownerRole.id && input.roleId !== ownerRole.id) {
      const remaining = users.filter(
        (user) => user.roleId === ownerRole.id && user.id !== id && user.status === 'active',
      ).length;

      if (remaining === 0) {
        throw new HttpError({
          status: 409,
          code: 'last_owner',
          message: 'This is the only owner. Promote another user before changing this role.',
        });
      }
    }

    const updated: User = {
      ...existing,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      employeeId: input.employeeId.trim(),
      roleId: input.roleId,
      defaultBranchId: input.defaultBranchId,
      branchIds: input.branchIds,
      status: input.status,
      extraPermissions: input.extraPermissions,
      deniedPermissions: input.deniedPermissions,
      accessExpiresAt: input.accessExpiresAt,
      ticketReference: input.ticketReference,
      updatedAt: timestamp(),
    };

    users = users.map((user) => (user.id === id ? updated : user));
    return updated;
  },

  /** Suspend rather than delete, so the audit trail keeps its actor. */
  async setStatus(id: string, status: User['status']): Promise<User> {
    await delay(260);

    const existing = users.find((user) => user.id === id);
    if (!existing) throw notFound('User', id);

    const ownerRole = roles.find((role) => role.kind === 'owner');
    if (ownerRole && existing.roleId === ownerRole.id && status !== 'active') {
      const remaining = users.filter(
        (user) => user.roleId === ownerRole.id && user.id !== id && user.status === 'active',
      ).length;

      if (remaining === 0) {
        throw new HttpError({
          status: 409,
          code: 'last_owner',
          message: 'This is the only active owner. Promote another user before suspending them.',
        });
      }
    }

    const updated: User = { ...existing, status, updatedAt: timestamp() };
    users = users.map((user) => (user.id === id ? updated : user));
    return updated;
  },

  /** Ends an external account's window immediately, ahead of its expiry. */
  async revokeAccess(id: string): Promise<User> {
    await delay(260);

    const existing = users.find((user) => user.id === id);
    if (!existing) throw notFound('User', id);

    const now = timestamp();
    const updated: User = {
      ...existing,
      status: 'suspended',
      accessExpiresAt: now,
      updatedAt: now,
    };

    users = users.map((user) => (user.id === id ? updated : user));
    return updated;
  },
};
