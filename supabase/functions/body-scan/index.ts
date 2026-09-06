// ============================================================================
// Supabase Edge Function: body-scan
// Authenticated, bounded proxy for one ephemeral Gemini vision request.
// Deploy with JWT verification enabled (default): supabase functions deploy body-scan
// Set secret with: supabase secrets set GEMINI_API_KEY=your_key_here
// Optional: BODY_SCAN_ALLOWED_ORIGINS=https://preview.example.com
// ============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_CHARACTERS = 7_000_000;
const GEMINI_TIMEOUT_MS = 40_000;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://behtan.fit',
  'https://www.behtan.fit',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const EXTRA_ALLOWED_ORIGINS = (Deno.env.get('BODY_SCAN_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set([...DEFAULT_ALLOWED_ORIGINS, ...EXTRA_ALLOWED_ORIGINS]);

const SYSTEM_PROMPT = `
شما یک تحلیلگر بصری ترکیب بدنی هستید. بر اساس تصویر ارسالی و اطلاعات پایه کاربر
(قد، وزن، سن، جنسیت)، فقط یک برآورد تقریبی و غیرپزشکی ارائه دهید.

فقط و فقط یک شیء JSON معتبر با دقیقاً این ساختار برگردانید و هیچ متن اضافه‌ای
(بدون Markdown، بدون توضیح) ننویسید:

{
  "bodyFatPct": <عدد بین 5 تا 50>,
  "biologicalAge": <عدد بین 15 تا 80>,
  "bodyType": "ectomorph" | "mesomorph" | "endomorph",
  "estimatedMuscleMass": "low" | "average" | "high",
  "narrative": "<یک پاراگراف محترمانه به زبان فارسی، حداکثر 3 جمله و بدون تشخیص پزشکی>",
  "confidence": "low" | "medium" | "high"
}

اگر تمام بدن واضح نیست یا پوشش/نور/زاویه مانع برآورد قابل اتکا است، confidence را "low" قرار دهید.
`.trim();

interface BodyScanRequestPayload {
  imageBase64: string;
  gender: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  age: number;
}

interface BodyScanResultPayload {
  bodyFatPct: number;
  biologicalAge: number;
  bodyType: 'ectomorph' | 'mesomorph' | 'endomorph';
  estimatedMuscleMass: 'low' | 'average' | 'high';
  narrative: string;
  confidence: 'low' | 'medium' | 'high';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requestOrigin(req: Request): string | null {
  return req.headers.get('origin');
}

function isAllowedOrigin(req: Request): boolean {
  const origin = requestOrigin(req);
  return origin === null || ALLOWED_ORIGINS.has(origin);
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  const origin = requestOrigin(req);
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(
  req: Request,
  status: number,
  payload: Record<string, unknown> | BodyScanResultPayload
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function hasValidUserSession(req: Request): Promise<boolean> {
  const authorization = req.headers.get('authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return false;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase auth environment is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response: Response;

  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: authorization,
        apikey: SUPABASE_ANON_KEY,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) return false;
  const user: unknown = await response.json();
  return isRecord(user) && typeof user.id === 'string' && user.id.length > 0;
}

function parseRequestPayload(payload: unknown): BodyScanRequestPayload | null {
  if (!isRecord(payload)) return null;

  const { imageBase64, gender, heightCm, weightKg, age } = payload;
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) return null;
  if (gender !== 'male' && gender !== 'female') return null;
  if (typeof heightCm !== 'number' || !Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) return null;
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 30 || weightKg > 350) return null;
  if (typeof age !== 'number' || !Number.isInteger(age) || age < 18 || age > 70) return null;

  return { imageBase64, gender, heightCm, weightKg, age };
}

function detectImageMimeType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return 'image/jpeg';

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = bytes.length >= pngSignature.length
    && pngSignature.every((value, index) => bytes[index] === value);
  return isPng ? 'image/png' : null;
}

function decodeSupportedImage(dataUrl: string): {
  base64Data: string;
  mimeType: 'image/jpeg' | 'image/png';
} | null {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;

  const declaredMimeType = match[1] as 'image/jpeg' | 'image/png';
  const base64Data = match[2];
  if (base64Data.length > MAX_BASE64_CHARACTERS) return null;

  try {
    const binary = atob(base64Data);
    if (binary.length === 0 || binary.length > MAX_IMAGE_BYTES) return null;

    const signatureLength = Math.min(binary.length, 8);
    const signature = new Uint8Array(signatureLength);
    for (let index = 0; index < signatureLength; index += 1) {
      signature[index] = binary.charCodeAt(index);
    }

    const detectedMimeType = detectImageMimeType(signature);
    if (!detectedMimeType || detectedMimeType !== declaredMimeType) return null;

    return { base64Data, mimeType: detectedMimeType };
  } catch {
    return null;
  }
}

function extractGeminiText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return null;
  const firstCandidate = payload.candidates[0];
  if (!isRecord(firstCandidate) || !isRecord(firstCandidate.content)) return null;
  const parts = firstCandidate.content.parts;
  if (!Array.isArray(parts) || !isRecord(parts[0])) return null;
  return typeof parts[0].text === 'string' ? parts[0].text : null;
}

function validateBodyScanResult(payload: unknown): BodyScanResultPayload | null {
  if (!isRecord(payload)) return null;

  const bodyTypes = ['ectomorph', 'mesomorph', 'endomorph'] as const;
  const muscleLevels = ['low', 'average', 'high'] as const;
  const confidenceLevels = ['low', 'medium', 'high'] as const;
  const { bodyFatPct, biologicalAge, bodyType, estimatedMuscleMass, narrative, confidence } = payload;

  if (typeof bodyFatPct !== 'number' || !Number.isFinite(bodyFatPct) || bodyFatPct < 5 || bodyFatPct > 50) return null;
  if (typeof biologicalAge !== 'number' || !Number.isFinite(biologicalAge) || biologicalAge < 15 || biologicalAge > 80) return null;
  if (typeof bodyType !== 'string' || !bodyTypes.includes(bodyType as typeof bodyTypes[number])) return null;
  if (typeof estimatedMuscleMass !== 'string' || !muscleLevels.includes(estimatedMuscleMass as typeof muscleLevels[number])) return null;
  if (typeof narrative !== 'string' || narrative.trim().length === 0 || narrative.length > 600) return null;
  if (typeof confidence !== 'string' || !confidenceLevels.includes(confidence as typeof confidenceLevels[number])) return null;

  return {
    bodyFatPct,
    biologicalAge,
    bodyType: bodyType as BodyScanResultPayload['bodyType'],
    estimatedMuscleMass: estimatedMuscleMass as BodyScanResultPayload['estimatedMuscleMass'],
    narrative: narrative.trim(),
    confidence: confidence as BodyScanResultPayload['confidence'],
  };
}

serve(async (req: Request) => {
  if (!isAllowedOrigin(req)) {
    return jsonResponse(req, 403, { error: 'Origin is not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, { error: 'Method not allowed' });
  }

  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return jsonResponse(req, 415, { error: 'Content-Type must be application/json' });
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse(req, 413, { error: 'Request payload is too large' });
  }

  try {
    if (!(await hasValidUserSession(req))) {
      return jsonResponse(req, 401, { error: 'Authentication required' });
    }

    if (!GEMINI_API_KEY) {
      return jsonResponse(req, 500, { error: 'Body scan service is not configured' });
    }

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonResponse(req, 413, { error: 'Request payload is too large' });
    }

    let jsonPayload: unknown;
    try {
      jsonPayload = JSON.parse(rawBody);
    } catch {
      return jsonResponse(req, 400, { error: 'Request body must be valid JSON' });
    }

    const requestPayload = parseRequestPayload(jsonPayload);
    if (!requestPayload) {
      return jsonResponse(req, 400, { error: 'Invalid body scan request' });
    }

    const image = decodeSupportedImage(requestPayload.imageBase64);
    if (!image) {
      return jsonResponse(req, 400, { error: 'Invalid or unsupported image payload' });
    }

    const userContext = [
      `جنسیت=${requestPayload.gender}`,
      `قد=${requestPayload.heightCm}cm`,
      `وزن=${requestPayload.weightKg}kg`,
      `سن=${requestPayload.age}`,
    ].join('، ');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    let geminiResponse: Response;

    try {
      geminiResponse = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${SYSTEM_PROMPT}\n\nاطلاعات کاربر: ${userContext}` },
                {
                  inline_data: {
                    mime_type: image.mimeType,
                    data: image.base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!geminiResponse.ok) {
      console.error('[body-scan] Gemini rejected request with status', geminiResponse.status);
      return jsonResponse(req, 502, { error: 'Image analysis provider failed' });
    }

    const rawText = extractGeminiText(await geminiResponse.json());
    if (!rawText) {
      return jsonResponse(req, 502, { error: 'Image analysis provider returned an empty response' });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return jsonResponse(req, 502, { error: 'Image analysis provider returned invalid output' });
    }

    const validatedResult = validateBodyScanResult(parsed);
    if (!validatedResult) {
      return jsonResponse(req, 502, { error: 'Image analysis result failed validation' });
    }

    return jsonResponse(req, 200, validatedResult);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return jsonResponse(req, 504, { error: 'Image analysis timed out' });
    }

    console.error('[body-scan] Unexpected error type', error instanceof Error ? error.name : 'unknown');
    return jsonResponse(req, 500, { error: 'Unexpected body scan error' });
  }
});
