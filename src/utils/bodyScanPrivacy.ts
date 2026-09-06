import { createEmptyOnboardingData } from '../types/index.ts';
import type { BodyScanConsentJson, OnboardingData } from '../types/index.ts';

export const BODY_SCAN_CONSENT_VERSION = 1;

function isValidIsoTimestamp(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function hasCurrentBodyScanConsent(
  data: Pick<
    OnboardingData,
    'bodyScanConsentAccepted' | 'bodyScanConsentVersion' | 'bodyScanConsentAcceptedAt'
  >
): boolean {
  return (
    data.bodyScanConsentAccepted === true
    && data.bodyScanConsentVersion === BODY_SCAN_CONSENT_VERSION
    && isValidIsoTimestamp(data.bodyScanConsentAcceptedAt)
  );
}

/**
 * Raw photos are volatile UI state. This is the single persistence boundary
 * used before an onboarding draft is written to Supabase.
 */
export function toPersistedOnboardingDraft(draft: OnboardingData): OnboardingData {
  return {
    ...draft,
    bodyScanImage: null,
  };
}

/**
 * Old drafts may still contain a Base64 photo. Never hydrate that value back
 * into browser state, even before the database scrub migration has run.
 */
export function sanitizeHydratedOnboardingDraft(
  draft: Partial<OnboardingData>
): OnboardingData {
  const hydrated: OnboardingData = {
    ...createEmptyOnboardingData(),
    ...draft,
    bodyScanImage: null,
  };

  if (!hasCurrentBodyScanConsent(hydrated)) {
    hydrated.bodyScanConsentAccepted = false;
    hydrated.bodyScanConsentVersion = null;
    hydrated.bodyScanConsentAcceptedAt = null;
    hydrated.bodyScanAnalysisRequestedAt = null;
  }

  return hydrated;
}

/**
 * A persisted draft intentionally has no image. If analysis was not already
 * completed (or intentionally skipped), Step 10 cannot safely resume and must
 * send the user back to capture/upload a fresh photo.
 */
export function resolveBodyScanResumeStep(
  savedStep: number,
  draft: Partial<OnboardingData>
): number {
  const safeStep = Number.isFinite(savedStep)
    ? Math.max(1, Math.min(11, Math.trunc(savedStep)))
    : 1;
  if (safeStep < 10) return safeStep;

  const hasResult = Boolean(draft.bodyScanResult);
  const hasManualFallback = draft.bodyScanSkipped === true && Boolean(draft.manualBodyType);

  return hasResult || hasManualFallback ? safeStep : 9;
}

export function buildBodyScanConsentRecord(
  data: OnboardingData
): BodyScanConsentJson | null {
  if (
    !hasCurrentBodyScanConsent(data)
    || !isValidIsoTimestamp(data.bodyScanConsentAcceptedAt)
    || !isValidIsoTimestamp(data.bodyScanAnalysisRequestedAt)
  ) {
    return null;
  }

  return {
    version: BODY_SCAN_CONSENT_VERSION,
    acceptedAt: data.bodyScanConsentAcceptedAt,
    analysisRequestedAt: data.bodyScanAnalysisRequestedAt,
    processor: 'google_gemini',
    rawImageStored: false,
  };
}
