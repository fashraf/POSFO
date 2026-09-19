import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, AtSign, KeyRound, ShieldCheck, User, UserCog } from 'lucide-react';
import { Button, FormField, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { AuthLayout } from '../components/AuthLayout';
import { useAuth, isAuthSession } from '../context/AuthContext';
import { DEV_PASSWORD } from '../services/authService';
import { useTranslation } from '@/i18n';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestOtp } = useAuth();
  const [password, setPassword] = useState(DEV_PASSWORD);

  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accounts = [
    { email: 'owner@demo.com', labelKey: 'login.owner' as const, icon: ShieldCheck },
    { email: 'manager@demo.com', labelKey: 'login.manager' as const, icon: UserCog },
    { email: 'cashier@demo.com', labelKey: 'login.cashier' as const, icon: User },
  ];

  /* One tap to sign in as a role, rather than typing a demo address by hand. */
  async function continueAs(email: string) {
    setIdentifier(email);
    setSubmitting(true);
    setError(null);

    try {
      const result = await requestOtp(email, 'login', password);

      /* Single-step mode returns a session; there is no code to enter. */
      navigate(isAuthSession(result) ? result.landingPath : '/login/otp');
    } catch (caught) {
      setError((caught as { message?: string }).message ?? null);
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    try {
      const result = await requestOtp(identifier, 'login', password);
      navigate(isAuthSession(result) ? result.landingPath : '/login/otp');
    } catch (caught) {
      const failure = caught as { fieldErrors?: Record<string, string[]>; message?: string };
      setError(
        failure.fieldErrors?.identifier?.[0] ??
          failure.fieldErrors?.password?.[0] ??
          failure.message ??
          null,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            {t('auth.createAccount')}
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <span className="block text-sm font-medium text-ink-700">
            {t('login.chooseAccount')}
          </span>

          <div className="grid grid-cols-3 gap-2">
            {accounts.map((account) => {
              const Icon = account.icon;
              return (
                <button
                  key={account.email}
                  type="button"
                  disabled={submitting}
                  onClick={() => void continueAs(account.email)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-md border border-ink-200 bg-surface px-2 py-3 transition-colors',
                    'hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-60',
                  )}
                >
                  <Icon aria-hidden className="h-4.5 w-4.5 text-brand-600" />
                  <span className="text-xs font-medium text-ink-800">{t(account.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span aria-hidden className="h-px flex-1 bg-ink-200" />
          <span className="text-2xs text-ink-400">{t('login.orEnter')}</span>
          <span aria-hidden className="h-px flex-1 bg-ink-200" />
        </div>

        <FormField
          label={t('auth.identifier')}
          required
          error={error ?? undefined}
          hint={error ? undefined : t('auth.identifierHelp')}
        >
          <Input
            dir="ltr"
            inputSize="lg"
            autoFocus
            autoComplete="username"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && identifier.trim()) void submit();
            }}
            placeholder={t('auth.identifierPlaceholder')}
            leadingAddon={<AtSign aria-hidden />}
          />
        </FormField>

        {/* Password: used only when the server is in single-step mode. In
            two-step it is ignored, so the field can stay without harm. */}
        <FormField label={t('auth.passwordLabel')} required>
          <Input
            dir="ltr"
            type="password"
            inputSize="lg"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && identifier.trim() && password) void submit();
            }}
            leadingAddon={<KeyRound aria-hidden />}
          />
        </FormField>

        <Button
          size="lg"
          fullWidth
          onClick={submit}
          loading={submitting}
          disabled={!identifier.trim() || !password}
          trailingIcon={<ArrowRight className="flip-rtl" />}
        >
          {t('auth.continue')}
        </Button>

      </div>
    </AuthLayout>
  );
}
