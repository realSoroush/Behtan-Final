// ============================================================================
// Supabase Edge Function: body-scan
// Deno runtime. Proxies a single vision request to Gemini 2.5 Flash.
// Deploy with: supabase functions deploy body-scan --no-verify-jwt=false
// Set secret with: supabase secrets set GEMINI_API_KEY=your_key_here
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `
شما یک تحلیلگر بصری ترکیب بدنی هستید. بر اساس تصویر ارسالی و اطلاعات پایه کاربر
(قد، وزن، سن، جنسیت)، یک برآورد تقریبی از ترکیب بدنی ارائه دهید.

فقط و فقط یک شیء JSON معتبر با دقیقاً این ساختار برگردانید و هیچ متن اضافه‌ای
(بدون Markdown، بدون توضیح) ننویسید:

{
  "bodyFatPct": <عدد بین 5 تا 50>,
  "biologicalAge": <عدد بین 15 تا 80>,
  "bodyType": "ectomorph" | "mesomorph" | "endomorph",
  "estimatedMuscleMass": "low" | "average" | "high",
  "narrative": "<یک پاراگراف انگیزشی و محترمانه به زبان فارسی، حداکثر 3 جمله>",
  "confidence": "low" | "medium" | "high"
}

این یک برآورد تقریبی است، نه تشخیص پزشکی. در صورت عدم اطمینان، confidence را "low" قرار دهید.
`.trim();

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured on server' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { imageBase64, gender, heightCm, weightKg, age } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    const base64Data = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;

    const userContext = `اطلاعات کاربر: جنسیت=${gender}, قد=${heightCm}cm, وزن=${weightKg}kg, سن=${age}`;

    const geminiResponse = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${SYSTEM_PROMPT}\n\n${userContext}` },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return new Response(
        JSON.stringify({ error: 'Gemini API error', detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const geminiJson = await geminiResponse.json();
    const rawText: string | undefined =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: 'Empty response from Gemini' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Gemini returned non-JSON output' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Unexpected server error', detail: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
