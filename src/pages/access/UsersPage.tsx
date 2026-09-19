import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, ShieldAlert, ShieldCheck, UserMinus, UserPlus, Users as UsersIcon } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ConfirmModal,
  Dropdown,
  EmptyState,
  PageHeader,
  SearchInput,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/contexts/ToastContext';
import { CommissionBadge } from '@/features/finance/CommissionBadge';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { branchService, commissionService, roleService, safeCall, userService } from '@/services';
import { effectiveStatus, isAccessExpired } from '@/types/permissions';
import type { BadgeTone } from '@/components/ui';
import type { CommissionRule } from '@/types/finance';
import type { Branch, Role, User, UserStatus } from '@/types/permissions';

const STATUS_TONES: Record<UserStatus, BadgeTone> = {
  active: 'success',
  suspended: 'danger',
  invited: 'info',
};

type PendingAction = { user: User; kind: 'disable' | 'enable' | 'revoke' } | null;

export default function UsersPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [commissionRules, setCommissionRules] = useState<CommissionRule[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    const [userResult, roleResult, ruleResult, branchResult] = await Promise.all([
      safeCall(() => userService.list()),
      safeCall(() => roleService.list()),
      safeCall(() => commissionService.rules()),
      safeCall(() => branchService.list()),
    ]);
    if (userResult.ok) setUsers(userResult.data);
    if (roleResult.ok) setRoles(roleResult.data);
    if (ruleResult.ok) setCommissionRules(ruleResult.data);
    if (branchResult.ok) setBranches(branchResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const visible = useMemo(() => {
    const needle = debouncedSearch.trim().toLocaleLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      `${user.nameAr} ${user.nameEn} ${user.username} ${user.email} ${user.employeeId}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [users, debouncedSearch]);

  async function runPending() {
    if (!pending) return;
    setBusy(true);

    const { user, kind } = pending;
    const result = await safeCall(() =>
      kind === 'revoke'
        ? userService.revokeAccess(user.id)
        : userService.setStatus(user.id, kind === 'disable' ? 'suspended' : 'active'),
    );

    if (result.ok) {
      toast.success(
        kind === 'revoke'
          ? t('users.toast.revoked')
          : kind === 'disable'
            ? t('users.toast.disabled')
            : t('users.toast.enabled'),
      );
      await load();
    } else {
      toast.error(t('users.toast.failed'), result.error.message);
    }

    setBusy(false);
    setPending(null);
  }

  const confirmCopy = pending
    ? {
        disable: {
          title: t('users.confirm.disableTitle'),
          description: t('users.confirm.disableDescription'),
          confirm: t('users.confirm.disableConfirm'),
          variant: 'danger' as const,
        },
        enable: {
          title: t('users.confirm.enableTitle'),
          description: t('users.confirm.enableDescription'),
          confirm: t('users.confirm.enableConfirm'),
          variant: 'primary' as const,
        },
        revoke: {
          title: t('users.confirm.revokeTitle'),
          description: t('users.confirm.revokeDescription'),
          confirm: t('users.confirm.revokeConfirm'),
          variant: 'danger' as const,
        },
      }[pending.kind]
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
        actions={
          <Link to={ROUTES.userNew}>
            <Button leadingIcon={<UserPlus />}>{t('users.add')}</Button>
          </Link>
        }
      />

      <SearchInput
        className="sm:max-w-xs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onClear={() => setSearch('')}
      />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={5} columns={6} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('users.columns.user')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.username')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.role')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.branch')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.status')}</TableHeaderCell>
                <TableHeaderCell>{t('users.columns.lastActive')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={7}>
                  <EmptyState
                    icon={<UsersIcon />}
                    title={t('users.empty.title')}
                    description={t('users.empty.description')}
                    action={
                      <Link to={ROUTES.userNew}>
                        <Button>{t('users.add')}</Button>
                      </Link>
                    }
                  />
                </TableEmptyRow>
              ) : (
                visible.map((user) => {
                  const role = roleById.get(user.roleId);
                  const status = effectiveStatus(user);
                  const expired = isAccessExpired(user);
                  const branch = user.defaultBranchId
                    ? branchById.get(user.defaultBranchId)
                    : undefined;

                  return (
                    <TableRow
                      key={user.id}
                      interactive
                      onClick={() => navigate(`/users/${user.id}/edit`)}
                    >
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={nameOf(user)} size="sm" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-medium text-ink-900">
                              {nameOf(user)}
                              <CommissionBadge rules={commissionRules} userId={user.id} />
                            </p>
                            <p className="truncate text-xs text-ink-400" dir="ltr">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-ink-600" dir="ltr">
                        {user.username}
                      </TableCell>

                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-ink-700">{role ? nameOf(role) : '—'}</span>
                          {role?.external && (
                            <Badge tone="info">{t('users.external.badge')}</Badge>
                          )}
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-600">
                        {branch ? nameOf(branch) : '—'}
                      </TableCell>

                      <TableCell>
                        <span className="flex flex-col gap-1">
                          <Badge tone={STATUS_TONES[status]} dot>
                            {t(`users.status.${status}`)}
                          </Badge>
                          {expired && (
                            <span className="text-2xs text-danger-600">
                              {t('users.external.expired')}
                            </span>
                          )}
                        </span>
                      </TableCell>

                      <TableCell className="text-ink-500">
                        {user.lastActiveAt
                          ? formatDate(user.lastActiveAt, { language, withTime: true })
                          : '—'}
                      </TableCell>

                      <TableCell align="end">
                        <div onClick={(event) => event.stopPropagation()}>
                          <Dropdown
                            align="end"
                            trigger={
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                            items={[
                              {
                                key: 'edit',
                                label: t('users.actions.edit'),
                                icon: <Pencil />,
                                onSelect: () => navigate(`/users/${user.id}/edit`),
                              },
                              ...(role?.external && !expired
                                ? [
                                    {
                                      key: 'revoke',
                                      label: t('users.actions.revoke'),
                                      icon: <ShieldAlert />,
                                      destructive: true,
                                      separated: true,
                                      onSelect: () => setPending({ user, kind: 'revoke' }),
                                    },
                                  ]
                                : []),
                              {
                                key: 'status',
                                label:
                                  user.status === 'suspended'
                                    ? t('users.actions.enable')
                                    : t('users.actions.disable'),
                                icon:
                                  user.status === 'suspended' ? <ShieldCheck /> : <UserMinus />,
                                destructive: user.status !== 'suspended',
                                separated: !role?.external,
                                onSelect: () =>
                                  setPending({
                                    user,
                                    kind: user.status === 'suspended' ? 'enable' : 'disable',
                                  }),
                              },
                            ]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pending)}
        title={confirmCopy?.title ?? ''}
        description={confirmCopy?.description ?? ''}
        confirmLabel={confirmCopy?.confirm}
        variant={confirmCopy?.variant ?? 'danger'}
        loading={busy}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      >
        {pending && (
          <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
            {nameOf(pending.user)} · <span dir="ltr">{pending.user.username}</span>
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}
