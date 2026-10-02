import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Layers, Wrench } from 'lucide-react';
import {
  DatePicker,
  Alert,
  Button,
  FormField,
  Input,
  ReviewRow,
  SearchableSelect,
  Switch,
  Wizard,
  type SearchableOption,
  type WizardStep,
} from '@/components/ui';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordInput, isPasswordValid } from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/cn';
import { isValidEmail, isValidSaudiMobile, normaliseMobile } from '../services/validation';
import type { RegistrationDraft } from '../types/auth.types';

const BUSINESS_TYPES = [
  'retail',
  'grocery',
  'restaurant',
  'cafe',
  'barber',
  'salon',
  'laundry',
  'repair',
  'professional',
  'education',
  'wholesale',
  'other',
] as const;

const SAUDI_CITIES = [
  'Riyadh',
  'Jeddah',
  'Mecca',
  'Medina',
  'Dammam',
  'Khobar',
  'Dhahran',
  'Taif',
  'Buraidah',
  'Tabuk',
  'Khamis Mushait',
  'Abha',
  'Hail',
  'Najran',
  'Jubail',
  'Yanbu',
];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  businessNameEn: string;
  businessNameAr: string;
  businessType: string | null;
  businessCategory: 'products' | 'services' | 'both';
  country: string;
  city: string | null;
  district: string;
  address: string;
  isVatRegistered: boolean;
  crNumber: string;
  vatNumber: string;
  taxStartDate: string;
}

/* Which wizard step holds each field, so a server refusal can reopen it. */
const OWNER_FIELDS: string[] = ['firstName', 'lastName', 'email', 'mobile', 'password', 'confirmPassword'];
const TAX_FIELDS: string[] = ['isVatRegistered', 'crNumber', 'vatNumber', 'taxStartDate'];

/* The API names business fields without the wizard's prefix. */
const SERVER_FIELD: Record<string, keyof FormState> = {
  nameEn: 'businessNameEn',
  nameAr: 'businessNameAr',
};

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  password: '',
  confirmPassword: '',
  businessNameEn: '',
  businessNameAr: '',
  businessType: null,
  businessCategory: 'products',
  country: 'SA',
  city: null,
  district: '',
  address: '',
  isVatRegistered: true,
  crNumber: '',
  vatNumber: '',
  taxStartDate: '',
};

type Touched = Partial<Record<keyof FormState, boolean>>;

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState<Touched>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setServerErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  const blur = (key: keyof FormState) => () =>
    setTouched((current) => ({ ...current, [key]: true }));

  /**
   * Field-level validity, computed fresh each render.
   *
   * Errors are only *shown* once a field has been blurred, so nobody is told
   * their email is invalid while they are still typing the first letter.
   */
  const validation = useMemo(() => {
    const errors: Partial<Record<keyof FormState, string>> = {};

    if (!form.firstName.trim()) errors.firstName = t('auth.register.errors.firstName');
    else if (/^\d+$/.test(form.firstName.trim()))
      errors.firstName = t('auth.register.errors.firstNameNumeric');

    if (!form.lastName.trim()) errors.lastName = t('auth.register.errors.lastName');

    if (!form.email.trim()) errors.email = t('auth.register.errors.email');
    else if (!isValidEmail(form.email)) errors.email = t('auth.register.errors.emailInvalid');

    if (!form.mobile.trim()) errors.mobile = t('auth.register.errors.mobile');
    else if (!isValidSaudiMobile(form.mobile))
      errors.mobile = t('auth.register.errors.mobileInvalid');

    if (!form.password) errors.password = t('auth.register.errors.password');
    else if (!isPasswordValid(form.password))
      errors.password = t('auth.register.errors.passwordWeak');

    if (form.confirmPassword !== form.password)
      errors.confirmPassword = t('auth.register.errors.passwordMismatch');

    if (!form.businessNameEn.trim())
      errors.businessNameEn = t('auth.register.errors.businessName');
    if (!form.businessNameAr.trim())
      errors.businessNameAr = t('auth.register.errors.businessNameAr');
    if (!form.businessType) errors.businessType = t('auth.register.errors.businessType');
    if (!form.city) errors.city = t('auth.register.errors.city');

    if (form.isVatRegistered) {
      if (!form.crNumber.trim()) errors.crNumber = t('auth.register.errors.crNumber');
      else if (!/^\d{10}$/.test(form.crNumber.trim()))
        errors.crNumber = t('auth.register.errors.crInvalid');

      if (!form.vatNumber.trim()) errors.vatNumber = t('auth.register.errors.vatNumber');
      else if (!/^3\d{13}3$/.test(form.vatNumber.trim()))
        errors.vatNumber = t('auth.register.errors.vatInvalid');

      if (!form.taxStartDate) errors.taxStartDate = t('auth.register.errors.taxStartDate');
      else if (new Date(form.taxStartDate).getTime() > Date.now())
        errors.taxStartDate = t('auth.register.errors.taxStartFuture');
    }

    return errors;
  }, [form, t]);

  /** Show an error only once the field has been left, or the server said so. */
  const errorFor = (key: keyof FormState) =>
    serverErrors[key] ?? (touched[key] ? validation[key] : undefined);

  const typeOptions: SearchableOption[] = BUSINESS_TYPES.map((type) => ({
    value: type,
    label: t(`auth.businessTypes.${type}`),
  }));

  const cityOptions: SearchableOption[] = SAUDI_CITIES.map((city) => ({
    value: city,
    label: city,
  }));

  async function submit() {
    setSubmitting(true);
    setServerErrors({});

    const draft: RegistrationDraft = {
      owner: {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        mobile: normaliseMobile(form.mobile),
        password: form.password,
      },
      business: {
        nameEn: form.businessNameEn.trim(),
        nameAr: form.businessNameAr.trim(),
        businessType: form.businessType ?? 'other',
        businessCategory: form.businessCategory,
        country: form.country,
        city: form.city ?? '',
        district: form.district.trim(),
        address: form.address.trim(),
      },
      tax: {
        crNumber: form.crNumber.trim(),
        vatNumber: form.vatNumber.trim(),
        taxStartDate: form.taxStartDate,
        isVatRegistered: form.isVatRegistered,
      },
    };

    try {
      await register(draft);
      navigate('/register/verify');
    } catch (caught) {
      const failure = caught as { fieldErrors?: Record<string, string[]>; message?: string };
      const entries = Object.entries(failure.fieldErrors ?? {})
        .filter(([, messages]) => messages.length > 0)
        /* The API prefixes some keys with their section ("owner.email"). */
        .map(([field, messages]) => {
          const key = field.split('.').pop() ?? field;
          return [SERVER_FIELD[key] ?? key, messages[0]] as const;
        });

      if (entries.length > 0) {
        /* A single refusal (email or mobile taken, bad VAT) carries the
           message in the reader's language; prefer it over the field text. */
        setServerErrors(
          Object.fromEntries(
            entries.length === 1 && failure.message
              ? [[entries[0][0], failure.message]]
              : entries,
          ),
        );

        /* Send them back to the step that holds the problem. */
        const field = entries[0][0];
        setStep(OWNER_FIELDS.includes(field) ? 0 : TAX_FIELDS.includes(field) ? 2 : 1);
        setTouched((current) => ({ ...current, [field]: true }));
      } else {
        /* No field to point at: show it on the review step rather than
           failing silently. */
        setServerErrors({ form: failure.message ?? t('auth.register.failed') });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const categoryChoices = [
    { value: 'products' as const, icon: Box },
    { value: 'services' as const, icon: Wrench },
    { value: 'both' as const, icon: Layers },
  ];

  const steps: WizardStep[] = [
    {
      id: 'owner',
      title: t('auth.register.steps.owner'),
      description: t('auth.register.hints.owner'),
      validate: () =>
        validation.firstName ||
        validation.lastName ||
        validation.email ||
        validation.mobile ||
        validation.password ||
        validation.confirmPassword
          ? t('auth.register.needOwner')
          : null,
      content: (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t('auth.register.fields.firstName')}
              required
              error={errorFor('firstName')}
            >
              <Input
                inputSize="sm"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                onBlur={blur('firstName')}
                autoComplete="given-name"
              />
            </FormField>

            <FormField
              label={t('auth.register.fields.lastName')}
              required
              error={errorFor('lastName')}
            >
              <Input
                inputSize="sm"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                onBlur={blur('lastName')}
                autoComplete="family-name"
              />
            </FormField>
          </div>

          <FormField
            label={t('auth.register.fields.email')}
            required
            error={errorFor('email')}
            help={t('auth.register.fields.emailHelp')}
          >
            <Input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              onBlur={blur('email')}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </FormField>

          <FormField
            label={t('auth.register.fields.mobile')}
            required
            error={errorFor('mobile')}
            help={t('auth.register.fields.mobileHelp')}
          >
            <Input
              type="tel"
              dir="ltr"
              value={form.mobile}
              onChange={(e) => set('mobile', e.target.value)}
              onBlur={blur('mobile')}
              autoComplete="tel"
              placeholder="+966 50 123 4567"
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t('auth.register.fields.password')}
              required
              error={errorFor('password')}
            >
              <PasswordInput
                showRules
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                onBlur={blur('password')}
                autoComplete="new-password"
              />
            </FormField>

            <FormField
              label={t('auth.register.fields.confirmPassword')}
              required
              error={errorFor('confirmPassword')}
            >
              <PasswordInput
                value={form.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                onBlur={blur('confirmPassword')}
                autoComplete="new-password"
              />
            </FormField>
          </div>
        </div>
      ),
    },
    {
      id: 'business',
      title: t('auth.register.steps.business'),
      description: t('auth.register.hints.business'),
      validate: () =>
        validation.businessNameEn || validation.businessNameAr || validation.businessType || validation.city
          ? t('auth.register.needBusiness')
          : null,
      content: (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t('auth.register.fields.businessNameEn')}
              required
              error={errorFor('businessNameEn')}
            >
              <Input
                inputSize="sm"
                dir="ltr"
                value={form.businessNameEn}
                onChange={(e) => set('businessNameEn', e.target.value)}
                onBlur={blur('businessNameEn')}
                placeholder="Al Noor Store"
              />
            </FormField>

            <FormField
              label={t('auth.register.fields.businessNameAr')}
              required
              error={errorFor('businessNameAr')}
            >
              <Input
                inputSize="sm"
                dir="rtl"
                value={form.businessNameAr}
                onChange={(e) => set('businessNameAr', e.target.value)}
                onBlur={blur('businessNameAr')}
                placeholder="متجر النور"
              />
            </FormField>
          </div>

          <FormField
            label={t('auth.register.fields.businessType')}
            required
            error={errorFor('businessType')}
            help={t('auth.register.fields.businessTypeHelp')}
          >
            <SearchableSelect
              size="sm"
              options={typeOptions}
              value={form.businessType}
              onChange={(value) => {
                set('businessType', value);
                setTouched((current) => ({ ...current, businessType: true }));
              }}
              isClearable
              error={Boolean(errorFor('businessType'))}
            />
          </FormField>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-ink-700">
              {t('auth.register.fields.category')}
            </span>
            <div className="grid gap-2 sm:grid-cols-3">
              {categoryChoices.map((choice) => {
                const Icon = choice.icon;
                const active = form.businessCategory === choice.value;

                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => set('businessCategory', choice.value)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-md border p-2.5 text-start transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30'
                        : 'border-ink-200 bg-surface hover:border-ink-300',
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn('h-4 w-4', active ? 'text-brand-600' : 'text-ink-400')}
                    />
                    <span className="text-sm font-medium text-ink-800">
                      {t(`auth.register.category.${choice.value}`)}
                    </span>
                    <span className="text-2xs text-ink-500">
                      {t(`auth.register.category.${choice.value}Hint`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('auth.register.fields.country')}>
              <SearchableSelect
                size="sm"
                options={[{ value: 'SA', label: 'Saudi Arabia' }]}
                value={form.country}
                onChange={(value) => set('country', value ?? 'SA')}
              />
            </FormField>

            <FormField label={t('auth.register.fields.city')} required error={errorFor('city')}>
              <SearchableSelect
                size="sm"
                options={cityOptions}
                value={form.city}
                onChange={(value) => {
                  set('city', value);
                  setTouched((current) => ({ ...current, city: true }));
                }}
                isClearable
                error={Boolean(errorFor('city'))}
              />
            </FormField>

            <FormField label={t('auth.register.fields.district')} showOptional>
              <Input value={form.district} onChange={(e) => set('district', e.target.value)} />
            </FormField>

            <FormField label={t('auth.register.fields.address')} showOptional>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </FormField>
          </div>
        </div>
      ),
    },
    {
      id: 'tax',
      title: t('auth.register.steps.tax'),
      description: t('auth.register.hints.tax'),
      validate: () =>
        validation.crNumber || validation.vatNumber || validation.taxStartDate
          ? t('auth.register.needTax')
          : null,
      content: (
        <div className="space-y-3">
          <div className="rounded-md border border-ink-200 bg-ink-50/60 p-4">
            <Switch
              checked={form.isVatRegistered}
              onCheckedChange={(checked) => set('isVatRegistered', checked)}
              label={t('auth.register.fields.vatRegistered')}
              description={t('auth.register.fields.vatRegisteredHelp')}
            />
          </div>

          {form.isVatRegistered ? (
            <>
              <FormField
                label={t('auth.register.fields.crNumber')}
                required
                error={errorFor('crNumber')}
                help={t('auth.register.fields.crHelp')}
              >
                <Input
                  inputSize="sm"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.crNumber}
                  onChange={(e) => set('crNumber', e.target.value)}
                  onBlur={blur('crNumber')}
                  placeholder="1010123456"
                />
              </FormField>

              <FormField
                label={t('auth.register.fields.vatNumber')}
                required
                error={errorFor('vatNumber')}
                help={t('auth.register.fields.vatHelp')}
              >
                <Input
                  inputSize="sm"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.vatNumber}
                  onChange={(e) => set('vatNumber', e.target.value)}
                  onBlur={blur('vatNumber')}
                  placeholder="300000000000003"
                />
              </FormField>

              <FormField
                label={t('auth.register.fields.taxStartDate')}
                required
                error={errorFor('taxStartDate')}
                help={t('auth.register.fields.taxStartHelp')}
              >
                <DatePicker
                size="sm"
                value={form.taxStartDate}
                onChange={(value) => set('taxStartDate', value)}
                />
              </FormField>
            </>
          ) : (
            <Alert tone="info">{t('auth.register.fields.vatRegisteredHelp')}</Alert>
          )}
        </div>
      ),
    },
    {
      id: 'review',
      title: t('auth.register.steps.review'),
      description: t('auth.register.hints.review'),
      content: (
        <div className="space-y-3">
          {Object.keys(serverErrors).length > 0 && (
            <Alert tone="danger">{Object.values(serverErrors)[0]}</Alert>
          )}

          {[
            {
              heading: t('auth.register.review.personal'),
              stepIndex: 0,
              rows: [
                {
                  label: t('auth.register.fields.firstName'),
                  value: `${form.firstName} ${form.lastName}`.trim() || '—',
                },
                { label: t('auth.register.fields.email'), value: form.email || '—' },
                {
                  label: t('auth.register.fields.mobile'),
                  value: form.mobile ? normaliseMobile(form.mobile) : '—',
                },
              ],
            },
            {
              heading: t('auth.register.review.business'),
              stepIndex: 1,
              rows: [
                {
                  label: t('auth.register.fields.businessNameEn'),
                  value: form.businessNameEn || '—',
                },
                {
                  label: t('auth.register.fields.businessType'),
                  value: form.businessType ? t(`auth.businessTypes.${form.businessType}` as never) : '—',
                },
                {
                  label: t('auth.register.fields.category'),
                  value: t(`auth.register.category.${form.businessCategory}`),
                },
                { label: t('auth.register.fields.city'), value: form.city ?? '—' },
              ],
            },
            {
              heading: t('auth.register.review.tax'),
              stepIndex: 2,
              rows: form.isVatRegistered
                ? [
                    { label: t('auth.register.fields.crNumber'), value: form.crNumber || '—' },
                    { label: t('auth.register.fields.vatNumber'), value: form.vatNumber || '—' },
                    {
                      label: t('auth.register.fields.taxStartDate'),
                      value: form.taxStartDate || '—',
                    },
                  ]
                : [
                    {
                      label: t('auth.register.fields.vatRegistered'),
                      value: t('auth.register.review.notRegistered'),
                    },
                  ],
            },
          ].map((section) => (
            <div key={section.heading} className="rounded-md border border-ink-200 bg-surface">
              <div className="flex items-center justify-between border-b border-dashed border-ink-200 px-4 py-2.5">
                <h3 className="text-sm font-medium text-ink-800">{section.heading}</h3>
                <Button variant="link" size="sm" onClick={() => setStep(section.stepIndex)}>
                  {t('auth.register.review.edit')}
                </Button>
              </div>
              <dl className="divide-dotted-y px-4">
                {section.rows.map((row) => (
                  <ReviewRow key={row.label} label={row.label} value={row.value} />
                ))}
              </dl>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <AuthLayout
      wide
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <div className="min-h-[22rem]">
        <Wizard
          steps={steps}
          currentIndex={step}
          onStepChange={setStep}
          onComplete={submit}
          onCancel={() => navigate('/login')}
          submitting={submitting}
          completeLabel={t('auth.register.review.submit')}
        />
      </div>
    </AuthLayout>
  );
}
