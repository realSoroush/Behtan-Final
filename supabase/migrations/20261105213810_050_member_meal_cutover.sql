begin;

-- Preserve the previous read fields and service-role grant during rollout.
create or replace function public.member_read_meal_day(p_user uuid, p_day date, p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Tehran')::date;
  state jsonb;
begin
  if p_day is null or p_day not between today and today + 6 then raise exception 'INVALID_MEAL_DATE'; end if;
  if not exists (
    select 1 from public.user_subscriptions s join public.billing_settings b on b.id and b.mode = s.mode
    join auth.users a on a.id = s.user_id
    where s.user_id = p_user and a.phone_confirmed_at is not null
      and s.revoked_at is null and s.starts_at <= now() and s.expires_at > now()
  ) then raise exception 'ACCESS_DENIED'; end if;

  select jsonb_build_object(
    'profile', to_jsonb(u),
    'catalog_revision', (select revision::text from public.member_catalog_version where id),
    'intake_revision', coalesce((select revision from public.member_meal_day_revisions
      where user_id = p_user and plan_date = p_day), 0)::text,
    'schedule', (select jsonb_build_object(
      'plan', s.plan, 'updated_at', s.updated_at, 'context_key', s.context_key,
      'server_context_key', s.server_context_key,
      'server_verified', s.server_verified_at is not null and s.server_verified_at = s.updated_at)
      from public.member_meal_schedule s where s.user_id = p_user and s.plan_date = p_day),
    'previous_plan', (select s.plan from public.member_meal_schedule s
      where s.user_id = p_user and s.plan_date = p_day - 1),
    'checkins', coalesce((select jsonb_object_agg(meal_slot, meal_snapshot) from public.daily_meal_checkins
      where user_id = p_user and plan_date = p_day), '{}'::jsonb),
    'skipped', coalesce((select jsonb_agg(slot order by slot) from public.member_skipped_meals
      where user_id = p_user and plan_date = p_day), '[]'::jsonb),
    'extras', coalesce((select jsonb_agg(e.meal_snapshot order by e.created_at, e.id) from (
      select id, created_at, meal_snapshot from public.member_extra_foods
      where user_id = p_user and plan_date = p_day order by created_at, id limit 101
    ) e), '[]'::jsonb),
    'extra_food_ids', coalesce((select jsonb_agg(e.id order by e.created_at, e.id) from (
      select id, created_at from public.member_extra_foods
      where user_id = p_user and plan_date = p_day order by created_at, id limit 101
    ) e), '[]'::jsonb),
    'operation', (select jsonb_build_object('hash', o.request_hash, 'result', o.result)
      from public.member_meal_schedule_operations o where o.user_id = p_user and o.request_id = p_request_id
        and o.created_at >= now() - interval '24 hours')
  ) into state from public.user_profiles u where u.id = p_user and u.onboarding_completed;
  if state is null then raise exception 'ACCESS_DENIED'; end if;
  return state;
end $$;

-- A member can generate today plus six future days in the same minute.
alter table public.member_compute_usage drop constraint member_compute_usage_requests_check;
alter table public.member_compute_usage add constraint member_compute_usage_requests_check
  check (requests between 1 and (case when action = 'meal_schedule' then 12 else 5 end));

create or replace function public.member_reserve_compute(p_user uuid,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare accepted integer;
begin
  if p_action not in('preflight','training','meal_schedule') or not exists(
    select 1 from auth.users where id=p_user and phone_confirmed_at is not null
  ) then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.member_compute_usage values(p_user,p_action,date_trunc('minute',clock_timestamp()),1)
    on conflict(user_id,action,bucket) do update set requests=public.member_compute_usage.requests+1
    where public.member_compute_usage.requests < case when p_action = 'meal_schedule' then 12 else 5 end returning requests into accepted;
  return accepted is not null;
end $$;

notify pgrst, 'reload schema';
commit;
