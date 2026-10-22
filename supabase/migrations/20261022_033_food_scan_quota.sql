begin;
create table public.member_food_scan_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 usage_date date not null default current_date,
 requests integer not null default 0 check(requests between 0 and 10),
 last_request_at timestamptz not null default now(),
 primary key(user_id,usage_date)
);
alter table public.member_food_scan_usage enable row level security;
revoke all on public.member_food_scan_usage from public,anon,authenticated;
create function public.reserve_food_scan() returns boolean language plpgsql security definer set search_path='' as $$
declare accepted integer;
begin
 if auth.uid() is null or not public.billing_has_access() then raise exception 'ACCESS_DENIED'; end if;
 insert into public.member_food_scan_usage(user_id,usage_date,requests,last_request_at) values(auth.uid(),current_date,1,clock_timestamp())
 on conflict(user_id,usage_date) do update set requests=public.member_food_scan_usage.requests+1,last_request_at=clock_timestamp()
 where public.member_food_scan_usage.requests<10 and public.member_food_scan_usage.last_request_at<clock_timestamp()-interval '10 seconds'
 returning requests into accepted;
 return accepted is not null;
end $$;
revoke all on function public.reserve_food_scan() from public,anon;
grant execute on function public.reserve_food_scan() to authenticated;
commit;
