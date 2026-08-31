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

  try {
    const rawPayload = await req.text();
    const event = verifyHook(rawPayload, Object.fromEntries(req.headers));
    const phone = event.user?.phone ?? '';
    const otp = event.sms?.otp ?? '';

    if (!/^\+989\d{9}$/.test(phone)) {
      return errorResponse(400, 'Unsupported phone number');
    }

    if (!/^\d{4,8}$/.test(otp)) {
      return errorResponse(400, 'Invalid OTP payload');
    }

    const messageTemplate = Deno.env.get('SMS_MESSAGE_TEMPLATE') ?? 'کد ورود به به‌تن: {{otp}}';
    const message = messageTemplate.replace(/\{\{otp\}\}/g, otp);

    const provider = createSmsProvider((name) => Deno.env.get(name) ?? undefined);
    await provider.send({ phone, otp, message });

    // Supabase Send SMS Hook only requires an empty successful response.
    return Response.json({}, { status: 200 });
  } catch (error) {
    console.error('[send-sms]', error);

    if (error instanceof SmsProviderError) {
      return errorResponse(error.status, 'ارسال پیامک تأیید انجام نشد.');
    }

    return errorResponse(500, 'خطا در سرویس ارسال پیامک.');
  }
});
