import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, AtSign, KeyRound } from 'lucide-react';
import { Button, FormField, Input } from '@/components/ui';
import { AuthLayout } from '../components/AuthLayout';
import { useAuth, isAuthSession } from '../context/AuthContext';
import { useTranslation } from '@/i18n';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestOtp } = useAuth();
  const [password, setPassword] = useState('');

  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
