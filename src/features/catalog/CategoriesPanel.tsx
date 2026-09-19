import { useState } from 'react';
import { Plus, Tags } from 'lucide-react';
import {
  Badge,
  Button,
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

export interface CategoriesPanelProps {
  categories: Category[];
  usage: Record<string, number>;
  onCreate: (input: {
    nameAr: string;
    nameEn: string;
    appliesTo: CatalogItemKind | 'both';
    sortOrder: number;
    status: 'active';
  }) => Promise<boolean>;
}

export function CategoriesPanel({ categories, usage, onCreate }: CategoriesPanelProps) {
  const { t } = useTranslation();
  const { language } = useI18n();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [appliesTo, setAppliesTo] = useState<CatalogItemKind | 'both'>('both');

  const nameOf = (category: Category) => (language === 'ar' ? category.nameAr : category.nameEn);

  const appliesLabel = (value: Category['appliesTo']) =>
    value === 'both' ? t('catalog.categories.appliesToBoth') : t(`catalog.kind.${value}`);

  function reset() {
    setNameAr('');
    setNameEn('');
    setAppliesTo('both');
  }

  async function submit() {
    setSaving(true);
    try {
      const succeeded = await onCreate({
        nameAr,
        nameEn,
        appliesTo,
        sortOrder: categories.length + 1,
        status: 'active',
      });
      if (succeeded) {
        setOpen(false);
        reset();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-500">{t('catalog.categories.description')}</p>
        <Button size="sm" leadingIcon={<Plus />} onClick={() => setOpen(true)}>
          {t('catalog.categories.add')}
        </Button>
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
            </TableRow>
          </TableHead>

          <TableBody>
            {categories.length === 0 ? (
              <TableEmptyRow colSpan={5}>
                <EmptyState
                  icon={<Tags />}
                  title={t('catalog.categories.emptyTitle')}
                  description={t('catalog.categories.emptyDescription')}
                  action={
                    <Button onClick={() => setOpen(true)}>{t('catalog.categories.add')}</Button>
                  }
                />
              </TableEmptyRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('catalog.categories.newCategory')}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={saving}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label={t('catalog.form.nameAr')} required>
            <Input value={nameAr} onChange={(event) => setNameAr(event.target.value)} dir="rtl" />
          </FormField>

          <FormField label={t('catalog.form.nameEn')} required>
            <Input value={nameEn} onChange={(event) => setNameEn(event.target.value)} dir="ltr" />
          </FormField>

          <FormField label={t('catalog.columns.appliesTo')}>
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
    </>
  );
}
