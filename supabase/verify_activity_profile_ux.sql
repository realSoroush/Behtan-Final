-- Should return one row showing the new column.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name = 'activity_profile_json';

-- Existing users may legitimately be null; new onboarding completions should
-- persist both the derived activity_level and the behavioural JSON.
select count(*) as completed_profiles_missing_activity_profile
from public.user_profiles
where onboarding_completed = true
  and activity_level is not null
  and activity_profile_json is null;
