/**
 * geminiClient.ts
 * ----------------------------------------------------------------------------
 * Body composition analysis only. Food photo estimates have their own authenticated
 * foodScanClient/food-scan boundary and are always labeled as estimates.
 * Prescribed calorie targets and meal generation remain deterministic.
 *
 * The Gemini API key must NEVER be exposed to the browser. This client calls
 * a Supabase Edge Function ("body-scan") which holds the key server-side and
 * proxies the request to Google's Gemini API. See supabase/functions/body-scan.
 * ----------------------------------------------------------------------------
 */

import { supabase } from './supabaseClient';
import type { BodyScanResult, Gender } from '@/types';
import { isSafeNormalizedBodyScanDataUrl } from '@/utils/bodyScanImage';

export interface BodyScanRequest {
  /** Volatile normalized JPEG data URL. It is never written to Supabase tables/storage. */
  imageBase64: string;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  age: number;
}

export interface BodyScanRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
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
  request: BodyScanRequest,
  options: BodyScanRequestOptions = {}
): Promise<BodyScanResult> {
  if (!isSafeNormalizedBodyScanDataUrl(request.imageBase64)) {
    throw new BodyScanError('تصویر آماده‌شده معتبر نیست. لطفاً عکس را دوباره ثبت کنید.');
  }

  const { data, error } = await supabase.functions.invoke('body-scan', {
    body: request,
    signal: options.signal,
    timeout: options.timeoutMs ?? 45_000,
  });

  if (error) {
    if (options.signal?.aborted) {
      throw new BodyScanError('تحلیل تصویر لغو شد.', error);
    }

    const errorText = String(error).toLowerCase();
    if (errorText.includes('abort') || errorText.includes('timeout')) {
      throw new BodyScanError('زمان پاسخ سرویس تمام شد. اتصال اینترنت را بررسی و دوباره تلاش کنید.', error);
    }
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
export function isValidBodyScanResult(data: unknown): data is BodyScanResult {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  const bodyTypes = ['ectomorph', 'mesomorph', 'endomorph'];
  const muscleLevels = ['low', 'average', 'high'];
  const confidenceLevels = ['low', 'medium', 'high'];

  return (
    typeof d.bodyFatPct === 'number' &&
    Number.isFinite(d.bodyFatPct) &&
    d.bodyFatPct >= 5 &&
    d.bodyFatPct <= 50 &&
    typeof d.biologicalAge === 'number' &&
    Number.isFinite(d.biologicalAge) &&
    d.biologicalAge >= 15 &&
    d.biologicalAge <= 80 &&
    typeof d.bodyType === 'string' &&
    bodyTypes.includes(d.bodyType) &&
    typeof d.estimatedMuscleMass === 'string' &&
    muscleLevels.includes(d.estimatedMuscleMass) &&
    typeof d.narrative === 'string' &&
    d.narrative.length > 0 &&
    d.narrative.length <= 600 &&
    typeof d.confidence === 'string' &&
    confidenceLevels.includes(d.confidence)
  );
}
