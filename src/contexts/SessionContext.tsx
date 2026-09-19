import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { branchService, roleService, safeCall, userService } from '@/services';
import { setActiveBranchForStock } from '@/services/apiCatalogService';
import { effectivePermissions, hasAny, hasPermission } from '@/types/permissions';
import type { Branch, PermissionKey, Role, User } from '@/types/permissions';

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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  /*
   * Tell the stock services which branch is active.
   *
   * Stock is physical and belongs to a branch, but the service signatures the
   * screens use have no room for one — they mirror the mock contract. This
   * keeps a module-level copy in step with the session instead, so a delivery
   * or an adjustment knows where it happened without every caller passing it.
   *
   * Without this the branch is null and every stock write is refused.
   */
  useEffect(() => {
    setActiveBranchForStock(activeBranchId);
  }, [activeBranchId]);
  const [viewingAllBranches, setViewingAllBranches] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [userResult, branchResult] = await Promise.all([
      safeCall(() => userService.current()),
      safeCall(() => branchService.list()),
    ]);

    if (branchResult.ok) setBranches(branchResult.data);

    if (userResult.ok) {
      setUser(userResult.data);

      /* Prefer the user's default branch, then the first branch they can use.
         Leaving it null means every stock read joins against nothing and shows
         zero — which looks like empty shelves rather than a missing selection. */
      const fallbackBranchId = branchResult.ok ? branchResult.data[0]?.id ?? null : null;

      setActiveBranchId(
        (current) => current ?? userResult.data.defaultBranchId ?? fallbackBranchId,
      );

      const roleResult = await safeCall(() => roleService.get(userResult.data.roleId));
      if (roleResult.ok) setRole(roleResult.data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const permissions = useMemo(
    () => (user && role ? effectivePermissions(user, role) : []),
    [user, role],
  );

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
