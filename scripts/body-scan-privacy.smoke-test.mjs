import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEmptyOnboardingData } from '../src/types/index.ts';
import {
  BODY_SCAN_CONSENT_VERSION,
  buildBodyScanConsentRecord,
  hasCurrentBodyScanConsent,
  resolveBodyScanResumeStep,
  sanitizeHydratedOnboardingDraft,
  toPersistedOnboardingDraft,
} from '../src/utils/bodyScanPrivacy.ts';
import {
  BODY_SCAN_MAX_UPLOAD_BYTES,
  hasSafeBodyScanDimensions,
  isSafeNormalizedBodyScanDataUrl,
  validateBodyScanFileMetadata,
} from '../src/utils/bodyScanImage.ts';

const now = '2026-09-06T12:00:00.000Z';
const requestTime = '2026-09-06T12:01:00.000Z';
const rawImage = 'data:image/jpeg;base64,/9j/';
const consentedDraft = {
  ...createEmptyOnboardingData(),
  bodyScanImage: rawImage,
  bodyScanConsentAccepted: true,
  bodyScanConsentVersion: BODY_SCAN_CONSENT_VERSION,
  bodyScanConsentAcceptedAt: now,
  bodyScanAnalysisRequestedAt: requestTime,
};

assert.equal(hasCurrentBodyScanConsent(consentedDraft), true);
assert.equal(isSafeNormalizedBodyScanDataUrl(rawImage), true);

const persisted = toPersistedOnboardingDraft(consentedDraft);
assert.equal(persisted.bodyScanImage, null, 'Raw image leaked through persistence boundary');
assert.equal(consentedDraft.bodyScanImage, rawImage, 'Sanitizer mutated volatile in-memory state');
assert.equal(persisted.bodyScanConsentAcceptedAt, now, 'Consent audit metadata was removed');

const hydrated = sanitizeHydratedOnboardingDraft(consentedDraft);
assert.equal(hydrated.bodyScanImage, null, 'Legacy Base64 image was revived during hydration');

assert.equal(
  resolveBodyScanResumeStep(10, { ...consentedDraft, bodyScanResult: null, bodyScanSkipped: false }),
  9,
  'Image-less AI flow must resume at capture step'
);
assert.equal(
  resolveBodyScanResumeStep(10, { ...consentedDraft, bodyScanSkipped: true, manualBodyType: 'mesomorph' }),
  10,
  'Manual flow should resume at analysis summary'
);
assert.equal(
  resolveBodyScanResumeStep(11, {
    ...consentedDraft,
    bodyScanImage: null,
    bodyScanResult: {
      bodyFatPct: 25,
      biologicalAge: 30,
      bodyType: 'mesomorph',
      estimatedMuscleMass: 'average',
      narrative: 'نتیجه تخمینی تست',
      confidence: 'medium',
    },
  }),
  11,
  'Completed AI result should resume at the saved next step'
);

assert.deepEqual(buildBodyScanConsentRecord(consentedDraft), {
  version: BODY_SCAN_CONSENT_VERSION,
  acceptedAt: now,
  analysisRequestedAt: requestTime,
  processor: 'google_gemini',
  rawImageStored: false,
});
assert.equal(
  buildBodyScanConsentRecord({ ...consentedDraft, bodyScanAnalysisRequestedAt: null }),
  null,
  'Consent record must not claim an analysis that was never requested'
);

assert.equal(validateBodyScanFileMetadata({ type: 'image/jpeg', size: 1_000_000 }), null);
assert.match(
  validateBodyScanFileMetadata({ type: 'image/svg+xml', size: 1_000 }) ?? '',
  /JPG یا PNG/
);
assert.match(
  validateBodyScanFileMetadata({ type: 'image/png', size: BODY_SCAN_MAX_UPLOAD_BYTES + 1 }) ?? '',
  /۱۰ مگابایت/
);
assert.equal(hasSafeBodyScanDimensions(1080, 1920), true);
assert.equal(hasSafeBodyScanDimensions(200, 300), false);
assert.equal(hasSafeBodyScanDimensions(10_000, 10_000), false);

const root = process.cwd();
const cameraSource = readFileSync(resolve(root, 'src/components/onboarding/BodyScanCamera.tsx'), 'utf8');
const stepNineSource = readFileSync(resolve(root, 'src/components/onboarding/Step9BodyScan.tsx'), 'utf8');
const stepTenSource = readFileSync(resolve(root, 'src/components/onboarding/Step10Analysis.tsx'), 'utf8');
const profileSource = readFileSync(resolve(root, 'src/hooks/useUserProfile.ts'), 'utf8');
const edgeSource = readFileSync(resolve(root, 'supabase/functions/body-scan/index.ts'), 'utf8');
const migrationSource = readFileSync(
  resolve(root, 'supabase/migrations/20260906_012_body_scan_privacy.sql'),
  'utf8'
);

assert(cameraSource.includes('navigator.mediaDevices.getUserMedia'));
assert(cameraSource.includes("audio: false"), 'Camera request must never ask for microphone access');
assert(cameraSource.includes("openCamera('user')"), 'Front camera is not the entry default');
assert(cameraSource.includes("'environment'"), 'Rear-camera switch is missing');
assert(cameraSource.includes('getTracks().forEach((track) => track.stop())'), 'Camera tracks are not stopped');
assert(cameraSource.includes("document.visibilityState !== 'hidden'"), 'Background privacy shutdown is missing');
assert(cameraSource.includes('countdownValueRef.current = 5'), 'Five-second timer is missing');

assert(stepNineSource.includes('Google Gemini'), 'Processor is not disclosed in consent copy');
assert(stepNineSource.includes('عکس بکشید یا آپلود کنید'), 'Existing upload action was removed');
assert(!stepNineSource.includes('به هیچ سرور خارجی ارسال نمی‌شود'), 'False privacy promise is still present');
assert(stepTenSource.includes('bodyScanResult: scanResult, bodyScanImage: null'), 'Raw image is not cleared after success');
assert(stepTenSource.includes('timeoutMs: 45_000'), 'Client analysis timeout is missing');
assert(profileSource.includes('toPersistedOnboardingDraft(draft)'), 'Database persistence is not sanitized');

assert(edgeSource.includes('hasValidUserSession(req)'), 'Edge Function does not verify user authentication');
assert(edgeSource.includes("'x-goog-api-key': GEMINI_API_KEY"), 'Gemini key should not be placed in the URL');
assert(edgeSource.includes('detectImageMimeType'), 'Server-side image signature validation is missing');
assert(edgeSource.includes('MAX_IMAGE_BYTES'), 'Server-side image size limit is missing');
assert(!edgeSource.includes("'Access-Control-Allow-Origin': '*'"), 'Body scan CORS is still wildcarded');
assert(!edgeSource.includes("detail: errText"), 'Provider error details must not leak to clients');

assert(migrationSource.includes("onboarding_draft_json - 'bodyScanImage'"));
assert(migrationSource.includes('body_scan_consent_json'));
assert(migrationSource.includes("body_scan_consent_json->'version' = '1'::jsonb"));
assert(migrationSource.includes("body_scan_consent_json->'rawImageStored' = 'false'::jsonb"));
assert(!migrationSource.toLowerCase().includes('storage.objects'), 'Raw photo Storage must not be introduced');

console.log('✅ Behtan body scan camera/privacy smoke test passed');
console.log('   Front/rear camera + five-second capture guide: OK');
console.log('   Upload validation + EXIF-stripping normalization: OK');
console.log('   Raw photo persistence and legacy draft scrub: OK');
console.log('   Consent, authenticated Edge Function and bounded payload: OK');
