import { useEffect, useMemo, useState } from 'react';
import { CreditCard, UserPlus } from 'lucide-react';
import {
  Alert,
  Button,
  CurrencyDisplay,
  FormField,
  Input,
  Modal,
  NextStepHint,
  PriceInput,
  ReviewRow,
  Switch,
  Wizard,
  type WizardStep,
} from '@/components/ui';
import { toMinorUnits } from '@/lib/format';
import { useTranslation } from '@/i18n';
import type { CustomerInput } from '@/services';

interface FormState {
  nameAr: string;
  nameEn: string;
  phone: string;
  email: string;
  allowCredit: boolean;
  creditLimit: string;
  openingBalance: string;
}

const EMPTY: FormState = {
  nameAr: '',
  nameEn: '',
  phone: '',
  email: '',
  allowCredit: true,
  creditLimit: '1000.00',
  openingBalance: '',
};

export interface CustomerWizardProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CustomerInput) => Promise<boolean>;
}

export function CustomerWizard({ open, onClose, onSubmit }: CustomerWizardProps) {
  const { t } = useTranslation();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setForm(EMPTY);
    setErrors({});
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  const creditLimitH = form.allowCredit ? toMinorUnits(form.creditLimit || '0') : 0;
  const openingBalanceH = form.allowCredit ? toMinorUnits(form.openingBalance || '0') : 0;

  const displayName = form.nameEn.trim() || form.nameAr.trim() || '—';

  async function complete() {
    setSubmitting(true);
    setErrors({});

    try {
      const succeeded = await onSubmit({
        nameAr: form.nameAr,
        nameEn: form.nameEn,
        phone: form.phone,
        email: form.email,
        creditLimitH,
        openingBalanceH,
      });
      if (succeeded) onClose();
    } catch (caught) {
      const fieldErrors = (caught as { fieldErrors?: Record<string, string[]> }).fieldErrors;
      if (fieldErrors) {
        const mapped = Object.fromEntries(
          Object.entries(fieldErrors)
            .filter(([, messages]) => messages.length > 0)
            .map(([field, messages]) => [field, messages[0]]),
        );
        setErrors(mapped);

        /* Send the person back to the step that actually holds the problem,
           rather than leaving them on the review with an error they cannot see. */
        const identityFields = ['nameAr', 'nameEn', 'phone', 'email'];
        setStep(Object.keys(mapped).some((key) => identityFields.includes(key)) ? 0 : 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const steps: WizardStep[] = useMemo(
    () => [
      {
        id: 'identity',
        title: t('customers.wizard.steps.identity'),
        description: t('customers.wizard.steps.identityHint'),
        validate: () => {
          if (!form.nameAr.trim() || !form.nameEn.trim()) return t('customers.wizard.needName');
          if (!form.phone.trim()) return t('customers.wizard.needPhone');
          return null;
        },
        content: (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('users.fields.nameAr')} required error={errors.nameAr}>
                <Input
                  value={form.nameAr}
                  onChange={(event) => set('nameAr', event.target.value)}
                  dir="rtl"
                  placeholder="أحمد علي"
                />
              </FormField>

              <FormField label={t('users.fields.nameEn')} required error={errors.nameEn}>
                <Input
                  value={form.nameEn}
                  onChange={(event) => set('nameEn', event.target.value)}
                  dir="ltr"
                  placeholder="Ahmed Ali"
                />
              </FormField>
            </div>

            <FormField
              label={t('users.fields.phone')}
              required
              error={errors.phone}
              help={t('customers.wizard.needPhone')}
            >
              <Input
                dir="ltr"
                value={form.phone}
                onChange={(event) => set('phone', event.target.value)}
                placeholder="+966 50 123 4567"
              />
            </FormField>

            <FormField label={t('users.fields.email')} showOptional error={errors.email}>
              <Input
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(event) => set('email', event.target.value)}
              />
            </FormField>
          </div>
        ),
      },
      {
        id: 'credit',
        title: t('customers.wizard.steps.credit'),
        description: t('customers.wizard.steps.creditHint'),
        validate: () => {
          if (!form.allowCredit) return null;
          if (creditLimitH < 0) return t('customers.wizard.needValidLimit');
          if (openingBalanceH > creditLimitH) return t('customers.wizard.openingAboveLimit');
          return null;
        },
        content: (
          <div className="space-y-4">
            <div className="rounded-md border border-ink-200 bg-surface p-4">
              <Switch
                checked={form.allowCredit}
                onCheckedChange={(checked) => set('allowCredit', checked)}
                label={t('customers.wizard.allowCredit')}
                description={t('customers.wizard.allowCreditHint')}
              />
            </div>

            {form.allowCredit ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label={t('customers.wizard.creditLimit')}
                    required
                    error={errors.creditLimitH}
                    help={t('customers.wizard.creditLimitHelp')}
                  >
                    <PriceInput
                      value={form.creditLimit}
                      onChange={(event) => set('creditLimit', event.target.value)}
                    />
                  </FormField>

                  <FormField
                    label={t('customers.wizard.openingBalance')}
                    showOptional
                    error={errors.openingBalanceH}
                    help={t('customers.wizard.openingBalanceHelp')}
                  >
                    <PriceInput
                      value={form.openingBalance}
                      onChange={(event) => set('openingBalance', event.target.value)}
                      placeholder="0.00"
                    />
                  </FormField>
                </div>

                <Alert tone="tip" compact>
                  {t('customers.wizard.creditLimitHelp')}
                </Alert>
              </>
            ) : (
              <Alert tone="info" icon={<CreditCard className="h-4 w-4" />}>
                {t('customers.wizard.cashOnlyNote')}
              </Alert>
            )}
          </div>
        ),
      },
      {
        id: 'review',
        title: t('customers.wizard.steps.review'),
        description: t('customers.wizard.steps.reviewHint'),
        content: (
          <div className="space-y-4">
            <dl className="divide-y divide-ink-200 rounded-md border border-ink-200 bg-surface px-4">
              <ReviewRow label={t('users.fields.nameEn')} value={displayName} />
              <ReviewRow label={t('users.fields.nameAr')} value={form.nameAr.trim() || '—'} />
              <ReviewRow
                label={t('users.fields.phone')}
                value={<span dir="ltr">{form.phone.trim() || '—'}</span>}
              />
              <ReviewRow
                label={t('users.fields.email')}
                value={form.email.trim() || '—'}
                muted={!form.email.trim()}
              />
              <ReviewRow
                label={t('customers.wizard.creditLimit')}
                value={
                  form.allowCredit ? (
                    <CurrencyDisplay amount={creditLimitH} />
                  ) : (
                    t('customers.credit.none')
                  )
                }
                muted={!form.allowCredit}
              />
              {form.allowCredit && openingBalanceH > 0 && (
                <ReviewRow
                  label={t('customers.wizard.openingBalance')}
                  value={<CurrencyDisplay amount={openingBalanceH} />}
                />
              )}
            </dl>

            <NextStepHint>{t('customers.wizard.nextAfterCreate')}</NextStepHint>
          </div>
        ),
      },
    ],
    [t, form, errors, creditLimitH, openingBalanceH, displayName],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={!submitting}
      title={
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-600"
          >
            <UserPlus className="h-4 w-4" />
          </span>
          {t('customers.wizard.title')}
        </span>
      }
    >
      <div className="min-h-[24rem]">
        <Wizard
          steps={steps}
          currentIndex={step}
          onStepChange={setStep}
          onComplete={complete}
          onCancel={onClose}
          submitting={submitting}
          completeLabel={t('customers.addCustomer')}
        />
      </div>
    </Modal>
  );
}

/** Small helper so the payment modal can reuse the same button styling. */
export function PayFullButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}
