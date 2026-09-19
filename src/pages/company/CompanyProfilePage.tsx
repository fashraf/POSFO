import { useCallback, useEffect, useState } from 'react';
import { Building2, Globe, Save } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  SearchableSelect,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { companyService, safeCall } from '@/services';
import { activeSocials } from '@/types/company';
import type { CompanyProfile, CompanySocial } from '@/types/company';

const SOCIAL_KEYS: (keyof CompanySocial)[] = [
  'instagram',
  'facebook',
  'x',
  'tiktok',
  'linkedin',
  'youtube',
];

export default function CompanyProfilePage() {
  const { t } = useTranslation();
  const toast = useToast();

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await safeCall(() => companyService.get());
    if (result.ok) setProfile(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setProfile((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setErrors({});

    const { createdAt: _c, updatedAt: _u, ...input } = profile;
    const result = await safeCall(() => companyService.update(input));
    setSaving(false);

    if (result.ok) {
      setProfile(result.data);
      toast.success(t('company.toast.saved'));
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
    toast.error(t('company.toast.failed'), result.error.message);
  }

  if (loading || !profile) return <LoadingState className="py-20" />;

  const socials = activeSocials(profile.social);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('company.title')}
        description={t('company.description')}
        actions={
          <Button leadingIcon={<Save />} onClick={save} loading={saving}>
            {t('common.saveChanges')}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('company.sections.basic')}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t('company.fields.nameEn')} required error={errors.nameEn}>
                  <Input
                    inputSize="sm"
                    dir="ltr"
                    value={profile.nameEn}
                    onChange={(e) => set('nameEn', e.target.value)}
                  />
                </FormField>
                <FormField label={t('company.fields.nameAr')} required error={errors.nameAr}>
                  <Input
                    inputSize="sm"
                    dir="rtl"
                    value={profile.nameAr}
                    onChange={(e) => set('nameAr', e.target.value)}
                  />
                </FormField>
              </div>

              <FormField
                label={t('company.fields.description')}
                hint={t('company.fields.descriptionHint')}
                showOptional
              >
                <Textarea
                  rows={2}
                  value={profile.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </FormField>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('company.sections.registration')}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  label={t('company.fields.crNumber')}
                  error={errors.crNumber}
                  help={t('company.fields.crHelp')}
                >
                  <Input
                    inputSize="sm"
                    dir="ltr"
                    inputMode="numeric"
                    value={profile.crNumber}
                    onChange={(e) => set('crNumber', e.target.value)}
                  />
                </FormField>
                <FormField
                  label={t('company.fields.vatNumber')}
                  error={errors.vatNumber}
                  help={t('company.fields.vatHelp')}
                >
                  <Input
                    inputSize="sm"
                    dir="ltr"
                    inputMode="numeric"
                    value={profile.vatNumber}
                    onChange={(e) => set('vatNumber', e.target.value)}
                  />
                </FormField>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('company.sections.contact')}
              </h2>

              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label={t('company.fields.phone')}>
                  <Input
                    inputSize="sm"
                    dir="ltr"
                    value={profile.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </FormField>
                <FormField label={t('company.fields.email')} error={errors.email}>
                  <Input
                    inputSize="sm"
                    dir="ltr"
                    value={profile.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </FormField>
                <FormField label={t('company.fields.website')}>
                  <Input
                    inputSize="sm"
                    dir="ltr"
                    value={profile.website}
                    onChange={(e) => set('website', e.target.value)}
                  />
                </FormField>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('company.sections.address')}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t('company.fields.street')}>
                  <Input
                    inputSize="sm"
                    value={profile.address.street}
                    onChange={(e) =>
                      set('address', { ...profile.address, street: e.target.value })
                    }
                  />
                </FormField>
                <FormField label={t('company.fields.district')}>
                  <Input
                    inputSize="sm"
                    value={profile.address.district}
                    onChange={(e) =>
                      set('address', { ...profile.address, district: e.target.value })
                    }
                  />
                </FormField>
                <FormField label={t('company.fields.city')}>
                  <Input
                    inputSize="sm"
                    value={profile.address.city}
                    onChange={(e) => set('address', { ...profile.address, city: e.target.value })}
                  />
                </FormField>
                <FormField label={t('company.fields.postalCode')}>
                  <Input
                    inputSize="sm"
                    dir="ltr"
                    value={profile.address.postalCode}
                    onChange={(e) =>
                      set('address', { ...profile.address, postalCode: e.target.value })
                    }
                  />
                </FormField>
                <FormField label={t('company.fields.country')} className="sm:col-span-2">
                  <SearchableSelect
                    size="sm"
                    value={profile.address.country}
                    onChange={(value) =>
                      set('address', { ...profile.address, country: value ?? 'SA' })
                    }
                    options={[{ value: 'SA', label: 'Saudi Arabia' }]}
                  />
                </FormField>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('company.sections.social')}
              </h2>
              <p className="text-xs text-ink-500">{t('company.fields.socialHint')}</p>

              <div className="grid gap-3 sm:grid-cols-3">
                {SOCIAL_KEYS.map((key) => (
                  <FormField key={key} label={t(`company.fields.${key}`)} showOptional>
                    <Input
                      inputSize="sm"
                      dir="ltr"
                      value={profile.social[key]}
                      onChange={(e) => set('social', { ...profile.social, [key]: e.target.value })}
                      placeholder="@handle"
                    />
                  </FormField>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="lg:sticky lg:top-16">
            <Card>
              <CardBody className="space-y-3">
                <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                  {t('company.sections.preview')}
                </h2>

                <div className="space-y-2 rounded-md border border-dashed border-ink-300 p-4 text-center">
                  <span
                    aria-hidden
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-ink-100 text-ink-400"
                  >
                    <Building2 className="h-5 w-5" />
                  </span>

                  <div>
                    <p className="text-sm font-semibold text-ink-900">{profile.nameAr || '—'}</p>
                    <p className="text-sm font-semibold text-ink-900">{profile.nameEn || '—'}</p>
                    {profile.description && (
                      <p className="mt-0.5 text-xs text-ink-500">{profile.description}</p>
                    )}
                  </div>

                  <dl className="space-y-0.5 border-t border-dashed border-ink-200 pt-2 text-2xs text-ink-600">
                    {profile.vatNumber && (
                      <div>
                        VAT: <span className="numeric">{profile.vatNumber}</span>
                      </div>
                    )}
                    {profile.crNumber && (
                      <div>
                        CR: <span className="numeric">{profile.crNumber}</span>
                      </div>
                    )}
                  </dl>

                  {profile.website && (
                    <p className="flex items-center justify-center gap-1 text-2xs text-brand-600">
                      <Globe aria-hidden className="h-3 w-3" />
                      {profile.website}
                    </p>
                  )}

                  {socials.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1 border-t border-dashed border-ink-200 pt-2">
                      {socials.map((entry) => (
                        <span
                          key={entry.key}
                          className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs text-ink-600"
                        >
                          {entry.handle}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Alert tone="tip" compact>
                  {t('company.previewHint')}
                </Alert>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
