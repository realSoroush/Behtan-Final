/**
 * geminiClient.ts
 * ----------------------------------------------------------------------------
 * SCOPE BOUNDARY: This is the ONLY file in the app allowed to call an AI
 * model. It is used exclusively for the onboarding "AI Body Scan" step
 * (vision analysis of a user photo -> body composition estimate).
 *
 * AI is NEVER used for: calorie math, macro math, meal generation, or any
 * nutrition data. Those are 100% deterministic (see nutritionHelpers.ts and
 * mealPlanEngine.ts).
 *
 * The Gemini API key must NEVER be exposed to the browser. This client calls
 * a Supabase Edge Function ("body-scan") which holds the key server-side and
 * proxies the request to Google's Gemini API. See supabase/functions/body-scan.
 * ----------------------------------------------------------------------------
 */

import { supabase } from './supabaseClient';
import type { BodyScanResult, Gender } from '@/types';

export interface BodyScanRequest {
  imageBase64: string; // data URL or raw base64 (edge function normalizes)
  gender: Gender;
  heightCm: number;
  weightKg: number;
  age: number;
}

export class BodyScanError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'BodyScanError';
  }
}

/**
 * Sends a body photo + basic biometrics to the body-scan edge function,
 * which calls Gemini 2.5 Flash (vision) and returns a structured JSON
 * result matching BodyScanResult. Any malformed/incomplete response is
 * rejected client-side rather than trusted blindly.
 */
export async function analyzeBodyScan(
  request: BodyScanRequest
): Promise<BodyScanResult> {
  const { data, error } = await supabase.functions.invoke('body-scan', {
    body: request,
  });

  if (error) {
    throw new BodyScanError('تحلیل تصویر با خطا مواجه شد. لطفاً دوباره تلاش کنید.', error);
  }

  if (!isValidBodyScanResult(data)) {
    throw new BodyScanError('پاسخ دریافتی از سرویس تحلیل، معتبر نیست.');
  }

  return data;
}

/**
 * Runtime validation guard — we never trust AI JSON output blindly.
 * If Gemini returns anything outside expected shape/ranges, we reject it
 * so the UI can fall back to the manual "visual selection" path instead
 * of showing bogus numbers.
 */
function isValidBodyScanResult(data: unknown): data is BodyScanResult {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  const bodyTypes = ['ectomorph', 'mesomorph', 'endomorph'];
  const muscleLevels = ['low', 'average', 'high'];
  const confidenceLevels = ['low', 'medium', 'high'];

  return (
    typeof d.bodyFatPct === 'number' &&
    d.bodyFatPct > 0 &&
    d.bodyFatPct < 70 &&
    typeof d.biologicalAge === 'number' &&
    d.biologicalAge > 10 &&
    d.biologicalAge < 100 &&
    typeof d.bodyType === 'string' &&
    bodyTypes.includes(d.bodyType) &&
    typeof d.estimatedMuscleMass === 'string' &&
    muscleLevels.includes(d.estimatedMuscleMass) &&
    typeof d.narrative === 'string' &&
    d.narrative.length > 0 &&
    typeof d.confidence === 'string' &&
    confidenceLevels.includes(d.confidence)
  );
}
