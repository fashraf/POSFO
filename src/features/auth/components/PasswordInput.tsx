import { forwardRef, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/i18n';

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

/** The rules a password has to satisfy. Exported so the form can validate too. */
export function evaluatePassword(value: string) {
  return {
    length: value.length >= 8,
    number: /\d/.test(value),
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
  };
}

export function isPasswordValid(value: string): boolean {
  return Object.values(evaluatePassword(value)).every(Boolean);
}

export interface PasswordInputProps extends Omit<InputProps, 'type' | 'trailingAddon'> {
  /** Show the live requirement checklist under the field. */
  showRules?: boolean;
}

/**
 * A password field with a reveal toggle and, optionally, live requirements.
 *
 * The checklist updates as the person types so they can see themselves
 * satisfying each rule, rather than submitting and being told what was wrong.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ showRules = false, value, className, ...props }, ref) {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);

    const rules: PasswordRule[] = useMemo(() => {
      const result = evaluatePassword(String(value ?? ''));
      return [
        { id: 'length', label: t('auth.password.ruleLength'), met: result.length },
        { id: 'number', label: t('auth.password.ruleNumber'), met: result.number },
        { id: 'upper', label: t('auth.password.ruleUpper'), met: result.upper },
        { id: 'lower', label: t('auth.password.ruleLower'), met: result.lower },
      ];
    }, [value, t]);

    return (
      <div className="space-y-2">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          dir="ltr"
          value={value}
          className={cn('text-start', className)}
          trailingAddon={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setVisible((current) => !current)}
              aria-label={visible ? t('auth.password.hide') : t('auth.password.show')}
              className="pointer-events-auto rounded-sm p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              {visible ? (
                <EyeOff aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <Eye aria-hidden className="h-3.5 w-3.5" />
              )}
            </button>
          }
          {...props}
        />

        {showRules && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className={cn(
                  'flex items-center gap-1.5 text-2xs transition-colors',
                  rule.met ? 'text-success-600' : 'text-ink-400',
                )}
              >
                {rule.met ? (
                  <Check aria-hidden className="h-3 w-3 shrink-0" />
                ) : (
                  <X aria-hidden className="h-3 w-3 shrink-0" />
                )}
                {rule.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
