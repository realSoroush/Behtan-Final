begin;

create or replace function public.save_member_meal_schedule_v2(p_today date,p_context text,p_days jsonb,p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; d date; candidate jsonb; expected_version timestamptz; version_aware boolean;
begin
 if auth.uid() is null or not public.billing_has_access() then raise exception 'ACCESS_DENIED'; end if;
 if p_today is null or p_today not between current_date-1 and current_date+1 or p_context is null or length(p_context) not between 1 and 100
 or jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) not between 1 and 7 or octet_length(p_days::text)>2800000 then raise exception 'INVALID_SCHEDULE'; end if;
 version_aware := (p_days->0) ? 'expected_updated_at';
 -- Consistent lock order for multi-day writes.
 for item in select value from jsonb_array_elements(p_days) order by value->>'date' loop
  d=(item->>'date')::date; candidate=item->'plan';
  if (item ? 'expected_updated_at') is distinct from version_aware then raise exception 'INVALID_SCHEDULE'; end if;
  expected_version := (item->>'expected_updated_at')::timestamptz;
  if d is null or d not between p_today and p_today+6 or jsonb_typeof(candidate) is distinct from 'object'
   or jsonb_typeof(candidate->'meals') is distinct from 'array' or jsonb_array_length(candidate->'meals') not between 1 and 12
   or jsonb_typeof(candidate->'targets') is distinct from 'object' or jsonb_typeof(candidate->'isWorkoutDay') is distinct from 'boolean'
   or octet_length(candidate::text)>399000 then raise exception 'INVALID_PLAN'; end if;
  if expected_version is not null and not exists (
   select 1 from public.member_meal_schedule where user_id=auth.uid() and plan_date=d
  ) then raise exception 'MEAL_SCHEDULE_CONFLICT'; end if;

  insert into public.member_meal_schedule as stored(user_id,plan_date,context_key,plan)
  values(auth.uid(),d,p_context,candidate)
  on conflict(user_id,plan_date) do update set
    context_key=excluded.context_key,
    plan=excluded.plan,
    updated_at=greatest(clock_timestamp(),stored.updated_at + interval '1 microsecond')
  where stored.updated_at = expected_version
    and (p_replace or stored.context_key is distinct from excluded.context_key);

  if not found and not exists (
   select 1 from public.member_meal_schedule
   where user_id=auth.uid() and plan_date=d and context_key=p_context and not p_replace
  ) then raise exception 'MEAL_SCHEDULE_CONFLICT'; end if;
 end loop;

 return (select coalesce(jsonb_agg(jsonb_build_object(
    'plan_date',s.plan_date,'plan',case when s.context_key=p_context then s.plan end,
    'context_key',s.context_key,'updated_at',s.updated_at
  ) order by s.plan_date),'[]'::jsonb)
  from public.member_meal_schedule s
  where s.user_id=auth.uid() and (version_aware or s.context_key=p_context) and s.plan_date between p_today and p_today+6);
end $$;
revoke all on function public.save_member_meal_schedule_v2(date,text,jsonb,boolean) from public,anon;
grant execute on function public.save_member_meal_schedule_v2(date,text,jsonb,boolean) to authenticated;

-- The legacy RPC can still create a day or read an existing reservation.
-- It cannot overwrite a row because it has no version token.
create or replace function public.save_member_meal_schedule(p_today date,p_context text,p_days jsonb,p_replace boolean default false)
returns jsonb language sql set search_path='' as $$
 select public.save_member_meal_schedule_v2(p_today,p_context,p_days,p_replace);
$$;
revoke all on function public.save_member_meal_schedule(date,text,jsonb,boolean) from public,anon;
grant execute on function public.save_member_meal_schedule(date,text,jsonb,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
