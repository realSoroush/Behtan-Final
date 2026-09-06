-- Run after 20260906_012_body_scan_privacy.sql.

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name = 'body_scan_consent_json';

-- Expected result: 0. A JSON null is harmless, but no non-empty string may remain.
select count(*) as drafts_with_raw_body_photo
from public.user_profiles
where jsonb_typeof(onboarding_draft_json) = 'object'
  and jsonb_typeof(onboarding_draft_json->'bodyScanImage') = 'string'
  and length(onboarding_draft_json->>'bodyScanImage') > 0;

-- Expected result: 0. Consent rows must use the exact v1 audit shape and may
-- never claim that Behtan persisted the raw image.
select count(*) as invalid_body_scan_consent_records
from public.user_profiles
where body_scan_consent_json is not null
  and not (
    jsonb_typeof(body_scan_consent_json) = 'object'
    and body_scan_consent_json ?& array[
      'version',
      'acceptedAt',
      'analysisRequestedAt',
      'processor',
      'rawImageStored'
    ]
    and body_scan_consent_json - array[
      'version',
      'acceptedAt',
      'analysisRequestedAt',
      'processor',
      'rawImageStored'
    ] = '{}'::jsonb
    and body_scan_consent_json->'version' = '1'::jsonb
    and jsonb_typeof(body_scan_consent_json->'acceptedAt') = 'string'
    and jsonb_typeof(body_scan_consent_json->'analysisRequestedAt') = 'string'
    and body_scan_consent_json->>'processor' = 'google_gemini'
    and body_scan_consent_json->'rawImageStored' = 'false'::jsonb
  );

-- Expected result: 0. Image-less, unfinished analysis resumes at Step 9.
select count(*) as invalid_image_less_analysis_resumes
from public.user_profiles
where onboarding_completed = false
  and onboarding_step >= 10
  and jsonb_typeof(onboarding_draft_json) = 'object'
  and (
    onboarding_draft_json->'bodyScanResult' is null
    or onboarding_draft_json->'bodyScanResult' = 'null'::jsonb
  )
  and not (
    onboarding_draft_json->>'bodyScanSkipped' = 'true'
    and nullif(onboarding_draft_json->>'manualBodyType', '') is not null
  );
