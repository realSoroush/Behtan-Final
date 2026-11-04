begin;

create or replace function pro_private.valid_pro_intake(a jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; born date;
begin
 if a is null or jsonb_typeof(a)<>'object' or octet_length(a::text)>4096 then return false; end if;
 if (select count(*) from jsonb_object_keys(a))<>18 then return false; end if;
 for k in select jsonb_object_keys(a) loop
  if k not in ('gender','birth_date','height_cm','weight_kg','goal','activity_level','workout_days','training_type',
   'protein_budget','vegetarian_status','allergies','medical_conditions','pregnancy_status','eating_disorder_status',
   'medications_present','injuries_present','safety_confirmed','screening_version') then return false; end if;
 end loop;
 if a->>'gender' not in ('male','female') or a->>'goal' not in ('weight_loss','weight_gain','maintenance')
 or a->>'activity_level' not in ('sedentary','lightly_active','moderate','active')
 or a->>'training_type' not in ('none','cardio','resistance','mixed')
 or a->>'protein_budget' not in ('economic','balanced','performance')
 or a->>'vegetarian_status' not in ('none','vegan','lacto_ovo','pescatarian','raw')
 or a->>'pregnancy_status' not in ('not_applicable','not_pregnant','pregnant','breastfeeding')
 or a->>'eating_disorder_status' not in ('none','history','active_or_treatment') then return false; end if;
 foreach k in array array['gender','birth_date','goal','activity_level','training_type','protein_budget','vegetarian_status','pregnancy_status','eating_disorder_status'] loop
  if jsonb_typeof(a->k)<>'string' then return false; end if;
 end loop;
 foreach k in array array['height_cm','weight_kg','workout_days','screening_version'] loop
  if jsonb_typeof(a->k)<>'number' then return false; end if;
 end loop;
 if (a->>'height_cm')::numeric not between 30 and 300 or (a->>'weight_kg')::numeric not between 0.5 and 500
 or (a->>'workout_days')::numeric not between 0 and 7 or (a->>'workout_days')::numeric<>trunc((a->>'workout_days')::numeric)
 or (a->>'screening_version')::numeric<>1 then return false; end if;
 if a->>'birth_date' !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
 born:=(a->>'birth_date')::date;
 -- Range sanity only; age and medical eligibility are rechecked by the shared
 -- policy before any future generation. Storing a hard-stop case is not bypass.
 if born<date '1900-01-01' or born>date '2100-01-01' then return false; end if;
 foreach k in array array['medications_present','injuries_present','safety_confirmed'] loop
  if jsonb_typeof(a->k)<>'boolean' then return false; end if;
 end loop;
 if a->'safety_confirmed'<>'true'::jsonb then return false; end if;
 if (a->>'gender'='male' and a->>'pregnancy_status'<>'not_applicable') or
    (a->>'gender'='female' and a->>'pregnancy_status'='not_applicable') then return false; end if;
 if ((a->>'workout_days')::numeric=0) <> (a->>'training_type'='none') then return false; end if;
 foreach k in array array['allergies','medical_conditions'] loop
  if jsonb_typeof(a->k)<>'array' or jsonb_array_length(a->k)>10 then return false; end if;
  for v in select value from jsonb_array_elements(a->k) loop
   if jsonb_typeof(v)<>'string' then return false; end if;
   if k='allergies' and v#>>'{}' not in ('dairy','gluten','peanut','tree_nut','soy','seafood','celery') then return false; end if;
   if k='medical_conditions' and v#>>'{}' not in ('diabetes','kidney_disease','heart_disease','advanced_liver_disease','fatty_liver','pcos','thyroid') then return false; end if;
   if a->>'gender'='male' and v#>>'{}'='pcos' then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;

-- Keep the sandbox's narrower bounds while sharing the allergen allowlist.
create or replace function pro_private.valid_intake(a jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if not pro_private.valid_pro_intake(a) then return false; end if;
  return (a->>'height_cm')::numeric between 100 and 250
     and (a->>'weight_kg')::numeric between 30 and 300;
end $$;

-- Client telemetry can report attempts, but cannot report a successful edit.
create or replace function public.record_product_event(p_id uuid,p_session uuid,p_event text,p_step integer default null,p_source text default 'app') returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,39));
 if p_event not in('app_open','onboarding_step','onboarding_complete','paywall_view','preflight_ok','preflight_failed','checkout_started','meal_recorded','meal_undone','meal_skipped','meal_change_unavailable','meal_change_save_failed','food_manual','food_scan','progress_saved','training_view','training_generated','pro_signup') or p_source not in('app','landing','pro') or(p_step is not null and p_step not between 1 and 11) or p_session is null then raise exception 'INVALID_EVENT';end if;
 if (select count(*) from public.product_events where user_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then return;end if;
 insert into public.product_events values(p_id,auth.uid(),p_session,p_event,p_step,p_source,now()) on conflict(id) do nothing;end$$;


create function public.save_member_meal_schedule_v3(
  p_today date, p_context text, p_days jsonb, p_expected_diet jsonb,
  p_replace boolean default false, p_meal_edit boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_diet jsonb;
  previous_meals jsonb;
  saved jsonb;
begin
  if actor is null or not public.billing_has_access() then
    raise exception 'ACCESS_DENIED';
  end if;

  -- Serialize dietary changes with saves, even when the schedule itself is untouched.
  select dietary_preferences_json into current_diet
    from public.user_profiles where id=actor for share;
  if not found or current_diet is distinct from p_expected_diet then
    raise exception 'MEAL_PROFILE_CHANGED';
  end if;

  if p_meal_edit then
    if p_replace is distinct from true or jsonb_typeof(p_days) is distinct from 'array'
       or jsonb_array_length(p_days) <> 1 or not ((p_days->0) ? 'expected_updated_at') then
      raise exception 'INVALID_MEAL_EDIT';
    end if;
    select plan->'meals' into previous_meals from public.member_meal_schedule
      where user_id=actor and plan_date=(p_days->0->>'date')::date for update;
  end if;

  saved := public.save_member_meal_schedule_v2(p_today,p_context,p_days,p_replace);
  if p_meal_edit and previous_meals is distinct from p_days->0->'plan'->'meals' then
    insert into public.product_events(id,user_id,session_id,event,step,source)
    values(gen_random_uuid(),actor,coalesce((auth.jwt()->>'session_id')::uuid,actor),
      'meal_changed_verified',null,'app');
  end if;
  return saved;
end $$;

-- Older clients must refresh before writing. They can still read their schedules.
revoke execute on function public.save_member_meal_schedule(date,text,jsonb,boolean),
  public.save_member_meal_schedule_v2(date,text,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.save_member_meal_schedule_v3(date,text,jsonb,jsonb,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.save_member_meal_schedule_v3(date,text,jsonb,jsonb,boolean,boolean)
  to authenticated;

notify pgrst, 'reload schema';
commit;
