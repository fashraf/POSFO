import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmModal,
  Dropdown,
  EmptyState,
  PageHeader,
  SkeletonTable,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { formatDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { roleService, safeCall } from '@/services';
import { PERMISSIONS } from '@/types/permissions';
import type { Role } from '@/types/permissions';

export default function RolesPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [roles, setRoles] = useState<Role[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [roleResult, usageResult] = await Promise.all([
      safeCall(() => roleService.list()),
      safeCall(() => roleService.usage()),
    ]);
    if (roleResult.ok) setRoles(roleResult.data);
    if (usageResult.ok) setUsage(usageResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = (role: Role) => (language === 'ar' ? role.nameAr : role.nameEn);

  async function remove() {
    if (!pendingDelete) return;
    setBusy(true);
    const result = await safeCall(() => roleService.remove(pendingDelete.id));
    if (result.ok) {
      toast.success(t('roles.toast.deleted'));
      await load();
    } else {
      toast.error(t('roles.toast.failed'), result.error.message);
    }
    setBusy(false);
    setPendingDelete(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('roles.title')}
        description={t('roles.description')}
        actions={
          <Link to={ROUTES.roleNew}>
            <Button leadingIcon={<Plus />}>{t('roles.add')}</Button>
          </Link>
        }
      />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={5} columns={5} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('roles.columns.role')}</TableHeaderCell>
                <TableHeaderCell>{t('roles.columns.description')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('roles.columns.users')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('roles.columns.permissions')}</TableHeaderCell>
                <TableHeaderCell>{t('roles.columns.status')}</TableHeaderCell>
                <TableHeaderCell>{t('roles.columns.created')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {roles.length === 0 ? (
                <TableEmptyRow colSpan={7}>
                  <EmptyState
                    icon={<ShieldCheck />}
                    title={t('roles.empty.title')}
                    description={t('roles.empty.description')}
                    action={
                      <Link to={ROUTES.roleNew}>
                        <Button>{t('roles.add')}</Button>
                      </Link>
                    }
                  />
                </TableEmptyRow>
              ) : (
                roles.map((role) => (
                  <TableRow
                    key={role.id}
                    interactive
                    onClick={() => navigate(`/roles/${role.id}/edit`)}
                  >
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-ink-900">{nameOf(role)}</span>
                        <Badge tone={role.builtIn ? 'neutral' : 'brand'}>
                          {role.builtIn ? t('roles.builtIn') : t('roles.custom')}
                        </Badge>
                        {role.external && <Badge tone="info">{t('roles.external')}</Badge>}
                      </span>
                    </TableCell>

                    <TableCell className="max-w-xs">
                      <span className="line-clamp-1 text-ink-600">{role.description || '—'}</span>
                    </TableCell>

                    <TableCell numeric className="text-ink-700">
                      {formatNumber(usage[role.id] ?? 0, { language })}
                    </TableCell>

                    <TableCell numeric className="text-ink-500">
                      {formatNumber(role.permissions.length, { language })} /{' '}
                      {formatNumber(PERMISSIONS.length, { language })}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={role.status} />
                    </TableCell>

                    <TableCell className="text-ink-500">
                      {formatDate(role.createdAt, { language })}
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
                              label: t('common.edit'),
                              icon: <Pencil />,
                              onSelect: () => navigate(`/roles/${role.id}/edit`),
                            },
                            ...(role.builtIn
                              ? []
                              : [
                                  {
                                    key: 'delete',
                                    label: t('common.delete'),
                                    icon: <Trash2 />,
                                    destructive: true,
                                    separated: true,
                                    onSelect: () => setPendingDelete(role),
                                  },
                                ]),
                          ]}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title={t('roles.deleteTitle')}
        description={t('roles.deleteDescription')}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
