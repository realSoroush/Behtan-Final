import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmsIrProvider, smsIrMobile } from '../supabase/functions/send-sms/providers/smsIr.ts';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const useAuth = read('src/hooks/useAuth.ts');
const otpAdapter = read('src/services/auth/supabaseAuthAdapter.ts');
const authIndex = read('src/services/auth/index.ts');
const authConfig = read('src/config/authConfig.ts');
const phoneAuth = read('src/components/PhoneAuth.tsx');
const turnstile = read('src/components/auth/TurnstileWidget.tsx');
const hook = read('supabase/functions/send-sms/index.ts');
const smsIrProvider = read('supabase/functions/send-sms/providers/smsIr.ts');

assert(!useAuth.includes('supabase.auth'), 'useAuth must not depend directly on Supabase Auth');
assert(useAuth.includes('authAdapter'), 'useAuth must call the auth abstraction');
assert(useAuth.includes('captchaToken'), 'OTP requests must require a CAPTCHA token');
assert(otpAdapter.includes('signInWithOtp'), 'OTP adapter must request a real phone OTP');
assert(otpAdapter.includes('verifyOtp'), 'OTP adapter must verify the phone OTP');
assert(otpAdapter.includes('captchaToken'), 'Supabase adapter must forward the CAPTCHA token');
assert(!existsSync(resolve(root, 'src/services/auth/supabaseTestBridgeAuthAdapter.ts')), 'Test bridge must not ship');
assert(!existsSync(resolve(root, 'supabase/functions/send-sms/providers/genericHttp.ts')), 'Generic SMS fallback must not ship');
assert(!existsSync(resolve(root, 'supabase/functions/send-sms/core/template.ts')), 'Legacy SMS template engine must not ship');
assert(authIndex.includes("configured !== 'supabase'"), 'Auth driver must fail closed');
assert(!authConfig.includes('isActive'), 'Production OTP must not have a client-side off switch');
assert(phoneAuth.includes("type AuthStep = 'phone' | 'otp'"), 'Phone UI must contain the OTP step');
assert(phoneAuth.includes('TurnstileWidget'), 'Phone UI must include bot protection');
assert(phoneAuth.includes('autoComplete="one-time-code"'), 'OTP input must support one-time-code autofill');
assert(turnstile.includes('request_phone_otp'), 'Turnstile action is missing');
assert(hook.includes('standardwebhooks'), 'Send SMS hook must verify Supabase signatures');
assert(hook.includes('createSmsProvider'), 'Send SMS hook must use the dedicated provider registry');
assert(hook.includes('64_000'), 'Send SMS hook must enforce a request-size limit');
assert(smsIrProvider.includes('AbortSignal.timeout(4_000)'), 'SMS.ir timeout must remain below the Auth Hook deadline');

assert(smsIrMobile('+989121234567') === '9121234567', 'SMS.ir phone normalization failed for E.164');
assert(smsIrMobile('09121234567') === '9121234567', 'SMS.ir phone normalization failed for local format');

const env = new Map([
  ['SMS_IR_API_KEY', 'production-like-secret-not-real'],
  ['SMS_IR_TEMPLATE_ID', '123456'],
  ['SMS_IR_PARAMETER_NAME', 'Code'],
]);
let captured;
const provider = new SmsIrProvider(
  (name) => env.get(name),
  async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ status: 1, message: 'ok', data: { messageId: 778899, cost: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
);

const result = await provider.send({ phone: '+989121234567', otp: '654321', message: '' });
assert(result.provider === 'sms_ir' && result.externalId === '778899', 'SMS.ir success response was not accepted');
assert(captured.url === 'https://api.sms.ir/v1/send/verify', 'Wrong SMS.ir Verify endpoint');
assert(captured.init.method === 'POST', 'SMS.ir request must use POST');
assert(captured.init.headers['x-api-key'] === 'production-like-secret-not-real', 'SMS.ir API key header is wrong');
const body = JSON.parse(captured.init.body);
assert(body.mobile === '9121234567', 'SMS.ir mobile payload is wrong');
assert(body.templateId === 123456, 'SMS.ir template ID is wrong');
assert(body.parameters?.[0]?.name === 'Code', 'SMS.ir template parameter name is wrong');
assert(body.parameters?.[0]?.value === '654321', 'SMS.ir OTP value is wrong');
assert(!captured.init.body.includes('+989121234567'), 'E.164 number leaked into SMS.ir payload');

const rejected = new SmsIrProvider(
  (name) => env.get(name),
  async () => new Response(JSON.stringify({ status: 0, message: 'rejected', data: null }), { status: 200 })
);
await rejected.send({ phone: '+989121234567', otp: '654321', message: '' })
  .then(() => { throw new Error('Rejected SMS.ir response was accepted'); })
  .catch((error) => assert(error.message.includes('rejected'), 'SMS.ir rejection did not fail safely'));

console.log('✅ Production phone OTP test passed');
console.log('   Auth: Supabase Phone OTP only');
console.log('   Delivery: signed Send SMS Hook -> SMS.ir Verify API');
console.log('   Abuse protection: Cloudflare Turnstile + resend cooldown');
