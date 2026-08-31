import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenericHttpSmsProvider } from '../supabase/functions/send-sms/providers/genericHttp.ts';
import { formatPhone, renderTemplate } from '../supabase/functions/send-sms/core/template.ts';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const useAuth = read('src/hooks/useAuth.ts');
const adapter = read('src/services/auth/supabaseAuthAdapter.ts');
const authIndex = read('src/services/auth/index.ts');
const hook = read('supabase/functions/send-sms/index.ts');

assert(!useAuth.includes('supabase.auth'), 'useAuth must not depend directly on Supabase Auth');
assert(useAuth.includes('authAdapter'), 'useAuth must call the auth abstraction');
assert(adapter.includes('signInWithOtp'), 'Supabase adapter must request OTP');
assert(adapter.includes('verifyOtp'), 'Supabase adapter must verify OTP');
assert(authIndex.includes('VITE_AUTH_DRIVER'), 'Auth driver must be environment-selectable');
assert(hook.includes('standardwebhooks'), 'Send SMS hook must verify the Supabase hook signature');
assert(hook.includes('createSmsProvider'), 'Send SMS hook must resolve an SMS provider through the registry');

assert(formatPhone('+989121234567', 'iran_local') === '09121234567', 'Iran local phone formatting failed');
assert(formatPhone('09121234567', 'e164') === '+989121234567', 'Iran E.164 phone formatting failed');
assert(renderTemplate('OTP={{otp}}', { otp: '123456' }) === 'OTP=123456', 'Template rendering failed');

const envMap = new Map([
  ['SMS_PROVIDER_URL', 'https://sms.example.test/send'],
  ['SMS_PROVIDER_API_KEY', 'secret-key'],
  ['SMS_PROVIDER_API_KEY_MODE', 'header'],
  ['SMS_PROVIDER_API_KEY_NAME', 'x-api-key'],
  ['SMS_PROVIDER_PHONE_FORMAT', 'iran_local'],
  ['SMS_PROVIDER_PAYLOAD_MODE', 'template'],
  ['SMS_PROVIDER_PHONE_FIELD', 'mobile'],
  ['SMS_PROVIDER_OTP_FIELD', 'code'],
  ['SMS_PROVIDER_TEMPLATE_FIELD', 'template'],
  ['SMS_PROVIDER_TEMPLATE_ID', 'behtan-login'],
  ['SMS_PROVIDER_SUCCESS_JSON_PATH', 'status'],
  ['SMS_PROVIDER_SUCCESS_VALUES', 'OK'],
]);

const originalFetch = globalThis.fetch;
let captured;
globalThis.fetch = async (url, init) => {
  captured = { url: String(url), init };
  return new Response(JSON.stringify({ status: 'OK', id: 'msg-1' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  const provider = new GenericHttpSmsProvider((name) => envMap.get(name));
  await provider.send({
    phone: '+989121234567',
    otp: '654321',
    message: 'کد ورود به به‌تن: 654321',
  });

  assert(captured, 'Generic provider did not make an HTTP request');
  assert(captured.init.headers['x-api-key'] === 'secret-key', 'API key header was not configured');
  const body = JSON.parse(captured.init.body);
  assert(body.mobile === '09121234567', 'Provider phone field is wrong');
  assert(body.code === '654321', 'Provider OTP field is wrong');
  assert(body.template === 'behtan-login', 'Provider template field is wrong');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('✅ Behtan phone-auth abstraction smoke test passed');
console.log('   UI auth: provider-independent');
console.log('   Current auth driver: Supabase adapter');
console.log('   SMS delivery: configurable Generic HTTP provider');
console.log('   Supabase Send SMS Hook signature verification: present');
