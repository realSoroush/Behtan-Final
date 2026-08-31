export function toIranLocalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('989') && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('09') && digits.length === 11) return digits;
  return digits;
}

export function formatPhone(phone: string, format: string): string {
  switch (format) {
    case 'iran_local':
      return toIranLocalPhone(phone);
    case 'digits':
      return phone.replace(/\D/g, '');
    case 'e164': {
      const digits = phone.replace(/\D/g, '');
      if (digits.startsWith('09') && digits.length === 11) return `+98${digits.slice(1)}`;
      if (digits.startsWith('989') && digits.length === 12) return `+${digits}`;
      return phone.startsWith('+') ? phone : `+${digits}`;
    }
    default:
      return phone;
  }
}

export function renderTemplate(
  template: string,
  values: Record<string, string | undefined>
): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => values[key] ?? '');
}

export function getJsonPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

export function renderDeepTemplates(
  value: unknown,
  replacements: Record<string, string | undefined>
): unknown {
  if (typeof value === 'string') return renderTemplate(value, replacements);
  if (Array.isArray(value)) return value.map((item) => renderDeepTemplates(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        renderDeepTemplates(item, replacements),
      ])
    );
  }
  return value;
}
