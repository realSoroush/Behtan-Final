-- Behtan Body Scan Safety & Privacy v1
-- Stores consent metadata only and irreversibly removes legacy Base64 photos
-- from onboarding drafts. No body-photo Storage bucket is created by design.

alter table public.user_profiles
  add column if not exists body_scan_consent_json jsonb;

alter table public.user_profiles
  drop constraint if exists user_profiles_body_scan_consent_json_check;

alter table public.user_profiles
  add constraint user_profiles_body_scan_consent_json_check
  check (
    body_scan_consent_json is null
    or (
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
    )
  );

comment on column public.user_profiles.body_scan_consent_json is
  'Body-scan consent/audit metadata only. Raw photos must never be persisted in database or Storage.';

-- A persisted draft can no longer resume directly into analysis because its
-- raw photo is intentionally absent. Completed AI/manual outcomes may resume.
update public.user_profiles
set
  onboarding_step = case
    when onboarding_completed = false
      and onboarding_step >= 10
      and (
        onboarding_draft_json->'bodyScanResult' is null
        or onboarding_draft_json->'bodyScanResult' = 'null'::jsonb
      )
      and not (
        onboarding_draft_json->>'bodyScanSkipped' = 'true'
        and nullif(onboarding_draft_json->>'manualBodyType', '') is not null
      )
    then 9
    else onboarding_step
  end,
  onboarding_draft_json = onboarding_draft_json - 'bodyScanImage'
where jsonb_typeof(onboarding_draft_json) = 'object'
  and (
    onboarding_draft_json ? 'bodyScanImage'
    or (
      onboarding_completed = false
      and onboarding_step >= 10
      and (
        onboarding_draft_json->'bodyScanResult' is null
        or onboarding_draft_json->'bodyScanResult' = 'null'::jsonb
      )
    )
  );
