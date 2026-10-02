import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { AuthSession } from '@/features/auth/types/auth.types';
import { branchService, roleService, safeCall } from '@/services';
import { accessApi } from '@/services/api';
import { setActiveBranchForStock } from '@/services/apiCatalogService';
import { toUser } from '@/services/userService';
import { hasAny, hasPermission } from '@/types/permissions';
import type { Branch, PermissionKey, Role, RoleKind, User } from '@/types/permissions';

/**
 * The signed-in user, their role, and what they can actually do.
 *
 * Every permission check in the application reads from here, so there is one
 * answer to "can they?" rather than a scattering of ad-hoc conditions.
 */
interface SessionContextValue {
  user: User | null;
  role: Role | null;
  branches: Branch[];
  activeBranch: Branch | null;
  setActiveBranch: (branchId: string) => void;
  /**
   * True when the person is looking at the whole business rather than one
   * branch. Kept separate from `activeBranch` being null, which would be
   * ambiguous with "no branch assigned yet".
   */
  viewingAllBranches: boolean;
  setViewingAllBranches: (all: boolean) => void;
  /** The id to pass to services: null means every branch. */
  scopeBranchId: string | null;
  permissions: PermissionKey[];
  can: (key: PermissionKey) => boolean;
  canAny: (keys: PermissionKey[]) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/*
 * The server is the authority on what a signed-in user may do.
 *
 * Permissions always come from the session — the token's list, which is the
 * role plus this user's overrides as the server resolved them — never from a
 * role list read here. A cashier can read neither the user nor the role
 * routes, so both have a fallback built from the same session.
 */

/** The account as the sign-in response describes it. */
function userFromSession(session: AuthSession): User {
  const branchIds = session.branchIds ?? [];

  return {
    id: session.userId,
    /* The session carries one display name and no split or Arabic form. */
    firstName: session.displayName,
    lastName: '',
    nameAr: session.displayName,
    nameEn: session.displayName,
    username: session.email,
    email: session.email,
    phone: session.mobile,
    address: '',
    employeeId: '',
    avatarUrl: null,
    roleId: session.roleId,
    defaultBranchId: branchIds[0] ?? null,
    branchIds,
    status: 'active',
    /* The token's list already includes overrides, so nothing on top. */
    extraPermissions: [],
    deniedPermissions: [],
    lastActiveAt: null,
    accessExpiresAt: null,
    ticketReference: null,
    createdAt: session.issuedAt,
    updatedAt: session.issuedAt,
  };
}

/* The server's own mapping from built-in role id to kind (UserEndpoints.KindOf). */
const BUILT_IN_KINDS: Record<string, RoleKind> = {
  rol_owner: 'owner',
  rol_manager: 'manager',
  rol_cashier: 'cashier',
  rol_accountant: 'accountant',
  rol_inventory: 'inventory_manager',
  rol_maintenance: 'maintenance',
};

/**
 * The least that can honestly be said about a role the caller cannot read:
 * its id, and its name if the user record carried one. Nothing else is known,
 * so nothing else is claimed.
 */
function minimalRole(
  session: AuthSession,
  names: { nameAr: string; nameEn: string } | null,
): Role {
  return {
    id: session.roleId,
    kind: BUILT_IN_KINDS[session.roleId] ?? 'custom',
    nameAr: names?.nameAr || session.roleId,
    nameEn: names?.nameEn || session.roleId,
    description: '',
    permissions: [],
    status: 'active',
    builtIn: session.roleId in BUILT_IN_KINDS,
    external: false,
    createdAt: session.issuedAt,
    updatedAt: session.issuedAt,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  /*
   * Tell the stock services which branch is active.
   *
   * Stock is physical and belongs to a branch, but the service signatures the
   * screens use have no room for one. This keeps a module-level copy in step with the session instead, so a delivery
   * or an adjustment knows where it happened without every caller passing it.
   *
   * Without this the branch is null and every stock write is refused.
   */
  useEffect(() => {
    setActiveBranchForStock(activeBranchId);
  }, [activeBranchId]);
  const [viewingAllBranches, setViewingAllBranches] = useState(false);
  const [loading, setLoading] = useState(true);

  const { session } = useAuth();

  /* The token's grants, as the server issued them. */
  const permissions = useMemo(
    () => (session?.permissions ?? []) as PermissionKey[],
    [session],
  );

  const load = useCallback(async () => {
    if (!session) {
      setUser(null);
      setRole(null);
      setBranches([]);
      setActiveBranchId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const held = new Set(session.permissions ?? []);

    const [userResult, roleResult, branchResult] = await Promise.all([
      held.has('users.view') ? safeCall(() => accessApi.user(session.userId)) : null,
      held.has('roles.view') ? safeCall(() => roleService.get(session.roleId)) : null,
      /* Only the branches this user works at — the server filters them. */
      safeCall(() => branchService.list()),
    ]);

    const loadedBranches = branchResult.ok ? branchResult.data : [];
    setBranches(loadedBranches);

    const row = userResult?.ok ? userResult.data : null;
    const fromServer = row ? toUser(row) : null;

    /* Who and where come from the session even when the record was read: the
       token is what the server will actually enforce. */
    const sessionBranchIds = session.branchIds ?? fromServer?.branchIds ?? [];
    const resolvedUser: User = fromServer
      ? {
          ...fromServer,
          roleId: session.roleId,
          branchIds: sessionBranchIds,
          defaultBranchId:
            fromServer.defaultBranchId && sessionBranchIds.includes(fromServer.defaultBranchId)
              ? fromServer.defaultBranchId
              : sessionBranchIds[0] ?? null,
        }
      : userFromSession(session);

    const baseRole = roleResult?.ok
      ? roleResult.data
      : minimalRole(session, row ? { nameAr: row.roleNameAr, nameEn: row.roleNameEn } : null);

    setUser(resolvedUser);
    /* The role carries the session's grants too, so nothing reading
       role.permissions disagrees with `can`. */
    setRole({ ...baseRole, permissions });

    /* Prefer the user's default branch, then the first branch they can use.
       Leaving it null means every stock read joins against nothing and shows
       zero — which looks like empty shelves rather than a missing selection. */
    const fallbackBranchId = resolvedUser.branchIds[0] ?? loadedBranches[0]?.id ?? null;

    setActiveBranchId(
      (current) =>
        (current && resolvedUser.branchIds.includes(current) ? current : null) ??
        resolvedUser.defaultBranchId ??
        fallbackBranchId,
    );

    setLoading(false);
  }, [session, permissions]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      role,
      branches,
      activeBranch: branches.find((branch) => branch.id === activeBranchId) ?? null,
      setActiveBranch: (branchId: string) => {
        setActiveBranchId(branchId);
        setViewingAllBranches(false);
      },
      viewingAllBranches,
      setViewingAllBranches,
      scopeBranchId: viewingAllBranches ? null : activeBranchId,
      permissions,
      can: (key) => hasPermission(permissions, key),
      canAny: (keys) => hasAny(permissions, keys),
      loading,
      refresh: load,
    }),
    [user, role, branches, activeBranchId, viewingAllBranches, permissions, loading, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside <SessionProvider>.');
  }
  return context;
}
