begin;
create table public.admin_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.admin_members enable row level security;
revoke all on public.admin_members from public, anon, authenticated;

create function public.admin_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_members a join auth.users u on u.id=a.user_id
 where a.user_id=auth.uid() and u.phone_confirmed_at is not null and u.phone is not null);
$$;
revoke all on function public.admin_allowed() from public, anon;
grant execute on function public.admin_allowed() to authenticated;

create table public.admin_audit_log (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 user_id uuid not null references auth.users(id), action text not null,
 reason text not null check(length(trim(reason)) between 3 and 500),
 request_data jsonb not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public, anon, authenticated;

-- Manual grants are entitlements, never fabricated paid orders.
alter table public.user_subscriptions alter column source_order_id drop not null;
alter table public.user_subscriptions add column grant_source text not null default 'payment'
 check(grant_source in ('payment','admin'));
alter table public.user_subscriptions add constraint subscription_source_check check(
 (grant_source='payment' and source_order_id is not null) or
 (grant_source='admin' and source_order_id is null));

create table public.daily_plan_snapshots (
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_date date not null, revision bigint not null default 1,
 snapshot jsonb not null, updated_at timestamptz not null default now(),
 primary key(user_id,plan_date),
 check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<500000)
);
alter table public.daily_plan_snapshots enable row level security;
revoke all on public.daily_plan_snapshots from public, anon, authenticated;
create function public.save_daily_plan(p_date date,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.billing_has_access() then raise exception 'ACCESS_DENIED'; end if;
 if p_date is null or p_date < current_date-1 or p_date > current_date+1
 or p_snapshot is null or octet_length(p_snapshot::text)>499000
 or p_snapshot->>'schemaVersion' is distinct from '1'
 or jsonb_typeof(p_snapshot->'targets') is distinct from 'object'
 or jsonb_typeof(p_snapshot#>'{plan,meals}') is distinct from 'array' then raise exception 'INVALID_SNAPSHOT'; end if;
 if jsonb_array_length(p_snapshot#>'{plan,meals}') not between 1 and 12 then raise exception 'INVALID_SNAPSHOT'; end if;
 insert into public.daily_plan_snapshots(user_id,plan_date,snapshot) values(auth.uid(),p_date,p_snapshot)
 on conflict(user_id,plan_date) do update set snapshot=excluded.snapshot,updated_at=clock_timestamp(),revision=public.daily_plan_snapshots.revision+1
 where public.daily_plan_snapshots.snapshot is distinct from excluded.snapshot;
end $$;
revoke all on function public.save_daily_plan(date,jsonb) from public, anon;
grant execute on function public.save_daily_plan(date,jsonb) to authenticated;

create function public.admin_overview(p_search text default '',p_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED'; end if;
 if p_page is null or p_page<0 or p_page>100000 or length(p_search)>100 then raise exception 'INVALID_INPUT'; end if;
 select jsonb_build_object(
 'stats',jsonb_build_object(
 'users',(select count(*) from auth.users),
 'new_users_7d',(select count(*) from auth.users where created_at>=now()-interval '7 days'),
 'revenue_toman',(select coalesce(sum(price_toman),0) from public.payment_orders where mode='live' and status='paid'),
 'paid_count',(select count(*) from public.payment_orders where mode='live' and status='paid' and price_toman>0),
 'active_users',(select count(distinct user_id) from public.user_subscriptions where mode='live' and revoked_at is null and starts_at<=now() and expires_at>now())),
 'users',coalesce((select jsonb_agg(t) from (
 select u.id,u.phone,u.email,u.created_at,u.last_sign_in_at,p.onboarding_completed,
 (select max(expires_at) from public.user_subscriptions s where s.user_id=u.id and s.mode='live' and s.revoked_at is null and s.starts_at<=now() and s.expires_at>now()) as active_until,
 (select coalesce(sum(price_toman),0) from public.payment_orders o where o.user_id=u.id and o.mode='live' and o.status='paid') as paid_toman
 from auth.users u left join public.user_profiles p on p.id=u.id
 where coalesce(u.phone,'') ilike '%'||coalesce(p_search,'')||'%' or u.id::text=p_search
 or coalesce(u.email,'') ilike '%'||coalesce(p_search,'')||'%'
 order by u.created_at desc,u.id limit 50 offset p_page*50
 ) t),'[]'::jsonb),
 'plans',(select coalesce(jsonb_agg(p order by p.sort_order),'[]'::jsonb) from public.subscription_plans p)
 ) into result;
 return result;
end $$;

create function public.admin_user_detail(p_user uuid,p_date date default current_date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED'; end if;
 return jsonb_build_object(
 'profile',(select to_jsonb(p) from public.user_profiles p where p.id=p_user),
 'subscriptions',(select coalesce(jsonb_agg(s order by s.created_sort desc),'[]'::jsonb) from
 (select s.*,s.starts_at as created_sort from public.user_subscriptions s where user_id=p_user) s),
 'orders',(select coalesce(jsonb_agg(o),'[]'::jsonb) from
 (select id,plan_name,price_toman,mode,status,ref_id,created_at,verified_at from public.payment_orders where user_id=p_user order by created_at desc limit 100) o),
 'saved_plan',(select to_jsonb(d) from public.daily_plan_snapshots d where user_id=p_user and plan_date=p_date),
 'dates',(select coalesce(jsonb_agg(t.plan_date),'[]'::jsonb) from (select plan_date from public.daily_plan_snapshots where user_id=p_user order by plan_date desc limit 365) t),
 'checkins',(select coalesce(jsonb_agg(c),'[]'::jsonb) from public.daily_meal_checkins c where user_id=p_user and plan_date=p_date),
 'audit',(select coalesce(jsonb_agg(a),'[]'::jsonb) from (select * from public.admin_audit_log where user_id=p_user order by created_at desc limit 100) a));
end $$;

create function public.admin_change_subscription(p_request uuid,p_user uuid,p_action text,p_subscription uuid,
 p_plan text,p_expiry timestamptz,p_expected_expiry timestamptz,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare oldrow public.user_subscriptions; newrow public.user_subscriptions; prior public.admin_audit_log; request_data jsonb;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED'; end if;
 if p_request is null or p_user is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'REASON_REQUIRED'; end if;
 request_data := jsonb_build_object('user',p_user,'action',p_action,'subscription',p_subscription,'plan',p_plan,'expiry',p_expiry,'expected',p_expected_expiry,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.admin_audit_log where id=p_request;
 if found then
 if prior.actor_id<>auth.uid() or prior.request_data is distinct from request_data then raise exception 'REQUEST_CONFLICT'; end if;
 return prior.after_data;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,14));
 if p_action='grant' then
 if exists(select 1 from public.payment_orders where user_id=p_user and mode='live' and status in ('creating','pending')) then raise exception 'PENDING_ORDER_EXISTS'; end if;
 if p_expiry is null or p_expiry<=now() or p_expiry>now()+interval '3650 days' then raise exception 'INVALID_EXPIRY'; end if;
 if not exists(select 1 from public.subscription_plans where code=p_plan and is_active) then raise exception 'INVALID_PLAN'; end if;
 if exists(select 1 from public.user_subscriptions where user_id=p_user and mode='live' and revoked_at is null and starts_at<=now() and expires_at>now()) then raise exception 'ALREADY_ACTIVE'; end if;
 insert into public.user_subscriptions(user_id,plan_code,mode,starts_at,expires_at,grant_source)
 values(p_user,p_plan,'live',now(),p_expiry,'admin') returning * into newrow;
 elsif p_action in ('expiry','revoke') then
 select * into oldrow from public.user_subscriptions where id=p_subscription and user_id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if oldrow.expires_at is distinct from p_expected_expiry or oldrow.revoked_at is not null then raise exception 'STALE_SUBSCRIPTION'; end if;
 if p_action='expiry' then
 if p_expiry is null or p_expiry<=oldrow.starts_at or p_expiry>now()+interval '3650 days' then raise exception 'INVALID_EXPIRY'; end if;
 update public.user_subscriptions set expires_at=p_expiry where id=oldrow.id returning * into newrow;
 else update public.user_subscriptions set revoked_at=now() where id=oldrow.id returning * into newrow;
 end if;
 else raise exception 'INVALID_ACTION'; end if;
 insert into public.admin_audit_log(id,actor_id,user_id,action,reason,request_data,before_data,after_data)
 values(p_request,auth.uid(),p_user,p_action,p_reason,request_data,case when oldrow.id is null then null else to_jsonb(oldrow) end,to_jsonb(newrow));
 return to_jsonb(newrow);
end $$;
revoke all on function public.admin_overview(text,integer),public.admin_user_detail(uuid,date),public.admin_change_subscription(uuid,uuid,text,uuid,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.admin_overview(text,integer),public.admin_user_detail(uuid,date),public.admin_change_subscription(uuid,uuid,text,uuid,text,timestamptz,timestamptz,text) to authenticated;
create function public.admin_payments(p_page integer default 0,p_status text default '',p_mode text default 'live') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED'; end if;
 if p_page is null or p_page<0 or p_page>100000 or p_mode not in ('live','sandbox') then raise exception 'INVALID_INPUT'; end if;
 return (select coalesce(jsonb_agg(t),'[]'::jsonb) from (
 select o.id,o.user_id,u.phone,o.plan_name,o.price_toman,o.status,o.mode,o.ref_id,o.created_at
 from public.payment_orders o join auth.users u on u.id=o.user_id
 where o.mode=p_mode and (p_status='' or o.status=p_status)
 order by o.created_at desc,o.id limit 50 offset p_page*50) t);
end $$;
revoke all on function public.admin_payments(integer,text,text) from public,anon;
grant execute on function public.admin_payments(integer,text,text) to authenticated;
commit;
