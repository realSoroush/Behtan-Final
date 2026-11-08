begin;

-- Additive first stage: deploy the compatible server/client before migration 052.
create function public.member_commit_intake(
  p_user uuid, p_day date, p_request_id uuid, p_request_hash text,
  p_profile jsonb, p_catalog_revision bigint, p_intake_revision bigint,
  p_expected_updated_at timestamptz, p_kind text, p_slot text,
  p_meal jsonb, p_extra_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Tehran')::date;
  prior_operation public.member_meal_schedule_operations%rowtype;
  current_profile jsonb;
  current_revision bigint;
  current_intake bigint;
  current_updated_at timestamptz;
  saved jsonb;
begin
  if p_day is null or p_day <> today then raise exception 'INVALID_MEAL_DATE'; end if;
  if p_request_id is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
      or p_kind is null or p_kind not in ('record','undo-record','skip','undo-skip','extra-add','extra-remove')
      then raise exception 'INVALID_REQUEST'; end if;
  if p_kind = 'extra-remove' then
    if p_extra_id is null or p_slot is not null or p_meal is not null then raise exception 'INVALID_REQUEST'; end if;
  else
    if p_extra_id is not null or p_slot is null or p_slot not in
      ('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack','post_workout')
      then raise exception 'INVALID_REQUEST'; end if;
    if p_kind in ('record','extra-add') then
      if jsonb_typeof(p_meal) is distinct from 'object' or octet_length(p_meal::text) > 64000
          or p_meal->>'slot' is distinct from p_slot or p_meal->'consumed' is distinct from 'true'::jsonb
          or jsonb_typeof(p_meal->'components') is distinct from 'array'
          or jsonb_array_length(p_meal->'components') not between 1 and 30
          then raise exception 'INVALID_INTAKE'; end if;
    elsif p_meal is not null then raise exception 'INVALID_REQUEST'; end if;
  end if;

  -- Same lock order as member_commit_meal_day: profile, catalog, entitlement,
  -- operation key, day revision, schedule. Legacy writers close in stage 052.
  select to_jsonb(u) into current_profile from public.user_profiles u
    where u.id = p_user and u.onboarding_completed for share;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  select revision into current_revision from public.member_catalog_version where id for share;
  perform 1 from public.user_subscriptions s join public.billing_settings b on b.id and b.mode = s.mode
    join auth.users a on a.id = s.user_id
    where s.user_id = p_user and a.phone_confirmed_at is not null
      and s.revoked_at is null and s.starts_at <= now() and s.expires_at > now()
    limit 1 for share of s, b;
  if not found then raise exception 'ACCESS_DENIED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text || p_request_id::text, 49));
  delete from public.member_meal_schedule_operations
    where user_id = p_user and created_at < now() - interval '24 hours';
  select * into prior_operation from public.member_meal_schedule_operations
    where user_id = p_user and request_id = p_request_id;
  if found then
    if prior_operation.request_hash is distinct from p_request_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return prior_operation.result || jsonb_build_object('replayed', true);
  end if;
  if current_profile is distinct from p_profile or current_revision is distinct from p_catalog_revision then
    raise exception 'STALE_CONTEXT';
  end if;
  insert into public.member_meal_day_revisions(user_id, plan_date) values (p_user, p_day) on conflict do nothing;
  select revision into current_intake from public.member_meal_day_revisions
    where user_id = p_user and plan_date = p_day for update;
  if current_intake is distinct from p_intake_revision then raise exception 'STALE_INTAKE'; end if;
  select updated_at into current_updated_at from public.member_meal_schedule
    where user_id = p_user and plan_date = p_day for share;
  if current_updated_at is distinct from p_expected_updated_at then raise exception 'STALE_PLAN'; end if;

  -- Charge only a new accepted action, inside the same transaction.
  if not public.member_reserve_compute(p_user,'meal_intake') then raise exception 'RATE_LIMITED'; end if;

  case p_kind
    when 'record' then
      insert into public.daily_meal_checkins(user_id,plan_date,meal_slot,template_id,meal_snapshot,consumed_at)
        values(p_user,p_day,p_slot,p_meal->>'templateId',p_meal,clock_timestamp())
        on conflict(user_id,plan_date,meal_slot) do update set
          template_id=excluded.template_id,meal_snapshot=excluded.meal_snapshot,consumed_at=excluded.consumed_at;
    when 'undo-record' then
      delete from public.daily_meal_checkins where user_id=p_user and plan_date=p_day and meal_slot=p_slot;
    when 'skip' then
      insert into public.member_skipped_meals(user_id,plan_date,slot) values(p_user,p_day,p_slot)
        on conflict(user_id,plan_date,slot) do nothing;
    when 'undo-skip' then
      delete from public.member_skipped_meals where user_id=p_user and plan_date=p_day and slot=p_slot;
    when 'extra-add' then
      if (select count(*) from public.member_extra_foods where user_id=p_user and plan_date=p_day) >= 100
        then raise exception 'INTAKE_LIMIT'; end if;
      -- Request identity is also the durable row identity: an expired receipt
      -- never permits a second copy of the same extra-food action.
      if exists(select 1 from public.member_extra_foods where id=p_request_id) then raise exception 'REQUEST_CONFLICT'; end if;
      insert into public.member_extra_foods(id,user_id,plan_date,meal_slot,meal_snapshot)
        values(p_request_id,p_user,p_day,p_slot,p_meal);
    when 'extra-remove' then
      delete from public.member_extra_foods where user_id=p_user and plan_date=p_day and id=p_extra_id;
      if not found then raise exception 'INTAKE_NOT_FOUND'; end if;
  end case;
  select revision into current_intake from public.member_meal_day_revisions
    where user_id=p_user and plan_date=p_day;
  -- Store a small acknowledgement, not another copy of the day's food history.
  saved := jsonb_build_object('kind','intake','date',p_day,
    'intakeRevision',current_intake::text,'expectedUpdatedAt',current_updated_at,'replayed',false);
  insert into public.member_meal_schedule_operations(user_id,request_id,request_hash,result)
    values(p_user,p_request_id,p_request_hash,saved);
  return saved;
end $$;
revoke all on function public.member_commit_intake(uuid,date,uuid,text,jsonb,bigint,bigint,timestamptz,text,text,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.member_commit_intake(uuid,date,uuid,text,jsonb,bigint,bigint,timestamptz,text,text,jsonb,uuid)
  to service_role;

alter table public.member_compute_usage drop constraint member_compute_usage_requests_check;
alter table public.member_compute_usage add constraint member_compute_usage_requests_check
  check(requests between 1 and (case action when 'meal_intake' then 30 when 'meal_schedule' then 12 else 5 end));
create or replace function public.member_reserve_compute(p_user uuid,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare accepted integer;
begin
  if p_action not in('preflight','training','meal_schedule','meal_intake') or not exists(
    select 1 from auth.users where id=p_user and phone_confirmed_at is not null
  ) then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.member_compute_usage values(p_user,p_action,date_trunc('minute',clock_timestamp()),1)
    on conflict(user_id,action,bucket) do update set requests=public.member_compute_usage.requests+1
    where public.member_compute_usage.requests < case p_action when 'meal_intake' then 30 when 'meal_schedule' then 12 else 5 end
    returning requests into accepted;
  return accepted is not null;
end $$;
notify pgrst, 'reload schema';
commit;
