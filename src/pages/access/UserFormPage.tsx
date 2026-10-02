import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Minus, Plus, Save, ShieldAlert } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  ErrorState,
  FormField,
  InfoHint,
  Input,
  LoadingState,
  PageHeader,
  Select,
  RecordMeta,
  Tooltip,
} from '@/components/ui';
import { MenuPreview } from '@/features/access/MenuPreview';
import { useToast } from '@/contexts/ToastContext';
import { CommissionBadge } from '@/features/finance/CommissionBadge';
import { useI18n, useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/routes/paths';
import { branchService, commissionService, roleService, safeCall, userService } from '@/services';
import type { CommissionRule } from '@/types/finance';
import {
  EXTERNAL_FORBIDDEN,
  MODULE_ORDER,
  effectivePermissions,
  originOf,
  permissionsFor,
} from '@/types/permissions';
import type {
  Branch,
  PermissionKey,
  PermissionOrigin,
  Role,
  User,
  UserInput,
  UserStatus,
} from '@/types/permissions';

interface FormState {
  firstName: string;
  lastName: string;
  nameAr: string;
  nameEn: string;
  username: string;
  password: string;
  confirmPassword: string;
  employeeId: string;
  status: UserStatus;
  roleId: string;
  branchIds: string[];
  defaultBranchId: string;
  phone: string;
  email: string;
  address: string;
  accessExpiresAt: string;
  ticketReference: string;
  extraPermissions: PermissionKey[];
  deniedPermissions: PermissionKey[];
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  nameAr: '',
  nameEn: '',
  username: '',
  password: '',
  confirmPassword: '',
  employeeId: '',
  status: 'invited',
  roleId: '',
  branchIds: [],
  defaultBranchId: '',
  phone: '',
  email: '',
  address: '',
  accessExpiresAt: '',
  ticketReference: '',
  extraPermissions: [],
  deniedPermissions: [],
};

const ORIGIN_STYLES: Record<Exclude<PermissionOrigin, 'none'>, string> = {
  inherited: 'bg-brand-50 text-brand-700 ring-brand-100',
  granted: 'bg-success-50 text-success-700 ring-success-100',
  denied: 'bg-danger-50 text-danger-700 ring-danger-100',
};

function toDateInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

function defaultExpiry(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

/**
 * `/users/new` and `/users/:id/edit`.
 *
 * Two columns: everything about the person on the left, everything about what
 * they can reach on the right. The right column is not a second form — it is a
 * live answer to "what will this account actually be able to do?", which is the
 * question an administrator is really asking.
 */
export default function UserFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [roles, setRoles] = useState<Role[]>([]);
  const [commissionRules, setCommissionRules] = useState<CommissionRule[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [existing, setExisting] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [roleResult, ruleResult, branchResult] = await Promise.all([
      safeCall(() => roleService.list()),
      safeCall(() => commissionService.rules()),
      safeCall(() => branchService.listAll()),
    ]);

    if (roleResult.ok) setRoles(roleResult.data);
    if (ruleResult.ok) setCommissionRules(ruleResult.data);
    if (branchResult.ok) setBranches(branchResult.data);

    if (mode === 'edit' && id) {
      const userResult = await safeCall(() => userService.get(id));
      if (userResult.ok) {
        const user = userResult.data;
        setExisting(user);
        setForm({
          ...EMPTY,
          firstName: user.firstName,
          lastName: user.lastName,
          nameAr: user.nameAr,
          nameEn: user.nameEn,
          username: user.username,
          employeeId: user.employeeId,
          status: user.status,
          roleId: user.roleId,
          branchIds: user.branchIds,
          defaultBranchId: user.defaultBranchId ?? '',
          phone: user.phone,
          email: user.email,
          address: user.address,
          accessExpiresAt: toDateInput(user.accessExpiresAt),
          ticketReference: user.ticketReference ?? '',
          extraPermissions: user.extraPermissions,
          deniedPermissions: user.deniedPermissions,
        });
      } else {
        setLoadError(userResult.error.message);
      }
    } else if (roleResult.ok && branchResult.ok) {
      const firstInternal = roleResult.data.find((role) => !role.external);
      const firstBranch = branchResult.data[0];
      setForm((current) => ({
        ...current,
        roleId: firstInternal?.id ?? roleResult.data[0]?.id ?? '',
        branchIds: firstBranch ? [firstBranch.id] : [],
        defaultBranchId: firstBranch?.id ?? '',
      }));
    }

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

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === form.roleId),
    [roles, form.roleId],
  );
  const isExternal = selectedRole?.external ?? false;

  /* The permission set the user will actually hold, recomputed as the role or
     the overrides change. Same function the app uses at runtime. */
  const effective = useMemo(
    () =>
      effectivePermissions(
        { extraPermissions: form.extraPermissions, deniedPermissions: form.deniedPermissions },
        selectedRole,
      ),
    [form.extraPermissions, form.deniedPermissions, selectedRole],
  );

  /**
   * Clicking a permission cycles it through the three meaningful states rather
   * than being a plain checkbox, because "off" is ambiguous: it could mean the
   * role never granted it, or that it was deliberately taken away.
   */
  function cyclePermission(key: PermissionKey) {
    const origin = originOf(key, selectedRole, form);

    if (origin === 'inherited') {
      set('deniedPermissions', [...form.deniedPermissions, key]);
      return;
    }
    if (origin === 'denied') {
      set(
        'deniedPermissions',
        form.deniedPermissions.filter((entry) => entry !== key),
      );
      return;
    }
    if (origin === 'granted') {
      set(
        'extraPermissions',
        form.extraPermissions.filter((entry) => entry !== key),
      );
      return;
    }
    set('extraPermissions', [...form.extraPermissions, key]);
  }

  function changeRole(roleId: string) {
    const role = roles.find((candidate) => candidate.id === roleId);
    setForm((current) => ({
      ...current,
      roleId,
      /* Overrides were relative to the old role, so they no longer mean what
         they meant. Clearing is honest; keeping them would be misleading. */
      extraPermissions: [],
      deniedPermissions: [],
      accessExpiresAt:
        role?.external && !current.accessExpiresAt ? defaultExpiry() : current.accessExpiresAt,
    }));
    setErrors({});
  }

  function toggleBranch(branchId: string, checked: boolean) {
    setForm((current) => {
      const branchIds = checked
        ? [...current.branchIds, branchId]
        : current.branchIds.filter((entry) => entry !== branchId);

      return {
        ...current,
        branchIds,
        /* Keep the default valid: if it was just removed, fall back to the
           first branch still assigned. */
        defaultBranchId: branchIds.includes(current.defaultBranchId)
          ? current.defaultBranchId
          : (branchIds[0] ?? ''),
      };
    });
    setErrors({});
  }

  async function save() {
    if (form.password && form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: t('users.passwordMismatch') });
      return;
    }

    setSaving(true);
    setErrors({});

    const input: UserInput = {
      firstName: form.firstName,
      lastName: form.lastName,
      nameAr: form.nameAr,
      nameEn: form.nameEn || `${form.firstName} ${form.lastName}`.trim(),
      username: form.username,
      email: form.email,
      phone: form.phone,
      address: form.address,
      employeeId: form.employeeId,
      roleId: form.roleId,
      defaultBranchId: form.defaultBranchId || null,
      branchIds: form.branchIds,
      status: form.status,
      extraPermissions: form.extraPermissions,
      deniedPermissions: form.deniedPermissions,
      accessExpiresAt: form.accessExpiresAt
        ? new Date(`${form.accessExpiresAt}T00:00:00.000Z`).toISOString()
        : null,
      ticketReference: form.ticketReference.trim() || null,
      password: form.password || undefined,
    };

    const result = await safeCall(() =>
      mode === 'edit' && id ? userService.update(id, input) : userService.create(input),
    );

    setSaving(false);

    if (result.ok) {
      toast.success(mode === 'edit' ? t('users.toast.updated') : t('users.toast.created'));
      navigate(ROUTES.users);
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
    toast.error(t('users.toast.failed'), result.error.message);
  }

  if (loading) return <LoadingState className="py-24" />;
  if (loadError) return <ErrorState description={loadError} onRetry={() => void load()} />;

  const displayName =
    form.nameEn.trim() || `${form.firstName} ${form.lastName}`.trim() || t('users.newTitle');

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeft className="flip-rtl" />}
          onClick={() => navigate(ROUTES.users)}
        >
          {t('users.title')}
        </Button>
      </div>

      <PageHeader
        title={mode === 'edit' ? t('users.editTitle') : t('users.newTitle')}
        description={mode === 'edit' ? t('users.editDescription') : t('users.newDescription')}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(ROUTES.users)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button leadingIcon={<Save />} onClick={save} loading={saving}>
              {t('common.saveChanges')}
            </Button>
          </>
        }
      />

      {/* col-8 / col-4 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Personal */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('users.sections.personal')}
              </h2>

              <div className="flex items-center gap-4">
                <Avatar name={displayName} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-md font-semibold text-ink-900">{displayName}</p>
                  <p className="text-sm text-ink-400">
                    {selectedRole ? (language === 'ar' ? selectedRole.nameAr : selectedRole.nameEn) : '—'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('users.fields.firstName')} required error={errors.firstName}>
                  <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
                </FormField>
                <FormField label={t('users.fields.lastName')} required error={errors.lastName}>
                  <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
                </FormField>
                <FormField label={t('users.fields.nameAr')} required error={errors.nameAr}>
                  <Input dir="rtl" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
                </FormField>
                <FormField label={t('users.fields.nameEn')} showOptional>
                  <Input dir="ltr" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
                </FormField>
              </div>
            </CardBody>
          </Card>

          {/* Account */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('users.sections.account')}
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={t('users.fields.username')}
                  required
                  error={errors.username}
                  help={t('users.fields.usernameHint')}
                >
                  <Input dir="ltr" value={form.username} onChange={(e) => set('username', e.target.value)} />
                </FormField>

                <FormField label={t('users.fields.employeeId')} showOptional>
                  <Input dir="ltr" value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} />
                </FormField>

                <FormField
                  label={t('users.fields.password')}
                  required={mode === 'create'}
                  error={errors.password}
                  hint={mode === 'edit' ? t('users.fields.passwordEditHint') : t('users.fields.passwordHint')}
                >
                  <Input
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                  />
                </FormField>

                <FormField
                  label={t('users.fields.confirmPassword')}
                  required={mode === 'create'}
                  error={errors.confirmPassword}
                >
                  <Input
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(e) => set('confirmPassword', e.target.value)}
                  />
                </FormField>

                <FormField label={t('users.fields.status')}>
                  <Select
                    value={form.status}
                    onChange={(value) => set('status', value as UserStatus)}
                    options={[
                      { value: 'invited', label: t('users.status.invited') },
                      { value: 'active', label: t('users.status.active') },
                      { value: 'suspended', label: t('users.status.suspended') },
                    ]}
                  />
                </FormField>
              </div>
            </CardBody>
          </Card>

          {/* Business access */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('users.sections.access')}
              </h2>

              <FormField
                label={t('users.fields.role')}
                required
                error={errors.roleId}
                help={t('users.fields.roleHint')}
              >
                <Select
                  value={form.roleId}
                  onChange={(value) => changeRole(value)}
                  options={roles.map((role) => ({
                    value: role.id,
                    label: role.external
                      ? `${language === 'ar' ? role.nameAr : role.nameEn} — ${t('users.external.badge')}`
                      : language === 'ar'
                        ? role.nameAr
                        : role.nameEn,
                  }))}
                />
              </FormField>

              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
                  {t('users.fields.branch')}
                  <InfoHint content={t('users.fields.branchHint')} />
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {branches.map((branch) => (
                    <div key={branch.id} className="rounded-md border border-ink-200 px-3 py-2.5">
                      <Checkbox
                        checked={form.branchIds.includes(branch.id)}
                        onChange={(e) => toggleBranch(branch.id, e.target.checked)}
                        label={language === 'ar' ? branch.nameAr : branch.nameEn}
                        description={branch.code}
                      />
                    </div>
                  ))}
                </div>
                {errors.branchIds && (
                  <p className="text-xs text-danger-600">{errors.branchIds}</p>
                )}
              </div>

              <FormField
                label={t('users.fields.defaultBranch')}
                error={errors.defaultBranchId}
                help={t('users.fields.defaultBranchHint')}
              >
                <Select
                  value={form.defaultBranchId}
                  onChange={(value) => set('defaultBranchId', value)}
                  options={branches
                    .filter((branch) => form.branchIds.includes(branch.id))
                    .map((branch) => ({
                      value: branch.id,
                      label: language === 'ar' ? branch.nameAr : branch.nameEn,
                    }))}
                />
              </FormField>

              {isExternal && (
                <div className="space-y-4 rounded-md border border-info-100 bg-info-50/60 p-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info-600" />
                    <div className="space-y-0.5">
                      <p className="text-base font-medium text-info-800">
                        {t('users.external.title')}
                      </p>
                      <p className="text-sm text-info-700">{t('users.external.description')}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label={t('users.fields.expiry')}
                      required
                      error={errors.accessExpiresAt}
                    >
                      <DatePicker
                size="sm"
                value={form.accessExpiresAt}
                onChange={(value) => set('accessExpiresAt', value)}
                />
                    </FormField>

                    <FormField
                      label={t('users.fields.ticket')}
                      required
                      error={errors.ticketReference}
                    >
                      <Input
                        dir="ltr"
                        placeholder="TCK-1234"
                        value={form.ticketReference}
                        onChange={(e) => set('ticketReference', e.target.value)}
                      />
                    </FormField>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Contact */}
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('users.sections.contact')}
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('users.fields.phone')} showOptional>
                  <Input dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </FormField>
                <FormField label={t('users.fields.email')} required error={errors.email}>
                  <Input type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} />
                </FormField>
                <FormField label={t('users.fields.address')} showOptional className="sm:col-span-2">
                  <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
                </FormField>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* col-4 — access */}
        <div className="space-y-4">
          <div className="lg:sticky lg:top-20 lg:space-y-4">
            <MenuPreview permissions={effective} />

            <Card>
              <CardBody className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-ink-900">
                    {t('users.sections.permissions')}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-500">{t('users.origin.legend')}</p>
                </div>

                {/* Legend — the three states are meaningless without it */}
                <div className="flex flex-wrap gap-1.5">
                  {(['inherited', 'granted', 'denied'] as const).map((origin) => (
                    <Tooltip key={origin} content={t(`users.origin.${origin}Hint`)}>
                      <Badge
                        tone={
                          origin === 'inherited'
                            ? 'brand'
                            : origin === 'granted'
                              ? 'success'
                              : 'danger'
                        }
                      >
                        {t(`users.origin.${origin}`)}
                      </Badge>
                    </Tooltip>
                  ))}
                </div>

                {errors.extraPermissions && (
                  <Alert tone="danger" compact>
                    {errors.extraPermissions}
                  </Alert>
                )}

                <div className="max-h-[32rem] space-y-3 overflow-y-auto pe-1">
                  {MODULE_ORDER.map((module) => {
                    const permissions = permissionsFor(module);
                    const anyHeld = permissions.some((permission) =>
                      effective.includes(permission.key),
                    );

                    return (
                      <div key={module}>
                        <p
                          className={cn(
                            'pb-1 text-2xs font-semibold uppercase tracking-wider',
                            anyHeld ? 'text-ink-600' : 'text-ink-300',
                          )}
                        >
                          {t(`modules.${module}`)}
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                          {permissions.map((permission) => {
                            const origin = originOf(permission.key, selectedRole, form);
                            const blocked =
                              isExternal && EXTERNAL_FORBIDDEN.includes(permission.key);

                            return (
                              <button
                                key={permission.key}
                                type="button"
                                disabled={blocked}
                                onClick={() => cyclePermission(permission.key)}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset transition-colors',
                                  origin === 'none'
                                    ? 'bg-surface text-ink-400 ring-ink-200 hover:text-ink-600'
                                    : ORIGIN_STYLES[origin],
                                  blocked && 'cursor-not-allowed opacity-50',
                                )}
                              >
                                {origin === 'denied' ? (
                                  <Minus aria-hidden className="h-2.5 w-2.5" />
                                ) : origin !== 'none' ? (
                                  <Check aria-hidden className="h-2.5 w-2.5" />
                                ) : (
                                  <Plus aria-hidden className="h-2.5 w-2.5" />
                                )}
                                {t(`actions.${permission.action}`)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {existing && mode === 'edit' && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Whether this person earns commission belongs on their record, not
              only on a finance screen their manager may never open. */}
          <CommissionBadge rules={commissionRules} userId={existing.id} variant="full" />

          <RecordMeta
            createdAt={existing.createdAt}
            updatedAt={existing.updatedAt}
            variant="inline"
          />
        </div>
      )}
    </div>
  );
}
