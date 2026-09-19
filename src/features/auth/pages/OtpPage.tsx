import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { AuthLayout } from '../components/AuthLayout';
import { OtpInput } from '../components/OtpInput';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '@/i18n';

/**
 * One OTP screen serves both flows.
 *
 * `purpose` on the pending verification decides what happens on success:
 * a login establishes a session, a registration hands the person to a first
 * sign-in. The screen itself is identical, so it is one component.
 */
export default function OtpPage({ purpose }: { purpose: 'login' | 'register' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pending, verifyOtp, resendOtp } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  /* Landing here without a pending verification means a refresh or a deep
     link. Send them back to the start rather than showing an empty screen. */
  useEffect(() => {
    if (!pending && !verified) {
      navigate(purpose === 'login' ? '/login' : '/register', { replace: true });
    }
  }, [pending, verified, purpose, navigate]);

  async function verify(value: string) {
    if (value.length < 4 || verifying) return;

    setVerifying(true);
    setError(null);

    try {
      const session = await verifyOtp(value);
      setVerified(true);

      if (purpose === 'login') {
        /* Land wherever the role belongs — a cashier goes to the till. */
        window.setTimeout(() => navigate(session.landingPath, { replace: true }), 600);
        return;
      }

      window.setTimeout(
        () =>
          navigate('/register/success', {
            replace: true,
            state: { name: session.displayName },
          }),
        700,
      );
    } catch (caught) {
      setError((caught as { message?: string }).message ?? t('auth.otp.invalid'));
      setCode('');
      setVerified(false);
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    await resendOtp();
    setCode('');
    setError(null);
  }

  return (
    <AuthLayout
      title={t('auth.otp.title')}
      subtitle={
        <>
          {t('auth.otp.subtitle')}{' '}
          <span dir="ltr" className="font-medium text-ink-700">
            {pending?.maskedDestination ?? '—'}
          </span>
        </>
      }
      footer={
        <button
          type="button"
          onClick={() => navigate(purpose === 'login' ? '/login' : '/register')}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          {t('auth.otp.changeIdentifier')}
        </button>
      }
    >
      <div className="space-y-5">
        {verified ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-500"
            >
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="text-md font-semibold text-ink-900">{t('auth.otp.verified')}</p>
          </div>
        ) : (
          <>
            <OtpInput
              value={code}
              onChange={(value) => {
                setCode(value);
                setError(null);
              }}
              onComplete={verify}
              disabled={verifying}
              invalid={Boolean(error)}
              autoFocus
              aria-label={t('auth.otp.title')}
            />

            {error && (
              <Alert tone="danger" compact>
                {error}
              </Alert>
            )}

            <Button
              size="lg"
              fullWidth
              loading={verifying}
              disabled={code.length < 4}
              onClick={() => verify(code)}
            >
              {verifying ? t('auth.otp.verifying') : t('auth.otp.verify')}
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-sm text-ink-500">
              {t('auth.otp.notReceived')}
              <button
                type="button"
                onClick={resend}
                className="font-medium text-brand-600 hover:text-brand-700"
              >
                {t('auth.otp.resend')}
              </button>
            </div>

            <Alert tone="tip" compact>
              {t('auth.otp.devHint')}
            </Alert>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
