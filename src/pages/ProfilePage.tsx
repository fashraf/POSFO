import { useState } from 'react';
import { KeyRound, Mail, Save, Smartphone } from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  FormField,
  Input,
  Modal,
  SearchableSelect,
  StatusBadge,
} from '@/components/ui';
import { PasswordInput, isPasswordValid } from '@/features/auth/components/PasswordInput';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation } from '@/i18n';
import { LANGUAGES, LANGUAGE_META } from '@/i18n';
import { formatDate } from '@/lib/format';

/** Compact, dense, and mostly read-only — a profile is not a settings screen. */
export default function ProfilePage() {
  const { t } = useTranslation();
  const { language, setLanguage } = useI18n();
  const { user, role, activeBranch } = useSession();
  const toast = useToast();

  const [changingPassword, setChangingPassword] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  if (!user) return null;

  const displayName = nameOf(user);

  function submitPassword() {
    if (!isPasswordValid(next)) {
      setError(t('profile.security.weak'));
      return;
    }
    if (next !== confirm) {
      setError(t('profile.security.mismatch'));
      return;
    }

    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setChangingPassword(false);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success(t('profile.security.changed'));
    }, 500);
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{t('profile.title')}</h1>
        <p className="text-sm text-ink-500">{t('profile.description')}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Identity summary */}
        <Card>
          <CardBody className="space-y-3 text-center">
            <Avatar name={displayName} size="lg" className="mx-auto h-16 w-16 text-lg" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-ink-900">{displayName}</p>
              <p className="text-xs text-ink-400" dir="ltr">
                {user.email}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {role && <Badge tone="brand">{nameOf(role)}</Badge>}
              {activeBranch && <Badge tone="neutral">{nameOf(activeBranch)}</Badge>}
            </div>
          </CardBody>
        </Card>

        <div className="space-y-3">
          {/* Personal */}
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('profile.sections.personal')}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t('profile.fields.firstName')}>
                  <Input inputSize="sm" defaultValue={user.firstName} />
                </FormField>
                <FormField label={t('profile.fields.lastName')}>
                  <Input inputSize="sm" defaultValue={user.lastName} />
                </FormField>
                <FormField label={t('profile.fields.nameAr')}>
                  <Input inputSize="sm" dir="rtl" defaultValue={user.nameAr} />
                </FormField>
                <FormField label={t('profile.fields.nameEn')}>
                  <Input inputSize="sm" dir="ltr" defaultValue={user.nameEn} />
                </FormField>
                <FormField label={t('profile.fields.email')}>
                  <Input inputSize="sm" dir="ltr" defaultValue={user.email} />
                </FormField>
                <FormField label={t('profile.fields.mobile')}>
                  <Input inputSize="sm" dir="ltr" defaultValue={user.phone} />
                </FormField>
              </div>

              <div className="flex justify-end">
                <Button size="sm" leadingIcon={<Save />} onClick={() => toast.success(t('profile.saved'))}>
                  {t('profile.save')}
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Account */}
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('profile.sections.account')}
              </h2>

              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3 border-b border-dashed border-ink-200 pb-2">
                  <dt className="text-ink-500">{t('profile.fields.username')}</dt>
                  <dd className="font-medium text-ink-800" dir="ltr">
                    {user.username}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-dashed border-ink-200 pb-2">
                  <dt className="text-ink-500">{t('profile.fields.role')}</dt>
                  <dd className="font-medium text-ink-800">{role ? nameOf(role) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-dashed border-ink-200 pb-2">
                  <dt className="text-ink-500">{t('profile.fields.branch')}</dt>
                  <dd className="font-medium text-ink-800">
                    {activeBranch ? nameOf(activeBranch) : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-dashed border-ink-200 pb-2">
                  <dt className="text-ink-500">{t('profile.fields.status')}</dt>
                  <dd>
                    <StatusBadge status={user.status === 'active' ? 'active' : 'inactive'} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('profile.fields.lastLogin')}</dt>
                  <dd className="font-medium text-ink-800">
                    {user.lastActiveAt
                      ? formatDate(user.lastActiveAt, { language, withTime: true })
                      : '—'}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {/* Security */}
          <Card>
            <CardBody className="space-y-2">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('profile.sections.security')}
              </h2>

              {[
                {
                  icon: KeyRound,
                  label: t('profile.security.password'),
                  hint: t('profile.security.passwordHint'),
                  action: t('profile.security.changePassword'),
                  onClick: () => setChangingPassword(true),
                },
                {
                  icon: Mail,
                  label: t('profile.fields.email'),
                  hint: user.email,
                  action: t('profile.security.changeEmail'),
                  onClick: () => toast.info(t('profile.security.changeEmail')),
                },
                {
                  icon: Smartphone,
                  label: t('profile.fields.mobile'),
                  hint: user.phone || '—',
                  action: t('profile.security.changeMobile'),
                  onClick: () => toast.info(t('profile.security.changeMobile')),
                },
              ].map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded-md border border-ink-200 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon aria-hidden className="h-4 w-4 shrink-0 text-ink-400" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-800">{row.label}</span>
                        <span className="block truncate text-2xs text-ink-400" dir="ltr">
                          {row.hint}
                        </span>
                      </span>
                    </span>
                    <Button size="sm" variant="outline" onClick={row.onClick}>
                      {row.action}
                    </Button>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {/* Preferences */}
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('profile.sections.preferences')}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t('profile.fields.language')}>
                  <SearchableSelect
                    size="sm"
                    value={language}
                    onChange={(value) => value && setLanguage(value as (typeof LANGUAGES)[number])}
                    options={LANGUAGES.map((code) => ({
                      value: code,
                      label: LANGUAGE_META[code].nativeLabel,
                    }))}
                  />
                </FormField>

                <FormField
                  label={t('profile.fields.landingPage')}
                  help={t('profile.fields.landingHelp')}
                >
                  <SearchableSelect
                    size="sm"
                    value="/dashboard"
                    onChange={() => undefined}
                    options={[
                      { value: '/dashboard', label: t('nav.dashboard') },
                      { value: '/pos', label: t('nav.pos') },
                      { value: '/sales', label: t('nav.sales') },
                    ]}
                  />
                </FormField>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
        title={t('profile.security.changePassword')}
        size="sm"
        dismissible={!saving}
        footer={
          <>
            <Button variant="outline" onClick={() => setChangingPassword(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitPassword} loading={saving}>
              {t('common.saveChanges')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label={t('profile.security.current')} required>
            <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} />
          </FormField>

          <FormField label={t('profile.security.newPassword')} required>
            <PasswordInput
              showRules
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                setError(null);
              }}
            />
          </FormField>

          <FormField label={t('profile.security.confirmPassword')} required>
            <PasswordInput
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
            />
          </FormField>

          {error && (
            <Alert tone="danger" compact>
              {error}
            </Alert>
          )}
        </div>
      </Modal>
    </div>
  );
}
