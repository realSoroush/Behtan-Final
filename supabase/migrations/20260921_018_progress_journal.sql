begin;
create table public.user_progress_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  weight_kg numeric(5,1) check(weight_kg between 25 and 350),
  adherence text check(adherence in ('mostly','partly','little')),
  hunger text check(hunger in ('comfortable','sometimes','often')),
  difficulty text check(difficulty in ('none','time','cost','taste','portions','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,entry_date),
  check(entry_date >= date '2000-01-01'),
  check(weight_kg is not null or adherence is not null or hunger is not null or difficulty is not null)
);
alter table public.user_progress_entries enable row level security;
revoke all on public.user_progress_entries from public,anon,authenticated;
grant select,insert,update,delete on public.user_progress_entries to authenticated;
create policy progress_owner on public.user_progress_entries for all to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function public.validate_progress_entry() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.entry_date > (now() at time zone 'UTC')::date+1 then raise exception 'FUTURE_ENTRY'; end if;
 if tg_op='UPDATE' then new.created_at:=old.created_at; else new.created_at:=clock_timestamp(); end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
create trigger progress_entry_timestamps before insert or update on public.user_progress_entries
for each row execute function public.validate_progress_entry();

-- Only yesterday's food identities, only the current user's report. These are
-- client-reported preferences, not medically verified observations.
create function public.previous_day_meals(p_before date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED'; end if;
 if p_before is null or p_before < current_date-1 or p_before > current_date+1 then raise exception 'INVALID_DATE'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('slot',m->>'slot','foodIds',
   (select coalesce(jsonb_agg(c#>>'{foodItem,id}'),'[]') from jsonb_array_elements(
     case when jsonb_typeof(m->'components')='array' then m->'components' else '[]'::jsonb end
   ) c))), '[]'::jsonb) into result
 from public.daily_plan_snapshots s cross join lateral jsonb_array_elements(s.snapshot#>'{plan,meals}') m
 where s.user_id=auth.uid() and s.plan_date=p_before-1;
 return result;
end $$;
revoke all on function public.previous_day_meals(date) from public,anon;
grant execute on function public.previous_day_meals(date) to authenticated;
commit;
