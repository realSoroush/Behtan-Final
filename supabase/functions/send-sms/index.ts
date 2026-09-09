import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { createSmsProvider } from './providers/index.ts';
import { SmsProviderError } from './core/types.ts';

interface SendSmsHookPayload {
  user?: {
    phone?: string | null;
  };
  sms?: {
    otp?: string | null;
  };
}

function hookSecrets(): string[] {
  const raw = Deno.env.get('SEND_SMS_HOOK_SECRETS') ?? Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '';
  return raw
    .split('|')
    .map((secret) => secret.trim().replace(/^v1,whsec_/, ''))
    .filter(Boolean);
}

function verifyHook(payload: string, headers: Record<string, string>): SendSmsHookPayload {
  const secrets = hookSecrets();
  if (secrets.length === 0) throw new Error('SEND_SMS_HOOK_SECRETS is not configured');

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return new Webhook(secret).verify(payload, headers) as SendSmsHookPayload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Invalid hook signature');
}

function errorResponse(status: number, message: string): Response {
  return Response.json(
    {
      error: {
        http_code: status,
        message,
      },
    },
    { status }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return errorResponse(415, 'Unsupported media type');
  }
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 64_000) return errorResponse(413, 'Payload too large');

  try {
    const rawPayload = await req.text();
    if (new TextEncoder().encode(rawPayload).byteLength > 64_000) return errorResponse(413, 'Payload too large');
    const event = verifyHook(rawPayload, Object.fromEntries(req.headers));
    const phone = event.user?.phone ?? '';
    const otp = event.sms?.otp ?? '';

    if (!/^\+?989\d{9}$/.test(phone)) {
      return errorResponse(400, 'Unsupported phone number');
    }

    if (!/^\d{4,8}$/.test(otp)) {
      return errorResponse(400, 'Invalid OTP payload');
    }

    const provider = createSmsProvider((name) => Deno.env.get(name) ?? undefined);
    await provider.send({ phone, otp, message: '' });

    // Supabase Send SMS Hook only requires an empty successful response.
    return Response.json({}, { status: 200 });
  } catch (error) {
    // Log only the error category. Phone, OTP, hook payload and provider key stay out of logs.
    console.error('[send-sms]', error instanceof SmsProviderError ? error.message : 'Unhandled hook error');

    if (error instanceof SmsProviderError) {
      return errorResponse(error.status, 'ارسال پیامک تأیید انجام نشد.');
    }

    return errorResponse(500, 'خطا در سرویس ارسال پیامک.');
  }
});
