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
const authAdapter = read('src/services/auth/supabaseAuthAdapter.ts');
const phoneAuth = read('src/components/PhoneAuth.tsx');
const schema = read('supabase/schema.sql');
const migration = read('supabase/migrations/20260825_002_security_auth_cleanup.sql');
const types = read('src/types/index.ts');

assert(authHook.includes('authAdapter'), 'UI auth hook must use the AuthAdapter abstraction');
assert(!authHook.includes('supabase.auth'), 'UI auth hook still depends directly on Supabase Auth');
assert(authAdapter.includes('signInWithOtp'), 'Supabase adapter must send phone OTP');
assert(authAdapter.includes('verifyOtp'), 'Supabase adapter must verify phone OTP');
assert(!authAdapter.includes('signInWithPassword'), 'Legacy password sign-in still exists');
assert(!authAdapter.includes('toDerivedPassword'), 'Predictable derived password helper still exists');
assert(!authAdapter.includes('toSyntheticEmail'), 'Synthetic email auth helper still exists');
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

console.log('✅ Behtan Auth/RLS security smoke test passed');
console.log('   Auth UI: adapter-based phone OTP');
console.log('   Predictable password bridge: removed');
console.log('   user_profiles: own-row authenticated RLS');
console.log('   Nutrition catalog: authenticated read-only');
console.log('   Legacy food_exchanges code/table: cleanup migration ready');
