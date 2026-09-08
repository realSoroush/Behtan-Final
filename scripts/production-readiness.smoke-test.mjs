import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const auth = [
  read('src/services/auth/index.ts'),
  read('src/services/auth/supabaseAuthAdapter.ts'),
  read('src/hooks/useAuth.ts'),
  read('src/components/PhoneAuth.tsx'),
].join('\n');
const sms = [
  read('supabase/functions/send-sms/index.ts'),
  read('supabase/functions/send-sms/providers/smsIr.ts'),
].join('\n');
const payments = [
  read('supabase/functions/payments/index.ts'),
  read('supabase/functions/payments/core.ts'),
].join('\n');
const migration = read('supabase/migrations/20260908_015_production_auth_billing.sql');
const gitignore = read('.gitignore').split(/\r?\n/).map((line) => line.trim());

assert(!existsSync(resolve(root, 'src/services/auth/supabaseTestBridgeAuthAdapter.ts')), 'Test auth bridge exists');
assert(!auth.includes('test_bridge') && !auth.includes('signInWithPassword'), 'Non-OTP auth path exists');
assert(auth.includes('captchaToken') && auth.includes('TurnstileWidget'), 'CAPTCHA is not mandatory');
assert(sms.includes('standardwebhooks') && sms.includes('SMS_IR_API_KEY'), 'Signed SMS.ir hook is incomplete');
assert(!sms.includes('SMS_PROVIDER_URL') && !sms.includes('SMS_MESSAGE_TEMPLATE'), 'Generic SMS fallback exists');
assert(payments.includes('phone_confirmed_at') && payments.includes("settings.mode==='live'"), 'Live verified-phone gate is missing');
assert(payments.includes("metadata:{order_id:order.id,auto_verify:false"), 'ZarinPal safe request metadata is missing');
assert(migration.includes("mode = 'live', checkout_enabled = false"), 'Production billing must install fail-closed');
assert(gitignore.includes('.env'), 'Local .env is not protected by .gitignore');
if (existsSync(resolve(root, '.git'))) {
  const trackedEnv = spawnSync('git', ['ls-files', '--error-unmatch', '.env'], { cwd: root, stdio: 'ignore' });
  assert(trackedEnv.status !== 0, 'A real .env file is tracked by Git');
}

console.log('✅ Production readiness guard test passed');
console.log('   OTP-only auth, signed SMS.ir Hook, CAPTCHA and verified-phone Live payments are enforced');
