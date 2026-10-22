begin;
create table public.member_meal_schedule (
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_date date not null,
 context_key text not null check(length(context_key) between 1 and 100),
 plan jsonb not null check(jsonb_typeof(plan)='object' and octet_length(plan::text)<400000),
 updated_at timestamptz not null default now(),
 primary key(user_id,plan_date)
);
alter table public.member_meal_schedule enable row level security;
revoke all on public.member_meal_schedule from public,anon,authenticated;
grant select on public.member_meal_schedule to authenticated;
create policy member_schedule_read_own on public.member_meal_schedule for select to authenticated using(user_id=auth.uid());

create function public.save_member_meal_schedule(p_today date,p_context text,p_days jsonb,p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; d date; candidate jsonb;
begin
 if auth.uid() is null or not public.billing_has_access() then raise exception 'ACCESS_DENIED'; end if;
 if p_today is null or p_today not between current_date-1 and current_date+1 or p_context is null or length(p_context) not between 1 and 100
 or jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) not between 1 and 7 or octet_length(p_days::text)>2800000 then raise exception 'INVALID_SCHEDULE'; end if;
 for item in select value from jsonb_array_elements(p_days) loop
  d=(item->>'date')::date; candidate=item->'plan';
  if d is null or d not between p_today and p_today+6 or jsonb_typeof(candidate) is distinct from 'object'
   or jsonb_typeof(candidate->'meals') is distinct from 'array' or jsonb_array_length(candidate->'meals') not between 1 and 12
   or jsonb_typeof(candidate->'targets') is distinct from 'object' or jsonb_typeof(candidate->'isWorkoutDay') is distinct from 'boolean'
   or octet_length(candidate::text)>399000 then raise exception 'INVALID_PLAN'; end if;
  insert into public.member_meal_schedule(user_id,plan_date,context_key,plan) values(auth.uid(),d,p_context,candidate)
  on conflict(user_id,plan_date) do update set context_key=excluded.context_key,plan=excluded.plan,updated_at=clock_timestamp()
   where p_replace or public.member_meal_schedule.context_key is distinct from excluded.context_key;
 end loop;
 return (select coalesce(jsonb_agg(jsonb_build_object('plan_date',s.plan_date,'plan',s.plan) order by s.plan_date),'[]'::jsonb)
  from public.member_meal_schedule s where s.user_id=auth.uid() and s.context_key=p_context and s.plan_date between p_today and p_today+6);
end $$;
revoke all on function public.save_member_meal_schedule(date,text,jsonb,boolean) from public,anon;
grant execute on function public.save_member_meal_schedule(date,text,jsonb,boolean) to authenticated;

create function public.member_meal_activity(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>92 or p_to>current_date+1 then raise exception 'INVALID_RANGE'; end if;
 return (with logs as (
  select c.plan_date,count(*) as meal_count,
   sum(case when jsonb_typeof(c.meal_snapshot->'totalKcal')='number' then (c.meal_snapshot->>'totalKcal')::numeric else 0 end) as kcal,
   sum(case when jsonb_typeof(c.meal_snapshot->'totalProtein')='number' then (c.meal_snapshot->>'totalProtein')::numeric else 0 end) as protein,
   sum(case when jsonb_typeof(c.meal_snapshot->'totalCarbs')='number' then (c.meal_snapshot->>'totalCarbs')::numeric else 0 end) as carbs,
   sum(case when jsonb_typeof(c.meal_snapshot->'totalFat')='number' then (c.meal_snapshot->>'totalFat')::numeric else 0 end) as fat
  from public.daily_meal_checkins c where c.user_id=auth.uid() and c.plan_date between p_from and p_to group by c.plan_date
 ), records as (
  select coalesce(s.plan_date,l.plan_date) as date,l.meal_count,l.kcal,l.protein,l.carbs,l.fat,
   case when jsonb_typeof(s.snapshot#>'{targets,targetCalories}')='number' then (s.snapshot#>>'{targets,targetCalories}')::numeric else null end as target_kcal,
   s.snapshot->'targets' as targets,
   case when jsonb_typeof(s.snapshot#>'{plan,meals}')='array' then jsonb_array_length(s.snapshot#>'{plan,meals}') else null end as planned_meals
  from (select * from public.daily_plan_snapshots where user_id=auth.uid() and plan_date between p_from and p_to) s full join logs l on l.plan_date=s.plan_date
 ) select coalesce(jsonb_agg(to_jsonb(records) order by date),'[]'::jsonb) from records);
end $$;
revoke all on function public.member_meal_activity(date,date) from public,anon;
grant execute on function public.member_meal_activity(date,date) to authenticated;
commit;
