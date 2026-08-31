import { SmsProviderError, type SmsMessage, type SmsProvider, type SmsSendResult } from '../core/types.ts';
import { formatPhone, getJsonPath, renderDeepTemplates, renderTemplate } from '../core/template.ts';

export type EnvReader = (name: string) => string | undefined;

function parseJsonObject(raw: string | undefined, label: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new SmsProviderError(`${label} must be a JSON object`, 500);
  }
}

function addIfConfigured(
  target: Record<string, unknown>,
  fieldName: string | undefined,
  value: unknown
) {
  if (fieldName?.trim()) target[fieldName.trim()] = value;
}

function parseAllowedStatuses(raw: string | undefined): Set<number> | null {
  if (!raw?.trim()) return null;
  const values = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item));
  return new Set(values);
}

export class GenericHttpSmsProvider implements SmsProvider {
  readonly name = 'generic_http';
  private readonly env: EnvReader;

  constructor(env: EnvReader) {
    this.env = env;
  }

  async send(input: SmsMessage): Promise<SmsSendResult> {
    const baseUrl = this.env('SMS_PROVIDER_URL');
    if (!baseUrl) throw new SmsProviderError('SMS_PROVIDER_URL is not configured', 500);

    const apiKey = this.env('SMS_PROVIDER_API_KEY') ?? '';
    const sender = this.env('SMS_PROVIDER_SENDER') ?? '';
    const templateId = this.env('SMS_PROVIDER_TEMPLATE_ID') ?? '';
    const phone = formatPhone(input.phone, this.env('SMS_PROVIDER_PHONE_FORMAT') ?? 'iran_local');

    const replacements = {
      phone,
      phone_e164: formatPhone(input.phone, 'e164'),
      phone_local: formatPhone(input.phone, 'iran_local'),
      otp: input.otp,
      message: input.message,
      apiKey,
      sender,
      templateId,
    };

    let url = renderTemplate(baseUrl, replacements);
    const method = (this.env('SMS_PROVIDER_METHOD') ?? 'POST').toUpperCase();
    const bodyFormat = (this.env('SMS_PROVIDER_BODY_FORMAT') ?? 'json').toLowerCase();
    const payloadMode = (this.env('SMS_PROVIDER_PAYLOAD_MODE') ?? 'message').toLowerCase();

    const rawExtraHeaders = renderDeepTemplates(
      parseJsonObject(this.env('SMS_PROVIDER_EXTRA_HEADERS_JSON'), 'SMS_PROVIDER_EXTRA_HEADERS_JSON'),
      replacements
    ) as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    for (const [key, value] of Object.entries(rawExtraHeaders)) {
      if (value !== undefined && value !== null) headers[key] = String(value);
    }

    const apiKeyMode = (this.env('SMS_PROVIDER_API_KEY_MODE') ?? 'header').toLowerCase();
    const apiKeyName = this.env('SMS_PROVIDER_API_KEY_NAME') ?? 'x-api-key';

    if (apiKey) {
      if (apiKeyMode === 'bearer') {
        headers.Authorization = `Bearer ${apiKey}`;
      } else if (apiKeyMode === 'header') {
        headers[apiKeyName] = apiKey;
      }
    }

    const payload = renderDeepTemplates(
      parseJsonObject(this.env('SMS_PROVIDER_EXTRA_BODY_JSON'), 'SMS_PROVIDER_EXTRA_BODY_JSON'),
      replacements
    ) as Record<string, unknown>;

    const phoneField = this.env('SMS_PROVIDER_PHONE_FIELD') ?? 'mobile';
    addIfConfigured(payload, phoneField, phone);

    if (payloadMode === 'template') {
      addIfConfigured(payload, this.env('SMS_PROVIDER_OTP_FIELD') ?? 'code', input.otp);
      addIfConfigured(payload, this.env('SMS_PROVIDER_TEMPLATE_FIELD') ?? 'templateId', templateId);
    } else {
      addIfConfigured(payload, this.env('SMS_PROVIDER_MESSAGE_FIELD') ?? 'message', input.message);
    }

    addIfConfigured(payload, this.env('SMS_PROVIDER_SENDER_FIELD'), sender);

    if (apiKey && apiKeyMode === 'query') {
      const parsed = new URL(url);
      parsed.searchParams.set(apiKeyName, apiKey);
      url = parsed.toString();
    }

    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      if (bodyFormat === 'form') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        const form = new URLSearchParams();
        for (const [key, value] of Object.entries(payload)) {
          if (value !== undefined && value !== null) form.set(key, String(value));
        }
        body = form.toString();
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(payload);
      }
    } else {
      const parsed = new URL(url);
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && value !== null) parsed.searchParams.set(key, String(value));
      }
      url = parsed.toString();
    }

    const timeoutMs = Math.max(1000, Number(this.env('SMS_PROVIDER_TIMEOUT_MS') ?? '3500'));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new SmsProviderError(`SMS provider request failed: ${reason}`, 502);
    } finally {
      clearTimeout(timer);
    }

    const responseText = await response.text();
    const allowedStatuses = parseAllowedStatuses(this.env('SMS_PROVIDER_SUCCESS_STATUSES'));
    const statusOk = allowedStatuses ? allowedStatuses.has(response.status) : response.ok;

    if (!statusOk) {
      throw new SmsProviderError(`SMS provider returned HTTP ${response.status}`, 502);
    }

    const successPath = this.env('SMS_PROVIDER_SUCCESS_JSON_PATH');
    const successValues = (this.env('SMS_PROVIDER_SUCCESS_VALUES') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    let parsedBody: unknown = null;
    if (responseText) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        parsedBody = responseText;
      }
    }

    if (successPath && successValues.length > 0) {
      const actual = getJsonPath(parsedBody, successPath);
      if (!successValues.includes(String(actual))) {
        throw new SmsProviderError('SMS provider response did not indicate success', 502);
      }
    }

    const externalIdPath = this.env('SMS_PROVIDER_EXTERNAL_ID_JSON_PATH') ?? '';
    const externalId = externalIdPath ? getJsonPath(parsedBody, externalIdPath) : undefined;

    return {
      provider: this.name,
      externalId: externalId == null ? undefined : String(externalId),
    };
  }
}
