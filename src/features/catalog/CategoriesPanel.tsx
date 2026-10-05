import { useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Power, PowerOff, Tags } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { useI18n, useTranslation } from '@/i18n';
import type { Category, CatalogItemKind } from '@/types/catalog';

export interface CategoryFormInput {
  nameAr: string;
  nameEn: string;
  appliesTo: CatalogItemKind | 'both';
  sortOrder: number;
  status: Category['status'];
}

/**
 * What a save reports back: true when it went through, or the field messages
 * to show beside the inputs (a duplicate name, a missing one). Anything else
 * the page has already shown as a toast, and the dialog stays open.
 */
export type CategorySaveResult = true | { fieldErrors?: Record<string, string> };

export interface CategoriesPanelProps {
  categories: Category[];
  usage: Record<string, number>;
  /** Absent when the user lacks products.create. */
  onCreate?: (input: CategoryFormInput) => Promise<CategorySaveResult>;
  /** Absent when the user lacks products.edit. */
  onUpdate?: (category: Category, input: CategoryFormInput) => Promise<CategorySaveResult>;
  /** Absent when the user lacks catalog.activate. Resolves once the server answered. */
  onToggleStatus?: (category: Category) => Promise<void>;
}

export function CategoriesPanel({
  categories,
  usage,
  onCreate,
  onUpdate,
  onToggleStatus,
}: CategoriesPanelProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const [open, setOpen] = useState(false);
  /* Null while creating. */
  const [editing, setEditing] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [appliesTo, setAppliesTo] = useState<CatalogItemKind | 'both'>('both');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [pendingDeactivate, setPendingDeactivate] = useState<Category | null>(null);
  const [toggling, setToggling] = useState(false);

  const nameOf = (category: Category) => (language === 'ar' ? category.nameAr : category.nameEn);

  const appliesLabel = (value: Category['appliesTo']) =>
    value === 'both' ? t('catalog.categories.appliesToBoth') : t(`catalog.kind.${value}`);

  const hasActions = Boolean(onUpdate || onToggleStatus);
  const columnCount = hasActions ? 6 : 5;

  function openCreate() {
    setEditing(null);
    setNameAr('');
    setNameEn('');
    setAppliesTo('both');
    setErrors({});
    setOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setNameAr(category.nameAr);
    setNameEn(category.nameEn);
    setAppliesTo(category.appliesTo);
    setErrors({});
    setOpen(true);
  }

  async function submit() {
    const handler = editing ? onUpdate : onCreate;
    if (!handler) return;

    setSaving(true);
    setErrors({});
    try {
      const input: CategoryFormInput = {
        nameAr,
        nameEn,
        appliesTo,
        sortOrder: editing ? editing.sortOrder : categories.length + 1,
        status: editing ? editing.status : 'active',
      };
      const result = editing
        ? await onUpdate!(editing, input)
        : await onCreate!(input);

      if (result === true) {
        setOpen(false);
      } else if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggle(category: Category) {
    if (!onToggleStatus) return;
    /* Switching one off hides it from the POS rail, so it is confirmed.
       Switching one on is harmless. */
    if (category.status === 'active') {
      setPendingDeactivate(category);
      return;
    }
    await onToggleStatus(category);
  }

  async function confirmDeactivate() {
    if (!pendingDeactivate || !onToggleStatus) return;
    setToggling(true);
    try {
      await onToggleStatus(pendingDeactivate);
    } finally {
      setToggling(false);
      setPendingDeactivate(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-500">{t('catalog.categories.description')}</p>
        {onCreate && (
          <Button size="sm" leadingIcon={<Plus />} onClick={openCreate}>
            {t('catalog.categories.add')}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t('catalog.columns.name')}</TableHeaderCell>
              <TableHeaderCell>{t('catalog.columns.appliesTo')}</TableHeaderCell>
              <TableHeaderCell numeric>{t('catalog.columns.items')}</TableHeaderCell>
              <TableHeaderCell numeric>{t('catalog.categories.sortOrder')}</TableHeaderCell>
              <TableHeaderCell>{t('catalog.columns.status')}</TableHeaderCell>
              {hasActions && (
                <TableHeaderCell>
                  <span className="sr-only">{t('catalog.categories.actionsColumn')}</span>
                </TableHeaderCell>
              )}
            </TableRow>
          </TableHead>

          <TableBody>
            {categories.length === 0 ? (
              <TableEmptyRow colSpan={columnCount}>
                <EmptyState
                  icon={<Tags />}
                  title={t('catalog.categories.emptyTitle')}
                  description={t('catalog.categories.emptyDescription')}
                  action={
                    onCreate ? (
                      <Button onClick={openCreate}>{t('catalog.categories.add')}</Button>
                    ) : undefined
                  }
                />
              </TableEmptyRow>
            ) : (
              categories.map((category) => (
                <TableRow
                  key={category.id}
                  interactive={Boolean(onUpdate)}
                  onClick={onUpdate ? () => openEdit(category) : undefined}
                >
                  <TableCell className="font-medium text-ink-900">{nameOf(category)}</TableCell>
                  <TableCell>
                    <Badge tone={category.appliesTo === 'service' ? 'brand' : 'info'}>
                      {appliesLabel(category.appliesTo)}
                    </Badge>
                  </TableCell>
                  <TableCell numeric className="text-ink-600">
                    {formatNumber(usage[category.id] ?? 0, { language })}
                  </TableCell>
                  <TableCell numeric className="text-ink-500">
                    {formatNumber(category.sortOrder, { language })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={category.status} />
                  </TableCell>
                  {hasActions && (
                    <TableCell align="end">
                      {/* Stop the click reaching the row, which opens the editor. */}
                      <div onClick={(event) => event.stopPropagation()}>
                        <Dropdown
                          align="end"
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                          items={[
                            ...(onUpdate
                              ? [
                                  {
                                    key: 'edit',
                                    label: t('catalog.actions.edit'),
                                    icon: <Pencil />,
                                    onSelect: () => openEdit(category),
                                  },
                                ]
                              : []),
                            ...(onToggleStatus
                              ? [
                                  {
                                    key: 'status',
                                    label:
                                      category.status === 'active'
                                        ? t('catalog.actions.deactivate')
                                        : t('catalog.actions.activate'),
                                    icon: category.status === 'active' ? <PowerOff /> : <Power />,
                                    destructive: category.status === 'active',
                                    separated: Boolean(onUpdate),
                                    onSelect: () => void toggle(category),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('catalog.categories.editCategory') : t('catalog.categories.newCategory')}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? t('common.saveChanges') : t('common.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label={t('catalog.form.nameAr')} required error={errors.nameAr}>
            <Input
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              dir="rtl"
              invalid={Boolean(errors.nameAr)}
            />
          </FormField>

          <FormField label={t('catalog.form.nameEn')} required error={errors.nameEn}>
            <Input
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              dir="ltr"
              invalid={Boolean(errors.nameEn)}
            />
          </FormField>

          <FormField label={t('catalog.columns.appliesTo')} error={errors.appliesTo}>
            <Select
              value={appliesTo}
              onChange={(value) => setAppliesTo(value as CatalogItemKind | 'both')}
              options={[
                { value: 'both', label: t('catalog.categories.appliesToBoth') },
                { value: 'product', label: t('catalog.kind.product') },
                { value: 'service', label: t('catalog.kind.service') },
              ]}
            />
          </FormField>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDeactivate)}
        onClose={() => setPendingDeactivate(null)}
        onConfirm={confirmDeactivate}
        loading={toggling}
        title={t('catalog.categories.deactivateTitle')}
        description={t('catalog.categories.deactivateDescription')}
        confirmLabel={t('catalog.actions.deactivate')}
      />
    </>
  );
}
