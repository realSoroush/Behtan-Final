-- Behtan — behavioural activity profile for reproducible TDEE classification.
-- Nutrition v2 activity multipliers remain unchanged; this stores the answers
-- used to derive activity_level so the result can be audited/recalibrated later.

alter table public.user_profiles
  add column if not exists activity_profile_json jsonb;

comment on column public.user_profiles.activity_profile_json is
  'Behavioural activity questionnaire used to derive activity_level: daily movement, step range, workout duration/intensity, and derived score.';

alter table public.user_profiles
  drop constraint if exists user_profiles_activity_profile_json_check;

alter table public.user_profiles
  add constraint user_profiles_activity_profile_json_check
  check (
    activity_profile_json is null
    or (
      jsonb_typeof(activity_profile_json) = 'object'
      and activity_profile_json ? 'version'
      and activity_profile_json ? 'dailyMovement'
      and activity_profile_json ? 'dailySteps'
      and activity_profile_json ? 'derivedLevel'
      and activity_profile_json ? 'derivedScore'
    )
  );
