import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, Plus, Power, PowerOff, Tags, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmModal,
  Dropdown,
  EmptyState,
  PageHeader,
  SearchInput,
  SkeletonTable,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tooltip,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import { discountService, roleService, safeCall } from '@/services';
import { storedToPercent } from '@/types/discounts';
import type { Discount } from '@/types/discounts';
import type { Role } from '@/types/permissions';

type Pending = { discount: Discount; kind: 'activate' | 'deactivate' | 'delete' } | null;

export default function DiscountsPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    const [discountResult, roleResult] = await Promise.all([
      safeCall(() => discountService.list()),
      safeCall(() => roleService.list()),
    ]);
    if (discountResult.ok) setDiscounts(discountResult.data);
    if (roleResult.ok) setRoles(roleResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const visible = useMemo(() => {
    const needle = debouncedSearch.trim().toLocaleLowerCase();
    if (!needle) return discounts;
    return discounts.filter((discount) =>
      `${discount.nameAr} ${discount.nameEn} ${discount.description}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [discounts, debouncedSearch]);

  const roleNames = (ids: string[]) => {
    if (ids.length === 0) return t('discounts.everyone');
    return ids
      .map((id) => {
        const role = roles.find((candidate) => candidate.id === id);
        return role ? nameOf(role) : null;
      })
      .filter(Boolean)
      .join(', ');
  };

  async function run() {
    if (!pending) return;
    setBusy(true);

    const { discount, kind } = pending;
    const result = await safeCall<void>(async () => {
      if (kind === 'delete') {
        await discountService.remove(discount.id);
        return;
      }
      await discountService.setStatus(discount.id, kind === 'activate' ? 'active' : 'inactive');
    });

    if (result.ok) {
      toast.success(
        kind === 'delete'
          ? t('discounts.toast.deleted')
          : kind === 'activate'
            ? t('discounts.toast.activated')
            : t('discounts.toast.deactivated'),
      );
      await load();
    } else {
      toast.error(t('discounts.toast.failed'), result.error.message);
    }

    setBusy(false);
    setPending(null);
  }

  const copy = pending
    ? {
        activate: {
          title: t('discounts.confirm.activateTitle'),
          description: t('discounts.confirm.activateDescription'),
          confirm: t('discounts.confirm.activateConfirm'),
          variant: 'primary' as const,
        },
        deactivate: {
          title: t('discounts.confirm.deactivateTitle'),
          description: t('discounts.confirm.deactivateDescription'),
          confirm: t('discounts.confirm.deactivateConfirm'),
          variant: 'danger' as const,
        },
        delete: {
          title: t('discounts.confirm.deleteTitle'),
          description: t('discounts.confirm.deleteDescription'),
          confirm: t('common.delete'),
          variant: 'danger' as const,
        },
      }[pending.kind]
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('discounts.title')}
        description={t('discounts.description')}
        actions={
          <Link to={ROUTES.discountNew}>
            <Button leadingIcon={<Plus />}>{t('discounts.add')}</Button>
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
                <TableHeaderCell>{t('discounts.columns.discount')}</TableHeaderCell>
                <TableHeaderCell>{t('discounts.columns.type')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('discounts.columns.value')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('discounts.columns.maximum')}</TableHeaderCell>
                <TableHeaderCell>{t('discounts.columns.appliesTo')}</TableHeaderCell>
                <TableHeaderCell>{t('discounts.columns.roles')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('discounts.columns.usage')}</TableHeaderCell>
                <TableHeaderCell>{t('discounts.columns.status')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={9}>
                  <EmptyState
                    icon={<Tags />}
                    title={t('discounts.empty.title')}
                    description={t('discounts.empty.description')}
                    action={
                      <Link to={ROUTES.discountNew}>
                        <Button>{t('discounts.add')}</Button>
                      </Link>
                    }
                  />
                </TableEmptyRow>
              ) : (
                visible.map((discount) => (
                  <TableRow
                    key={discount.id}
                    interactive
                    onClick={() => navigate(`/discounts/${discount.id}/edit`)}
                  >
                    <TableCell>
                      <p className="font-medium text-ink-900">{nameOf(discount)}</p>
                      {discount.description && (
                        <p className="line-clamp-1 text-xs text-ink-400">{discount.description}</p>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge tone={discount.type === 'percentage' ? 'info' : 'brand'}>
                        {t(`discounts.type.${discount.type}`)}
                      </Badge>
                    </TableCell>

                    <TableCell numeric className="font-medium text-ink-900">
                      {discount.type === 'percentage'
                        ? `${storedToPercent(discount.value)}%`
                        : formatCurrency(discount.value, { language })}
                    </TableCell>

                    <TableCell numeric className="text-ink-500">
                      {discount.maxAmountH > 0
                        ? formatCurrency(discount.maxAmountH, { language })
                        : '—'}
                    </TableCell>

                    <TableCell className="text-ink-600">
                      {t(`discounts.applicability.${discount.applicability}`)}
                    </TableCell>

                    <TableCell className="max-w-[10rem]">
                      <Tooltip content={roleNames(discount.allowedRoleIds)}>
                        <span className="line-clamp-1 text-ink-600">
                          {roleNames(discount.allowedRoleIds)}
                        </span>
                      </Tooltip>
                    </TableCell>

                    <TableCell numeric className="text-ink-500">
                      {formatNumber(discount.usageCount, { language })}
                    </TableCell>

                    <TableCell>
                      <span className="flex flex-col gap-1">
                        <StatusBadge status={discount.status} />
                        {discount.endsAt && (
                          <span className="text-2xs text-ink-400">
                            {formatDate(discount.endsAt, { language })}
                          </span>
                        )}
                      </span>
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
                              onSelect: () => navigate(`/discounts/${discount.id}/edit`),
                            },
                            {
                              key: 'status',
                              label:
                                discount.status === 'active'
                                  ? t('discounts.confirm.deactivateConfirm')
                                  : t('discounts.confirm.activateConfirm'),
                              icon: discount.status === 'active' ? <PowerOff /> : <Power />,
                              destructive: discount.status === 'active',
                              separated: true,
                              onSelect: () =>
                                setPending({
                                  discount,
                                  kind: discount.status === 'active' ? 'deactivate' : 'activate',
                                }),
                            },
                            ...(discount.usageCount === 0
                              ? [
                                  {
                                    key: 'delete',
                                    label: t('common.delete'),
                                    icon: <Trash2 />,
                                    destructive: true,
                                    onSelect: () => setPending({ discount, kind: 'delete' }),
                                  },
                                ]
                              : []),
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
        open={Boolean(pending)}
        title={copy?.title ?? ''}
        description={copy?.description ?? ''}
        confirmLabel={copy?.confirm}
        variant={copy?.variant ?? 'danger'}
        loading={busy}
        onConfirm={run}
        onCancel={() => setPending(null)}
      >
        {pending && (
          <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
            {nameOf(pending.discount)}
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}
