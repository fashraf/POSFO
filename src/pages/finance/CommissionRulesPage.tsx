import { useCallback, useEffect, useState } from 'react';
import { Pencil, Percent, Plus } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  ConfirmModal,
  Modal,
  PageHeader,
  PriceInput,
  SearchableSelect,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { FinanceTabs } from '@/features/finance/FinanceTabs';
import { ScopeBanner } from '@/features/finance/ScopeBanner';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { formatCurrency, toMinorUnits } from '@/lib/format';
import { catalogService, commissionService, safeCall, userService } from '@/services';
import { isService } from '@/types/catalog';
import { commissionForH } from '@/types/finance';
import type { CommissionBasis, CommissionRule } from '@/types/finance';
import type { CatalogItem } from '@/types/catalog';
import type { User } from '@/types/permissions';

/** Percentages are stored as basis points of a percent, so 20% is 2000. */
const percentToStored = (percent: number) => Math.round(percent * 100);
const storedToPercent = (value: number) => value / 100;

export default function CommissionRulesPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();

  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [basis, setBasis] = useState<CommissionBasis>('percentage');
  const [percent, setPercent] = useState('20');
  const [fixed, setFixed] = useState('');
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    setLoading(true);
    const [ruleResult, staffResult, itemResult] = await Promise.all([
      safeCall(() => commissionService.rules()),
      safeCall(() => userService.list()),
      safeCall(() => catalogService.list({ pageSize: 500 })),
    ]);
    if (ruleResult.ok) setRules(ruleResult.data);
    if (staffResult.ok) setStaff(staffResult.data.filter((member) => member.status === 'active'));
    /* Commission is earned for performing work, so only services qualify.
       A shampoo sold off a shelf was not performed by anyone. */
    if (itemResult.ok) setItems(itemResult.data.items.filter(isService));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!creating) return;
    if (editingId) return;
    setUserIds([]);
    setBasis('percentage');
    setPercent('20');
    setFixed('');
    setItemIds([]);
  }, [creating]);

  const value = basis === 'percentage' ? percentToStored(Number(percent) || 0) : toMinorUnits(fixed || '0');

  async function create() {
    setBusy(true);
    const payload = { userIds, basis, value, itemIds, status: 'active' as const };

    const result = await safeCall(() =>
      editingId
        ? commissionService.updateRule(editingId, payload)
        : commissionService.saveRule(payload),
    );
    setBusy(false);

    setConfirming(false);

    if (result.ok) {
      toast.success(t('commissionRules.toast.created'));
      setCreating(false);
      await load();
    } else {
      toast.error(t('commissionRules.toast.failed'), result.error.message);
    }
  }

  const employeeNames = (ids: string[]) => {
    if (ids.length === 0) return t('commissionRules.everyone');
    return ids
      .map((id) => {
        const member = staff.find((candidate) => candidate.id === id);
        return member ? nameOf(member) : null;
      })
      .filter(Boolean)
      .join(', ');
  };

  const itemNames = (ids: string[]) => {
    if (ids.length === 0) return t('commissionRules.allServices');
    return ids
      .map((id) => {
        const item = items.find((candidate) => candidate.id === id);
        return item ? nameOf(item) : null;
      })
      .filter(Boolean)
      .join(', ');
  };

  /** Load an existing rule into the form. */
  function edit(rule: CommissionRule) {
    setEditingId(rule.id);
    setUserIds(rule.userIds);
    setItemIds(rule.itemIds);
    setBasis(rule.basis);
    if (rule.basis === 'percentage') setPercent(String(rule.value / 100));
    else setFixed((rule.value / 100).toFixed(2));
    setCreating(true);
  }

  /* A worked example on a 10.00 sale, since a rate in the abstract is hard to
     judge — this is the figure that ends up in someone's pay. */
  const sampleH = 1000;
  const sampleCommissionH = commissionForH(
    { basis, value } as CommissionRule,
    sampleH,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('commissionRules.title')}
        description={t('commissionRules.description')}
        actions={
          <Button leadingIcon={<Plus />} onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}>
            {t('commissionRules.add')}
          </Button>
        }
      />

      <FinanceTabs />

      <ScopeBanner />

      <Alert tone="info" compact>
        {t('commissionRules.servicesOnly')}
      </Alert>

      <Alert tone="tip" compact title={t('commissionRules.precedence')}>
        {t('commissionRules.precedenceHelp')}
      </Alert>

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <SkeletonTable rows={3} columns={4} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t('commissionRules.columns.employee')}</TableHeaderCell>
                <TableHeaderCell>{t('commissionRules.columns.applies')}</TableHeaderCell>
                <TableHeaderCell>{t('commissionRules.columns.basis')}</TableHeaderCell>
                <TableHeaderCell numeric>{t('commissionRules.columns.rate')}</TableHeaderCell>
                <TableHeaderCell>{t('commissionRules.columns.status')}</TableHeaderCell>
                <TableHeaderCell align="end">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rules.length === 0 ? (
                <TableEmptyRow colSpan={6}>
                  <EmptyState
                    icon={<Percent />}
                    title={t('commissionRules.empty.title')}
                    description={t('commissionRules.empty.description')}
                    action={
                      <Button onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}>
                        {t('commissionRules.add')}
                      </Button>
                    }
                  />
                </TableEmptyRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium text-ink-900">
                      {employeeNames(rule.userIds)}
                      {rule.userIds.length === 0 && (
                        <Badge tone="neutral" className="ms-1.5">
                          {t('commissionRules.everyone')}
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-ink-600">{itemNames(rule.itemIds)}</TableCell>

                    <TableCell className="text-ink-600">
                      {t(`commissionRules.basis.${rule.basis}`)}
                    </TableCell>

                    <TableCell numeric className="numeric font-medium text-ink-900">
                      {rule.basis === 'percentage'
                        ? `${storedToPercent(rule.value)}%`
                        : formatCurrency(rule.value, { language })}
                    </TableCell>

                    <TableCell>
                      <Badge tone={rule.status === 'active' ? 'success' : 'neutral'} dot>
                        {t(`common.${rule.status}`)}
                      </Badge>
                    </TableCell>

                    <TableCell align="end">
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Pencil />}
                        onClick={() => edit(rule)}
                      >
                        {t('common.edit')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size="sm"
        title={editingId ? t('common.edit') : t('commissionRules.add')}
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={value <= 0}>
              {t('commissionRules.add')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField
            label={t('commissionRules.fields.employee')}
            showOptional
            help={t('commissionRules.fields.employeeHelp')}
          >
            <SearchableSelect
              isMulti
              size="sm"
              value={userIds}
              onChange={setUserIds}
              placeholder={t('commissionRules.everyone')}
              options={staff.map((member) => ({ value: member.id, label: nameOf(member) }))}
            />
          </FormField>

          <FormField label={t('commissionRules.fields.basis')}>
            <SearchableSelect
              size="sm"
              value={basis}
              onChange={(next) => setBasis((next ?? 'percentage') as CommissionBasis)}
              options={[
                { value: 'percentage', label: t('commissionRules.basis.percentage') },
                { value: 'fixed', label: t('commissionRules.basis.fixed') },
              ]}
            />
          </FormField>

          {basis === 'percentage' ? (
            <FormField label={t('commissionRules.fields.percent')} required>
              <Input
                inputSize="sm"
                type="number"
                min="0"
                max="100"
                step="0.5"
                dir="ltr"
                className="tabular text-start"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                trailingAddon={<span className="text-xs font-medium text-ink-500">%</span>}
              />
            </FormField>
          ) : (
            <FormField label={t('commissionRules.fields.fixed')} required>
              <PriceInput
                inputSize="sm"
                value={fixed}
                onChange={(event) => setFixed(event.target.value)}
              />
            </FormField>
          )}

          <FormField
            label={t('commissionRules.fields.item')}
            showOptional
            help={t('commissionRules.fields.itemHelp')}
          >
            <SearchableSelect
              isMulti
              size="sm"
              value={itemIds}
              onChange={setItemIds}
              placeholder={t('commissionRules.allServices')}
              options={items.map((item) => ({ value: item.id, label: nameOf(item) }))}
            />
          </FormField>

          {value > 0 && (
            <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
              {t('commissionRules.example', {
                sale: formatCurrency(sampleH, { language }),
                commission: formatCurrency(sampleCommissionH, { language }),
              })}
            </p>
          )}
        </div>
      </Modal>

      {/* Commission changes what people are paid, so it confirms with the
          worked example rather than saving on a single click. */}
      <ConfirmModal
        open={confirming}
        title={t('commissionRules.add')}
        description={t('commissionRules.precedenceHelp')}
        confirmLabel={t('commissionRules.add')}
        variant="primary"
        loading={busy}
        onConfirm={create}
        onCancel={() => setConfirming(false)}
      >
        <dl className="space-y-1 rounded-md bg-ink-50 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('commissionRules.fields.employee')}</dt>
            <dd className="font-medium text-ink-800">{employeeNames(userIds)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">{t('commissionRules.columns.applies')}</dt>
            <dd className="font-medium text-ink-800">{itemNames(itemIds)}</dd>
          </div>
          <div className="flex justify-between border-t border-dashed border-ink-200 pt-1.5">
            <dt className="text-ink-500">{t('commissionRules.columns.rate')}</dt>
            <dd className="numeric font-semibold text-ink-900">
              {basis === 'percentage'
                ? `${Number(percent) || 0}%`
                : formatCurrency(value, { language })}
            </dd>
          </div>
        </dl>

        <p className="mt-2 text-2xs text-ink-500">
          {t('commissionRules.example', {
            sale: formatCurrency(sampleH, { language }),
            commission: formatCurrency(sampleCommissionH, { language }),
          })}
        </p>
      </ConfirmModal>
    </div>
  );
}
