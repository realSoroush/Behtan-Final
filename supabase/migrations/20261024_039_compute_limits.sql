begin;
create table public.member_compute_usage(user_id uuid not null references auth.users(id),action text not null,bucket timestamptz not null,requests integer not null check(requests between 1 and 5),primary key(user_id,action,bucket));
alter table public.member_compute_usage enable row level security;revoke all on public.member_compute_usage from public,anon,authenticated;
create function public.member_reserve_compute(p_user uuid,p_action text) returns boolean language plpgsql security definer set search_path='' as $$declare accepted integer;begin
 if p_action not in('preflight','training') or not exists(select 1 from auth.users where id=p_user and phone_confirmed_at is not null) then raise exception 'AUTH_REQUIRED';end if;
 insert into public.member_compute_usage values(p_user,p_action,date_trunc('minute',clock_timestamp()),1) on conflict(user_id,action,bucket) do update set requests=public.member_compute_usage.requests+1 where public.member_compute_usage.requests<5 returning requests into accepted;return accepted is not null;
end$$;
revoke all on function public.member_reserve_compute(uuid,text) from public,anon,authenticated;grant execute on function public.member_reserve_compute(uuid,text) to service_role;
create index product_events_session_time on public.product_events(session_id,created_at);
create function public.admin_member_funnel(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED';end if;if p_days not between 7 and 90 then raise exception 'INVALID_RANGE';end if;
 with cohort as(select id from auth.users where phone_confirmed_at is not null and created_at>=now()-make_interval(days=>p_days)), stages as(
 select 'registered' stage,count(*) users from cohort union all
 select 'onboarded',count(*) from cohort c join public.user_profiles p on p.id=c.id where p.onboarding_completed union all
 select 'preflight',count(*) from cohort c where exists(select 1 from public.member_preflights f where f.user_id=c.id) union all
 select 'checkout',count(*) from cohort c where exists(select 1 from public.payment_orders o where o.user_id=c.id and o.mode='live' and o.pro_application is null and o.price_toman>0) union all
 select 'paid',count(*) from cohort c where exists(select 1 from public.payment_orders o where o.user_id=c.id and o.mode='live' and o.pro_application is null and o.price_toman>0 and o.status='paid') union all
 select 'trial',count(*) from cohort c where exists(select 1 from public.payment_orders o where o.user_id=c.id and o.mode='live' and o.pro_application is null and o.plan_code='trial' and o.status='paid'))
 select jsonb_object_agg(stage,users) into result from stages;return result;end$$;
revoke all on function public.admin_member_funnel(integer) from public,anon;grant execute on function public.admin_member_funnel(integer) to authenticated;
commit;
