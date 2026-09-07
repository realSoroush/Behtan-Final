import type { SubscriptionPlan, SubscriptionPlanTheme } from '../types/index.ts';

export interface SubscriptionPlanRow {
  code: unknown;
  name: unknown;
  emoji: unknown;
  price_toman: unknown;
  price_note: unknown;
  duration_days: unknown;
  features: unknown;
  badge: unknown;
  theme: unknown;
  sort_order: unknown;
  is_active: unknown;
}

const PLAN_CODE_PATTERN = /^[a-z][a-z0-9_-]{1,49}$/;
const PLAN_THEMES: SubscriptionPlanTheme[] = ['silver', 'gold', 'green'];

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`${field} is invalid`);
  }
  return value.trim();
}

function requireInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): number {
  const numericValue = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (
    typeof numericValue !== 'number'
    || !Number.isSafeInteger(numericValue)
    || numericValue < minimum
    || numericValue > maximum
  ) {
    throw new Error(`${field} is invalid`);
  }
  return numericValue;
}

export function buildSubscriptionPlan(row: SubscriptionPlanRow): SubscriptionPlan {
  const code = requireString(row.code, 'code', 50);
  if (!PLAN_CODE_PATTERN.test(code)) throw new Error('code is invalid');

  if (!Array.isArray(row.features) || row.features.length === 0 || row.features.length > 20) {
    throw new Error('features must be a non-empty array');
  }
  const features = row.features.map((feature, index) =>
    requireString(feature, `features[${index}]`, 180)
  );

  if (typeof row.theme !== 'string' || !PLAN_THEMES.includes(row.theme as SubscriptionPlanTheme)) {
    throw new Error('theme is invalid');
  }

  if (row.badge !== null && row.badge !== undefined && typeof row.badge !== 'string') {
    throw new Error('badge is invalid');
  }
  const badge = typeof row.badge === 'string' && row.badge.trim().length > 0
    ? requireString(row.badge, 'badge', 80)
    : null;

  return {
    code,
    name: requireString(row.name, 'name', 80),
    emoji: typeof row.emoji === 'string' ? row.emoji.trim().slice(0, 16) : '',
    priceToman: requireInteger(row.price_toman, 'price_toman', 0, 100_000_000),
    priceNote: requireString(row.price_note, 'price_note', 80),
    durationDays: requireInteger(row.duration_days, 'duration_days', 1, 3650),
    features,
    badge,
    theme: row.theme as SubscriptionPlanTheme,
    sortOrder: requireInteger(row.sort_order, 'sort_order', -32768, 32767),
  };
}

export function buildSubscriptionPlans(rows: SubscriptionPlanRow[]): SubscriptionPlan[] {
  const plans = rows.filter((row) => row.is_active === true).map(buildSubscriptionPlan);
  const codes = new Set<string>();
  for (const plan of plans) {
    if (codes.has(plan.code)) throw new Error(`duplicate plan code: ${plan.code}`);
    codes.add(plan.code);
  }
  return plans.sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
}

const tomanFormatter = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });

export function formatSubscriptionPrice(priceToman: number): string {
  requireInteger(priceToman, 'price_toman', 0, 100_000_000);
  return priceToman === 0 ? 'رایگان' : tomanFormatter.format(priceToman);
}

/** Presentation-only freshness check; this is not a payment entitlement check. */
export function isSameSubscriptionOffer(previous: SubscriptionPlan, latest: SubscriptionPlan): boolean {
  return JSON.stringify(previous) === JSON.stringify(latest);
}
