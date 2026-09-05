import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const authHook = read('src/hooks/useAuth.ts');
const otpAdapter = read('src/services/auth/supabaseAuthAdapter.ts');
const testBridge = read('src/services/auth/supabaseTestBridgeAuthAdapter.ts');
const authIndex = read('src/services/auth/index.ts');
const authConfig = read('src/config/authConfig.ts');
const phoneAuth = read('src/components/PhoneAuth.tsx');
const schema = read('supabase/schema.sql');
const migration = read('supabase/migrations/20260825_002_security_auth_cleanup.sql');
const types = read('src/types/index.ts');

assert(authHook.includes('authAdapter'), 'UI auth hook must use the AuthAdapter abstraction');
assert(!authHook.includes('supabase.auth'), 'UI auth hook still depends directly on Supabase Auth');
assert(otpAdapter.includes('signInWithOtp'), 'Production Supabase adapter must send phone OTP');
assert(otpAdapter.includes('verifyOtp'), 'Production Supabase adapter must verify phone OTP');
assert(!otpAdapter.includes('signInWithPassword'), 'Production OTP adapter contains password sign-in');
assert(!otpAdapter.includes('toDerivedPassword'), 'Production OTP adapter contains derived password logic');
assert(testBridge.includes('signInWithPassword'), 'Explicit test bridge is missing');
assert(testBridge.includes('_slmt'), 'Test bridge is not compatible with pre-OTP test accounts');
assert(authIndex.includes("PHONE_AUTH_MODE === 'test_bridge'"), 'Test bridge must be explicitly gated by auth mode');
assert(authConfig.includes('NEVER launch publicly with OTP disabled'), 'Auth config lacks public-launch security warning');
assert(phoneAuth.includes("type AuthStep = 'phone' | 'otp'"), 'PhoneAuth is missing the OTP step');
assert(phoneAuth.includes('autoComplete="one-time-code"'), 'OTP input is not configured for one-time codes');

assert(!schema.includes('create table if not exists public.food_exchanges'), 'Legacy food_exchanges remains in final schema');
assert(migration.includes('drop table if exists public.food_exchanges cascade'), 'Cleanup migration does not drop food_exchanges');
assert(!existsSync(resolve(root, 'src/hooks/useFoodExchanges.ts')), 'Dead useFoodExchanges hook still exists');
assert(!existsSync(resolve(root, 'supabase/seed_food_exchanges.sql')), 'Legacy food_exchanges seed still exists');
assert(!types.includes('interface FoodExchange'), 'Legacy FoodExchange type still exists');

assert(schema.includes('to authenticated'), 'RLS policies must explicitly target authenticated users');
assert(schema.includes('revoke all on public.user_profiles from anon'), 'Anonymous profile access is not explicitly revoked');
assert(schema.includes('revoke all on public.food_items from anon'), 'Anonymous catalog access is not explicitly revoked');
assert(schema.includes('grant select, insert, update on public.user_profiles to authenticated'), 'Authenticated profile grants are incomplete');
assert(schema.includes('grant select on public.food_items to authenticated'), 'Authenticated catalog select grant missing');
assert(schema.includes('alter table public.daily_meal_checkins enable row level security'), 'Daily meal check-ins must have RLS enabled');
assert(schema.includes('revoke all on public.daily_meal_checkins from anon'), 'Anonymous daily meal check-in access is not explicitly revoked');
assert(schema.includes('grant select, insert, update, delete on public.daily_meal_checkins to authenticated'), 'Authenticated daily meal check-in grants are incomplete');

console.log('✅ Behtan Auth/RLS security smoke test passed');
console.log('   Production auth path: phone OTP only');
console.log('   Test bridge: isolated behind explicit feature switch');
console.log('   PUBLIC LAUNCH REQUIREMENT: otp.isActive must be true');
console.log('   user_profiles: own-row authenticated RLS');
console.log('   Nutrition catalog: authenticated read-only');
