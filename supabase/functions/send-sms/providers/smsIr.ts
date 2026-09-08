import { SmsProviderError, type SmsMessage, type SmsProvider, type SmsSendResult } from '../core/types.ts';
import type { EnvReader } from './index.ts';

const SMS_IR_VERIFY_URL = 'https://api.sms.ir/v1/send/verify';

function smsIrMobile(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('989') && digits.length === 12) return digits.slice(2);
  if (digits.startsWith('09') && digits.length === 11) return digits.slice(1);
  if (digits.startsWith('9') && digits.length === 10) return digits;
  throw new SmsProviderError('Unsupported phone number', 400);
}

interface SmsIrResponse {
  status?: number;
  message?: string;
  data?: { messageId?: number | string; cost?: number } | null;
}

export class SmsIrProvider implements SmsProvider {
  readonly name = 'sms_ir';
  private readonly env: EnvReader;
  private readonly fetcher: typeof fetch;

  constructor(env: EnvReader, fetcher: typeof fetch = fetch) {
    this.env = env;
    this.fetcher = fetcher;
  }

  async send(input: SmsMessage): Promise<SmsSendResult> {
    const apiKey = this.env('SMS_IR_API_KEY')?.trim() ?? '';
    const templateId = Number(this.env('SMS_IR_TEMPLATE_ID'));
    const parameterName = this.env('SMS_IR_PARAMETER_NAME')?.trim() || 'Code';

    if (apiKey.length < 20) throw new SmsProviderError('SMS_IR_API_KEY is not configured', 500);
    if (!Number.isSafeInteger(templateId) || templateId <= 0) {
      throw new SmsProviderError('SMS_IR_TEMPLATE_ID is not configured', 500);
    }
    if (!/^[A-Za-z][A-Za-z0-9]{0,49}$/.test(parameterName)) {
      throw new SmsProviderError('SMS_IR_PARAMETER_NAME is invalid', 500);
    }

    let response: Response;
    try {
      response = await this.fetcher(SMS_IR_VERIFY_URL, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          mobile: smsIrMobile(input.phone),
          templateId,
          parameters: [{ name: parameterName, value: input.otp }],
        }),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
      throw new SmsProviderError(`SMS.ir request ${reason}`, 502);
    }

    const raw = await response.text();
    let result: SmsIrResponse;
    try {
      result = JSON.parse(raw) as SmsIrResponse;
    } catch {
      throw new SmsProviderError('SMS.ir returned an invalid response', 502);
    }

    if (response.status === 429) throw new SmsProviderError('SMS.ir rate limit reached', 429);
    if (!response.ok || result.status !== 1 || !result.data?.messageId) {
      throw new SmsProviderError(`SMS.ir rejected the request (${response.status}/${result.status ?? 'unknown'})`, 502);
    }

    return { provider: this.name, externalId: String(result.data.messageId) };
  }
}

export { smsIrMobile };
