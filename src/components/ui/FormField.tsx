import { useId, type ReactElement, type ReactNode, cloneElement, isValidElement } from 'react';
import { cn } from '@/lib/cn';
import { InfoHint } from './Tooltip';
import { useTranslation } from '@/i18n';

export interface FormFieldProps {
  label: ReactNode;
  /** Helper text shown under the control while it is valid. */
  hint?: ReactNode;
  /** Replaces the hint and turns the control red. */
  error?: string;
  required?: boolean;
  /** Shows an "Optional" marker. Ignored when `required` is set. */
  showOptional?: boolean;
  /** Renders a question-mark tooltip beside the label for a longer explanation. */
  help?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps a control with a label, hint, and error. Wires `id`, `aria-describedby`,
 * and `aria-invalid` automatically when the child is a single element.
 */
export function FormField({
  label,
  hint,
  error,
  required = false,
  showOptional = false,
  help,
  className,
  children,
}: FormFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const control =
    isValidElement(children) && typeof children.type !== 'string'
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id,
          'aria-describedby': describedBy,
          invalid: Boolean(error) || undefined,
          required: required || undefined,
        })
      : isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            id,
            'aria-describedby': describedBy,
            'aria-invalid': Boolean(error) || undefined,
            required: required || undefined,
          })
        : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
        {label}
        {required && (
          <span aria-hidden className="text-danger-500">
            *
          </span>
        )}
        {!required && showOptional && (
          <span className="text-xs font-normal text-ink-400">({t('common.optional')})</span>
        )}
        {help && <InfoHint content={help} />}
      </label>

      {control}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
