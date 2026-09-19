import { forwardRef, useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';
import { Input, type InputProps } from './Input';
import { DEFAULT_CURRENCY } from '@/lib/format';

export interface PriceInputProps extends Omit<InputProps, 'type' | 'trailingAddon'> {
  /** ISO currency code shown at the end of the field. */
  currency?: string;
}

/** Digits, one decimal point, at most two decimals. Nothing else gets in. */
function sanitise(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, 2)}`;
}

/**
 * A money field.
 *
 * While the field has focus it shows exactly what was typed and does not
 * reformat. Callers almost always convert to integer halalas and back on every
 * change, and that round trip rewrites "1" as "1.00" mid-keystroke, which moves
 * the caret and makes the field feel like it is fighting you. Holding a local
 * draft during focus and reconciling on blur fixes that for every call site at
 * once, without any of them changing.
 *
 * Rendered as a text input rather than `type="number"`: number inputs swallow
 * intermediate states like "1." and bring their own caret quirks.
 */
export const PriceInput = forwardRef<HTMLInputElement, PriceInputProps>(function PriceInput(
  { currency = DEFAULT_CURRENCY, className, value, onChange, onBlur, onFocus, ...props },
  ref,
) {
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value));
  const focused = useRef(false);

  /* Accept updates from the parent only while the field is idle. Applying them
     mid-edit is exactly what caused the interruption. */
  useEffect(() => {
    if (focused.current) return;
    setDraft(value == null ? '' : String(value));
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = sanitise(event.target.value);
    setDraft(next);

    /* The parent still sees every keystroke, so live previews keep working —
       it just cannot push a reformatted value back until focus leaves. */
    if (onChange) {
      onChange({ ...event, target: { ...event.target, value: next } } as ChangeEvent<HTMLInputElement>);
    }
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    focused.current = true;
    onFocus?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    focused.current = false;

    /* Tidy up once, now that typing is finished: "12." becomes "12", and an
       amount gains its second decimal place. */
    const tidied = draft === '' || draft === '.' ? '' : String(Number(draft) || 0);
    const formatted = tidied === '' ? '' : Number(tidied).toFixed(2);

    if (formatted !== draft) {
      setDraft(formatted);
      if (onChange) {
        onChange({
          ...event,
          target: { ...event.target, value: formatted },
        } as unknown as ChangeEvent<HTMLInputElement>);
      }
    }

    onBlur?.(event);
  }

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      value={draft}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={`text-start tabular ${className ?? ''}`}
      trailingAddon={<span className="text-xs font-medium text-ink-500">{currency}</span>}
      {...props}
    />
  );
});
