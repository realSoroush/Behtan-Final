import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildSubscriptionPlans,
  formatSubscriptionPrice,
  isSameSubscriptionOffer,
} from '../src/utils/subscriptionPlans.ts';

const rows = [
  {
    code: 'gold',
    name: 'طلایی',
    emoji: '🥇',
    price_toman: 249000,
    price_note: 'ماهانه',
    duration_days: 30,
    features: ['مزیت طلایی'],
    badge: 'محبوب‌ترین',
    theme: 'gold',
    sort_order: 20,
    is_active: true,
  },
  {
    code: 'free_trial',
    name: 'آزمایشی',
    emoji: '🌱',
    price_toman: '0',
    price_note: 'ماهانه',
    duration_days: 7,
    features: ['شروع رایگان'],
    badge: null,
    theme: 'green',
    sort_order: 5,
    is_active: true,
  },
];

const plans = buildSubscriptionPlans(rows);
assert.deepEqual(plans.map((plan) => plan.code), ['free_trial', 'gold']);
assert.equal(plans[0].priceToman, 0);
assert.equal(formatSubscriptionPrice(0), 'رایگان');
assert.equal(formatSubscriptionPrice(149000), '۱۴۹٬۰۰۰');
assert.equal(formatSubscriptionPrice(1), '۱');
assert.equal(formatSubscriptionPrice(100000000), '۱۰۰٬۰۰۰٬۰۰۰');
assert.deepEqual(buildSubscriptionPlans([]), []);
assert.deepEqual(buildSubscriptionPlans([{ ...rows[0], is_active: false }]), []);
assert.equal(buildSubscriptionPlans([{ ...rows[0], code: 'annual_plus', name: 'سالانه' }])[0].code, 'annual_plus');
assert.equal(isSameSubscriptionOffer(plans[0], { ...plans[0] }), true);
for (const changed of [{ priceToman: 1000 }, { durationDays: 60 }, { name: 'جدید' }, { features: ['تغییر'] }]) {
  assert.equal(isSameSubscriptionOffer(plans[0], { ...plans[0], ...changed }), false);
}
for (const badPrice of [-1, 1.5, NaN, Infinity, 100000001]) {
  assert.throws(() => formatSubscriptionPrice(badPrice));
}
assert.throws(() => buildSubscriptionPlans([rows[0], rows[0]]), /duplicate/);
for (const invalid of [
  { features: [null] }, { features: ['   '] }, { features: ['x'.repeat(181)] },
  { features: Array(21).fill('feature') }, { price_toman: null },
  { price_toman: '' }, { price_toman: 1.5 }, { duration_days: 0 },
  { theme: 'arbitrary-css' },
]) {
  assert.throws(() => buildSubscriptionPlans([{ ...rows[0], ...invalid }]));
}

assert.throws(
  () => buildSubscriptionPlans([{ ...rows[0], code: 'Gold Plan' }]),
  /code is invalid/
);
assert.throws(
  () => buildSubscriptionPlans([{ ...rows[0], features: [] }]),
  /features must be a non-empty array/
);
assert.throws(
  () => buildSubscriptionPlans([{ ...rows[0], price_toman: -1 }]),
  /price_toman is invalid/
);

const migration = await readFile(
  new URL('../supabase/migrations/20260907_013_subscription_plans.sql', import.meta.url),
  'utf8'
);
const paywall = await readFile(
  new URL('../src/components/onboarding/Step11Paywall.tsx', import.meta.url),
  'utf8'
);
const hook = await readFile(
  new URL('../src/hooks/useSubscriptionPlans.ts', import.meta.url),
  'utf8'
);

assert.match(migration, /create table if not exists public\.subscription_plans/);
assert.match(migration, /price_toman bigint not null check \(price_toman between 0 and 100000000\)/);
assert.match(migration, /Authenticated users can read active subscription plans/);
assert.match(migration, /revoke insert, update, delete on public\.subscription_plans from authenticated/);
assert.match(migration, /foreign key \(subscription_tier\)/);
assert.match(hook, /\.from\('subscription_plans'\)/);
assert.doesNotMatch(paywall, /const PLAN_DETAILS/);
assert.match(paywall, /formatSubscriptionPrice\(plan\.priceToman\)/);
assert.match(paywall, /!isFree/);
assert.match(paywall, /'تومان '/);
assert.match(paywall, /isSameSubscriptionOffer\(selectedPlan, latestPlan\)/);
assert.match(paywall, /onComplete\(null\)/, 'Skip must not save a paid-plan selection');
assert.match(hook, /30_000/);
assert.match(hook, /visibilitychange/);
assert.match(hook, /removeEventListener/);
assert.match(hook, /requestRef.current !== controller/);
assert.match(migration, /on conflict \(code\) do nothing/);
assert.match(migration, /on delete restrict/);

console.log('✅ Behtan live subscription plans smoke test passed');
console.log('   Supabase is the runtime source of truth');
console.log('   Zero-toman plans render as رایگان');
console.log('   Authenticated browser clients are read-only');
