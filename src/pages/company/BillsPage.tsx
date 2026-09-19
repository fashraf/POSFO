import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
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
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { billTemplateService, printGroupService, safeCall } from '@/services';
import type { BillTemplate } from '@/types/company';
import type { PrintGroup } from '@/types/printing';

export default function BillsPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<BillTemplate[]>([]);
  const [groups, setGroups] = useState<PrintGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<BillTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const debounced = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    const [templateResult, groupResult] = await Promise.all([
      safeCall(() => billTemplateService.list()),
      safeCall(() => printGroupService.list()),
    ]);
    if (templateResult.ok) setTemplates(templateResult.data);
    if (groupResult.ok) setGroups(groupResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groupName = (id: string | null) => {
    if (!id) return '—';
    const group = groups.find((candidate) => candidate.id === id);
    if (!group) return '—';
    return language === 'ar' ? group.nameAr : group.nameEn;
  };

  const visible = useMemo(() => {
    const needle = debounced.trim().toLocaleLowerCase();
    if (!needle) return templates;
    return templates.filter((template) => template.name.toLocaleLowerCase().includes(needle));
  }, [templates, debounced]);

  async function remove() {
    if (!pendingDelete) return;
    setBusy(true);

    const result = await safeCall<void>(async () => {
      await billTemplateService.remove(pendingDelete.id);
    });

    if (result.ok) {
      toast.success(t('bills.toast.deleted'));
      await load();
    } else {
      toast.error(t('bills.toast.failed'), result.error.message);
    }

    setBusy(false);
    setPendingDelete(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('bills.title')}
        description={t('bills.description')}
        actions={
          <Link to="/bills/new">
            <Button leadingIcon={<Plus />}>{t('bills.add')}</Button>
          </Link>
        }
      />

      <SearchInput
        className="sm:max-w-xs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onClear={() => setSearch('')}
        placeholder={t('bills.search')}
      />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={4} columns={5} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('bills.columns.name')}</TableHeaderCell>
                <TableHeaderCell>{t('bills.columns.audience')}</TableHeaderCell>
                <TableHeaderCell>{t('bills.columns.paper')}</TableHeaderCell>
                <TableHeaderCell>{t('bills.columns.language')}</TableHeaderCell>
                <TableHeaderCell>{t('bills.columns.status')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visible.length === 0 ? (
                <TableEmptyRow colSpan={6}>
                  <EmptyState
                    icon={<FileText />}
                    title={t('bills.empty.title')}
                    description={t('bills.empty.description')}
                    action={
                      <Link to="/bills/new">
                        <Button>{t('bills.add')}</Button>
                      </Link>
                    }
                  />
                </TableEmptyRow>
              ) : (
                visible.map((template) => (
                  <TableRow
                    key={template.id}
                    interactive
                    onClick={() => navigate(`/bills/${template.id}/edit`)}
                  >
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-ink-900">{template.name}</span>
                        {template.isDefault && (
                          <Badge tone="brand">{t('bills.defaultBadge')}</Badge>
                        )}
                      </span>
                    </TableCell>

                    <TableCell className="text-ink-600">
                      {template.audience === 'customer'
                        ? t('bills.audience.customerShort')
                        : t('bills.audience.groupShort', {
                            group: groupName(template.printGroupId),
                          })}
                    </TableCell>

                    <TableCell className="numeric text-ink-600">{template.paperSize}</TableCell>

                    <TableCell className="text-ink-600">
                      {t(`bill.paper.${template.language}`)}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={template.status} />
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
                              onSelect: () => navigate(`/bills/${template.id}/edit`),
                            },
                            ...(template.isDefault
                              ? []
                              : [
                                  {
                                    key: 'delete',
                                    label: t('common.delete'),
                                    icon: <Trash2 />,
                                    destructive: true,
                                    separated: true,
                                    onSelect: () => setPendingDelete(template),
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
        title={t('bills.deleteTitle')}
        description={t('bills.deleteDescription')}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
