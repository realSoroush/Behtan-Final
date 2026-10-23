begin;
-- Pre-checkout onboarding: no subscription required. Photos are never stored.
create table if not exists public.member_body_scan_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 usage_date date not null default current_date,
 requests integer not null check(requests between 1 and 5),
 last_request_at timestamptz not null default now(),
 primary key(user_id,usage_date)
);
alter table public.member_body_scan_usage enable row level security;
revoke all on public.member_body_scan_usage from public,anon,authenticated;
create or replace function public.reserve_body_scan() returns boolean
language plpgsql security definer set search_path='' as $$
declare accepted integer;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()
  and phone_confirmed_at is not null and phone ~ '^\+?989[0-9]{9}$') then
  raise exception 'AUTH_REQUIRED';
 end if;
 insert into public.member_body_scan_usage(user_id,usage_date,requests,last_request_at)
 values(auth.uid(),current_date,1,clock_timestamp())
 on conflict(user_id,usage_date) do update
 set requests=public.member_body_scan_usage.requests+1,last_request_at=clock_timestamp()
 where public.member_body_scan_usage.requests<5
 and public.member_body_scan_usage.last_request_at<clock_timestamp()-interval '10 seconds'
 returning requests into accepted;
 return accepted is not null;
end $$;
revoke all on function public.reserve_body_scan() from public,anon,authenticated;
grant execute on function public.reserve_body_scan() to authenticated;
commit;
