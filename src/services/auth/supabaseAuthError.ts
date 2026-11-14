import { AuthServiceError } from './types.ts';

type Phase = 'send' | 'verify' | 'session';

export function mapSupabaseAuthError(error: unknown, phase: Phase = 'session'): AuthServiceError {
  const value = error as { message?: string; status?: number; code?: string; name?: string } | null;
  const fail = (code: AuthServiceError['code']) => new AuthServiceError(code);
  switch (value?.code) {
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit': return fail('rate_limited');
    case 'captcha_failed': return fail('captcha_required');
    case 'sms_send_failed':
    case 'hook_timeout':
    case 'hook_timeout_after_retry':
    case 'hook_payload_over_size_limit':
    case 'hook_payload_invalid_content_type': return fail('sms_delivery_failed');
    case 'otp_expired': return fail('invalid_otp');
    case 'request_timeout': return fail(phase === 'send' ? 'request_timeout' : 'network_error');
    case 'validation_failed':
      if (phase === 'verify') return fail('invalid_otp');
      break;
  }
  const message = value?.message?.toLowerCase() ?? '';
  if (value?.status === 429 || /rate limit|too many/.test(message)) return fail('rate_limited');
  if (phase === 'send' && (value?.status === 504 || value?.name === 'TimeoutError')) return fail('request_timeout');
  if (value?.name === 'AuthRetryableFetchError' || (value?.status ?? 0) >= 500 || /fetch|network/.test(message))
    return fail('network_error');
  // Older GoTrue builds can omit a structured error code.
  if (phase === 'send' && /captcha|turnstile/.test(message)) return fail('captcha_required');
  if (phase === 'send' && /sms|provider|hook/.test(message)) return fail('sms_delivery_failed');
  if (phase === 'send' && /invalid phone/.test(message)) return fail('invalid_phone');
  if (phase === 'verify' && /otp|token|invalid/.test(message)) return fail('invalid_otp');
  return fail('unknown');
}
