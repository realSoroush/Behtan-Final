import type { ProteinPriceSnapshot } from './mealExperience.ts';
export function parseProteinPrices(value: unknown): ProteinPriceSnapshot | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_PROTEIN_PRICES');
  const v = value as ProteinPriceSnapshot;
  const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (v.region !== 'IR' || !day(v.observedOn) || !day(v.validThrough) || v.observedOn > v.validThrough ||
      !v.quotes || typeof v.quotes !== 'object' || Array.isArray(v.quotes) || Object.keys(v.quotes).length > 1000)
    throw Error('INVALID_PROTEIN_PRICES');
  for (const quote of Object.values(v.quotes)) {
    if (!quote || !Number.isFinite(quote.tomanPerKg) || quote.tomanPerKg <= 0 ||
        !['raw','dry','cooked','ready'].includes(quote.preparationState) || typeof quote.source !== 'string' || quote.source.length > 2048)
      throw Error('INVALID_PROTEIN_PRICES');
    try { const url = new URL(quote.source); if (url.protocol !== 'https:' || url.username || url.password) throw Error(); }
    catch { throw Error('INVALID_PROTEIN_PRICES'); }
  }
  return v;
}
