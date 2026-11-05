begin;

-- A day clock changes in the same transaction as every intake change.
-- The service locks this clock when committing a recommendation.
create table public.member_meal_day_revisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  revision bigint not null default 0,
  primary key (user_id, plan_date)
);
create table public.member_meal_schedule_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
create index member_meal_schedule_operations_expiry
  on public.member_meal_schedule_operations(user_id, created_at);

alter table public.member_meal_day_revisions enable row level security;
alter table public.member_meal_schedule_operations enable row level security;
revoke all on public.member_meal_day_revisions, public.member_meal_schedule_operations from public, anon, authenticated;

-- Legacy saves change updated_at and therefore invalidate this marker. No
-- legacy row becomes trusted merely because its plan JSON contains metadata.
alter table public.member_meal_schedule add column server_verified_at timestamptz,
  add column server_context_key text;

create function public.member_bump_intake_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_user uuid;
  old_date date;
  new_user uuid;
  new_date date;
  affected record;
begin
  if tg_op <> 'INSERT' then old_user := old.user_id; old_date := old.plan_date; end if;
  if tg_op <> 'DELETE' then new_user := new.user_id; new_date := new.plan_date; end if;
  for affected in
    select distinct actor, day from (values (old_user, old_date), (new_user, new_date)) as days(actor, day)
      where actor is not null order by actor, day
  loop
    insert into public.member_meal_day_revisions as clock(user_id, plan_date, revision)
      select affected.actor, affected.day, 1 where exists (select 1 from auth.users where id = affected.actor)
      on conflict (user_id, plan_date) do update set revision = clock.revision + 1;
  end loop;
  return null;
end $$;
revoke all on function public.member_bump_intake_revision() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['daily_meal_checkins', 'member_skipped_meals', 'member_extra_foods']
  loop
    execute format('create trigger member_intake_revision after insert or update or delete on public.%I
      for each row execute function public.member_bump_intake_revision()', table_name);
  end loop;
end $$;

create function public.member_read_meal_day(p_user uuid, p_day date, p_request_id uuid)
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
    'operation', (select jsonb_build_object('hash', o.request_hash, 'result', o.result)
      from public.member_meal_schedule_operations o where o.user_id = p_user and o.request_id = p_request_id
        and o.created_at >= now() - interval '24 hours')
  ) into state from public.user_profiles u where u.id = p_user and u.onboarding_completed;
  if state is null then raise exception 'ACCESS_DENIED'; end if;
  return state;
end $$;

create function public.member_commit_meal_day(
  p_user uuid, p_day date, p_request_id uuid, p_request_hash text,
  p_profile jsonb, p_catalog_revision bigint, p_intake_revision bigint,
  p_expected_updated_at timestamptz, p_context text, p_plan jsonb, p_meal_edit boolean, p_server_context_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Tehran')::date;
  prior_operation public.member_meal_schedule_operations%rowtype;
  current_profile jsonb;
  current_revision bigint;
  current_intake bigint;
  current_updated_at timestamptz;
  next_updated_at timestamptz;
  saved jsonb;
begin
  if p_day is null or p_day not between today and today + 6 then raise exception 'INVALID_MEAL_DATE'; end if;
  if p_request_id is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
      or p_context is null or length(p_context) not between 1 and 100
      or p_server_context_key is null or p_server_context_key !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(p_plan) is distinct from 'object' or octet_length(p_plan::text) > 399000
      or jsonb_typeof(p_plan->'meals') is distinct from 'array'
      or jsonb_array_length(p_plan->'meals') not between 1 and 7 then raise exception 'INVALID_PLAN'; end if;

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

  -- Identical requests serialize even if the caller sends the same key on
  -- two different days. A successfully committed result can be replayed.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || p_request_id::text, 49));
  delete from public.member_meal_schedule_operations
    where user_id = p_user and created_at < now() - interval '24 hours';
  select * into prior_operation from public.member_meal_schedule_operations
    where user_id = p_user and request_id = p_request_id;
  if found then
    if prior_operation.request_hash is distinct from p_request_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return prior_operation.result;
  end if;

  if current_profile is distinct from p_profile or current_revision is distinct from p_catalog_revision then
    raise exception 'STALE_CONTEXT';
  end if;
  insert into public.member_meal_day_revisions(user_id, plan_date) values (p_user, p_day)
    on conflict do nothing;
  select revision into current_intake from public.member_meal_day_revisions
    where user_id = p_user and plan_date = p_day for update;
  if current_intake is distinct from p_intake_revision then raise exception 'STALE_INTAKE'; end if;

  select updated_at into current_updated_at from public.member_meal_schedule
    where user_id = p_user and plan_date = p_day for update;
  if current_updated_at is distinct from p_expected_updated_at then raise exception 'STALE_PLAN'; end if;
  next_updated_at := greatest(clock_timestamp(), current_updated_at + interval '1 microsecond');

  insert into public.member_meal_schedule as s(user_id, plan_date, plan, context_key, updated_at, server_verified_at, server_context_key)
    values (p_user, p_day, p_plan, p_context, next_updated_at, next_updated_at, p_server_context_key)
    on conflict (user_id, plan_date) do update set
      plan = excluded.plan, context_key = excluded.context_key,
      updated_at = excluded.updated_at, server_verified_at = excluded.server_verified_at,
      server_context_key = excluded.server_context_key
    where s.updated_at = p_expected_updated_at;
  if not found then raise exception 'STALE_PLAN'; end if;

  saved := jsonb_build_object('plan_date', p_day, 'context_key', p_context, 'plan', p_plan,
    'updated_at', next_updated_at, 'intake_revision', current_intake::text);
  insert into public.member_meal_schedule_operations(user_id, request_id, request_hash, result)
    values (p_user, p_request_id, p_request_hash, saved);
  if p_meal_edit then
    insert into public.product_events(id, user_id, session_id, event, step, source)
      values (gen_random_uuid(), p_user, p_user, 'meal_changed_verified', null, 'app');
  end if;
  return saved;
end $$;

-- Reuse the existing per-user compute limit for the new service path.
create or replace function public.member_reserve_compute(p_user uuid,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare accepted integer;
begin
  if p_action not in('preflight','training','meal_schedule') or not exists(
    select 1 from auth.users where id=p_user and phone_confirmed_at is not null
  ) then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.member_compute_usage values(p_user,p_action,date_trunc('minute',clock_timestamp()),1)
    on conflict(user_id,action,bucket) do update set requests=public.member_compute_usage.requests+1
    where public.member_compute_usage.requests<5 returning requests into accepted;
  return accepted is not null;
end $$;

revoke all on function public.member_read_meal_day(uuid,date,uuid),
  public.member_commit_meal_day(uuid,date,uuid,text,jsonb,bigint,bigint,timestamptz,text,jsonb,boolean,text)
  from public, anon, authenticated;
grant execute on function public.member_read_meal_day(uuid,date,uuid),
  public.member_commit_meal_day(uuid,date,uuid,text,jsonb,bigint,bigint,timestamptz,text,jsonb,boolean,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
