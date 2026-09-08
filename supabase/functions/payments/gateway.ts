export type Mode = 'sandbox' | 'live';
export const gatewayOrigin = (mode: Mode) => mode === 'live' ? 'https://payment.zarinpal.com' : 'https://sandbox.zarinpal.com';
export const authorityValid = (value: unknown): value is string => typeof value === 'string' && /^[AS][a-zA-Z0-9]{10,63}$/.test(value);
export const uuidValid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type GatewayReply = { code: number; authority?: string; ref_id?: string; status?: string };

export function parseGatewayReply(raw: string): GatewayReply {
  // ref_id can exceed JS's safe integer range: preserve the original decimal digits.
  const parsed = JSON.parse(raw.replace(/("ref_id"\s*:\s*)(\d+)/g, '$1"$2"'));
  const data = parsed?.data;
  const code = data?.code ?? parsed?.errors?.code;
  if (!Number.isInteger(code)) throw new Error('GATEWAY_UNAVAILABLE');
  return { code, authority: data?.authority, ref_id: data?.ref_id, status: data?.status };
}

export async function gatewayCall(mode: Mode, merchant: string, method: 'request' | 'verify' | 'inquiry', body: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${gatewayOrigin(mode)}/pg/v4/payment/${method}.json`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...body, merchant_id: merchant }),
  });
  const result = parseGatewayReply(await response.text());
  if (!response.ok && result.code >= 0) throw new Error('GATEWAY_UNAVAILABLE');
  return result;
}
