/** Normalizes an Iranian mobile number to E.164 (+989XXXXXXXXX). */
export function normalizeIranPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  if (digits.startsWith('989') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('09') && digits.length === 11) return `+98${digits.slice(1)}`;
  if (digits.startsWith('9') && digits.length === 10) return `+98${digits}`;

  return `+${digits}`;
}

export function isValidIranPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return (
    (digits.startsWith('09') && digits.length === 11) ||
    (digits.startsWith('9') && digits.length === 10) ||
    (digits.startsWith('989') && digits.length === 12)
  );
}
