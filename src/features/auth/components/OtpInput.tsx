import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires once the last box is filled. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
}

/**
 * A row of single-character boxes for a verification code.
 *
 * The behaviours that make this feel right are mostly about not fighting the
 * person: typing advances, backspace on an empty box steps back, and pasting a
 * whole code from an SMS fills every box at once rather than landing entirely
 * in the first one.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 4,
  disabled = false,
  invalid = false,
  autoFocus = false,
  'aria-label': ariaLabel,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value.length === length && onComplete) onComplete(value);
  }, [value, length, onComplete]);

  function setDigit(index: number, digit: string) {
    const next = value.padEnd(length, ' ').split('');
    next[index] = digit;
    onChange(next.join('').replace(/\s+$/, ''));
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;

    setDigit(index, digit);
    if (index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();

      /* Backspace on an empty box clears the previous one and moves there,
         which is what people expect when correcting a mistyped code. */
      if (digits[index].trim()) {
        setDigit(index, ' ');
        return;
      }
      if (index > 0) {
        setDigit(index - 1, ' ');
        refs.current[index - 1]?.focus();
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      dir="ltr"
      className="flex items-center justify-center gap-2.5"
    >
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          value={digits[index].trim()}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className={cn(
            'numeric h-14 w-12 rounded-md border bg-surface text-center text-2xl font-semibold text-ink-900 shadow-xs transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
            invalid
              ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25'
              : 'border-ink-200 focus:border-brand-400',
            disabled && 'cursor-not-allowed bg-ink-50',
          )}
        />
      ))}
    </div>
  );
}
