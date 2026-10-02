/**
 * Input validation for the sign-in forms.
 *
 * Pure functions with no knowledge of where the request goes, so a form can
 * check a value before it is sent; the API validates again.
 */

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isValidSaudiMobile(value: string): boolean {
  return /^\+9665\d{8}$/.test(normaliseMobile(value));
}

export function normaliseMobile(value: string): string {
  const digits = value.replace(/[\s\-()]/g, '');
  if (digits.startsWith('00966')) return `+${digits.slice(2)}`;
  if (digits.startsWith('+966')) return digits;
  if (digits.startsWith('966')) return `+${digits}`;
  if (digits.startsWith('05')) return `+966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;
  return digits;
}
