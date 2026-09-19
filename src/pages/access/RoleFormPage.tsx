import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Users } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  ConfirmModal,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Switch,
  Textarea,
} from '@/components/ui';
import { PermissionMatrix } from '@/features/access/PermissionMatrix';
import { MenuPreview } from '@/features/access/MenuPreview';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { ROUTES } from '@/routes/paths';
import { roleService, safeCall } from '@/services';
import type { PermissionKey, Role, RoleInput } from '@/types/permissions';

interface FormState {
  nameAr: string;
  nameEn: string;
  description: string;
  status: 'active' | 'inactive';
  external: boolean;
  permissions: PermissionKey[];
}

const EMPTY: FormState = {
  nameAr: '',
  nameEn: '',
  description: '',
  status: 'active',
  external: false,
  permissions: [],
};

/**
 * One component serves both `/roles/new` and `/roles/:id/edit`.
 *
 * The two screens differ only in whether they load first and what the save
 * button does; splitting them into separate files would duplicate the whole
 * permission matrix for no benefit.
 */
export default function RoleFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [role, setRole] = useState<Role | null>(null);
  const [assignedUsers, setAssignedUsers] = useState(0);
  const [loading, setLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (mode !== 'edit' || !id) return;

    setLoading(true);
    setLoadError(null);

    const [roleResult, usageResult] = await Promise.all([
      safeCall(() => roleService.get(id)),
      safeCall(() => roleService.usage()),
    ]);

    if (roleResult.ok) {
      setRole(roleResult.data);
      setForm({
        nameAr: roleResult.data.nameAr,
        nameEn: roleResult.data.nameEn,
        description: roleResult.data.description,
        status: roleResult.data.status,
        external: roleResult.data.external,
        permissions: roleResult.data.permissions,
      });
    } else {
      setLoadError(roleResult.error.message);
    }

    if (usageResult.ok) setAssignedUsers(usageResult.data[id] ?? 0);
    setLoading(false);
  }, [mode, id]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  const isOwnerRole = role?.kind === 'owner';
  const permissionsChanged = useMemo(() => {
    if (!role) return false;
    const before = [...role.permissions].sort().join('|');
    const after = [...form.permissions].sort().join('|');
    return before !== after;
  }, [role, form.permissions]);

  /* A permission change on a role in use lands on real people the next time
     they sign in, so it gets a confirmation naming the number affected. */
  function attemptSave() {
    if (mode === 'edit' && permissionsChanged && assignedUsers > 0) {
      setConfirming(true);
      return;
    }
    void save();
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setConfirming(false);

    const input: RoleInput = {
      nameAr: form.nameAr,
      nameEn: form.nameEn,
      description: form.description,
      permissions: form.permissions,
      status: form.status,
      external: form.external,
    };

    const result = await safeCall(() =>
      mode === 'edit' && id ? roleService.update(id, input) : roleService.create(input),
    );

    setSaving(false);

    if (result.ok) {
      toast.success(mode === 'edit' ? t('roles.toast.updated') : t('roles.toast.created'));
      navigate(ROUTES.roles);
      return;
    }

    if (result.error.fieldErrors) {
      setErrors(
        Object.fromEntries(
          Object.entries(result.error.fieldErrors)
            .filter(([, messages]) => messages.length > 0)
            .map(([field, messages]) => [field, messages[0]]),
        ),
      );
    }
    toast.error(t('roles.toast.failed'), result.error.message);
  }

  if (loading) return <LoadingState className="py-24" />;

  if (loadError) {
    return <ErrorState description={loadError} onRetry={() => void load()} />;
  }

  const blocked =
    !form.nameAr.trim() || !form.nameEn.trim()
      ? t('roles.needName')
      : form.permissions.length === 0
        ? t('roles.needPermission')
        : null;

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeft className="flip-rtl" />}
          onClick={() => navigate(ROUTES.roles)}
        >
          {t('roles.title')}
        </Button>
      </div>

      <PageHeader
        title={mode === 'edit' ? t('roles.editTitle') : t('roles.newTitle')}
        description={mode === 'edit' ? t('roles.editDescription') : t('roles.newDescription')}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(ROUTES.roles)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button
              leadingIcon={<Save />}
              onClick={attemptSave}
              loading={saving}
              disabled={Boolean(blocked) || isOwnerRole}
            >
              {t('common.saveChanges')}
            </Button>
          </>
        }
      />

      {isOwnerRole && <Alert tone="tip">{t('roles.ownerLocked')}</Alert>}

      {mode === 'edit' && assignedUsers > 0 && (
        <Alert tone="warning" icon={<Users className="h-4 w-4" />}>
          {t('roles.affectsUsers', { count: assignedUsers })}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Role information */}
        <Card className="lg:col-span-2">
          <CardBody className="space-y-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('roles.information')}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('roles.name')} required error={errors.nameEn}>
                <Input
                  dir="ltr"
                  disabled={role?.builtIn}
                  value={form.nameEn}
                  onChange={(event) => set('nameEn', event.target.value)}
                  placeholder="Shift Supervisor"
                />
              </FormField>

              <FormField label={t('roles.nameAr')} required error={errors.nameAr}>
                <Input
                  dir="rtl"
                  disabled={role?.builtIn}
                  value={form.nameAr}
                  onChange={(event) => set('nameAr', event.target.value)}
                  placeholder="مشرف وردية"
                />
              </FormField>
            </div>

            <FormField
              label={t('roles.descriptionField')}
              hint={t('roles.descriptionHint')}
              showOptional
            >
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('roles.status')}>
                <Select
                  value={form.status}
                  disabled={isOwnerRole}
                  onChange={(value) => set('status', value as 'active' | 'inactive')}
                  options={[
                    { value: 'active', label: t('common.active') },
                    { value: 'inactive', label: t('common.inactive') },
                  ]}
                />
              </FormField>
            </div>

            {mode === 'create' && (
              <div className="rounded-md border border-ink-200 bg-ink-50/60 p-4">
                <Switch
                  checked={form.external}
                  onCheckedChange={(checked) => {
                    set('external', checked);
                    if (checked) set('permissions', []);
                  }}
                  label={t('roles.externalRole')}
                  description={t('roles.externalHint')}
                />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Live menu preview — the fastest way to understand a permission set */}
        <div className="space-y-4">
          <MenuPreview permissions={form.permissions} />
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-md font-semibold text-ink-900">{t('roles.permissionsHeading')}</h2>
          <p className="text-sm text-ink-500">{t('roles.permissionsHint')}</p>
        </div>

        {errors.permissions && (
          <Alert tone="danger" compact>
            {errors.permissions}
          </Alert>
        )}

        <PermissionMatrix
          selected={form.permissions}
          onChange={(permissions) => set('permissions', permissions)}
          readOnly={isOwnerRole}
          external={form.external}
        />
      </section>

      <ConfirmModal
        open={confirming}
        title={t('roles.confirmChangeTitle')}
        description={t('roles.confirmChangeDescription', { count: assignedUsers })}
        confirmLabel={t('roles.confirmChangeConfirm')}
        variant="warning"
        loading={saving}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      >
        <p className="text-xs text-ink-400">
          {language === 'ar' ? form.nameAr : form.nameEn}
        </p>
      </ConfirmModal>
    </div>
  );
}
