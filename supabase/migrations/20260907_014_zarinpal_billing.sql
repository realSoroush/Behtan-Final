begin;

-- Billing records are authoritative. user_profiles.subscription_tier is only a preference.
create table public.billing_settings (
  id boolean primary key default true check (id),
  mode text not null default 'sandbox' check (mode in ('sandbox','live')),
  checkout_enabled boolean not null default false
);
insert into public.billing_settings(id) values(true);

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  plan_code text not null references public.subscription_plans(code) on delete restrict,
  plan_name text not null,
  price_toman bigint not null check(price_toman between 0 and 100000000),
  amount_rial bigint generated always as (price_toman * 10) stored,
  duration_days integer not null check(duration_days between 1 and 3650),
  mode text not null check(mode in ('sandbox','live')),
  status text not null default 'creating' check(status in ('creating','pending','paid','failed')),
  authority text,
  callback_token uuid not null unique default gen_random_uuid(),
  ref_id text,
  last_code integer,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  checked_at timestamptz,
  verify_lease_until timestamptz,
  unique(mode, authority),
  unique(mode, ref_id),
  check (status <> 'paid' or verified_at is not null)
);
create index payment_orders_user_date on public.payment_orders(user_id, created_at desc);
create index payment_orders_pending on public.payment_orders(checked_at nulls first) where status='pending';

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  source_order_id uuid not null unique references public.payment_orders(id) on delete restrict,
  plan_code text not null,
  mode text not null check(mode in ('sandbox','live')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check(expires_at > starts_at)
);
create index user_subscriptions_access on public.user_subscriptions(user_id, mode, expires_at);

alter table public.billing_settings enable row level security;
alter table public.payment_orders enable row level security;
alter table public.user_subscriptions enable row level security;
revoke all on public.billing_settings, public.payment_orders, public.user_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.billing_settings, public.payment_orders, public.user_subscriptions to service_role;

create function public.billing_has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_subscriptions s
    join public.billing_settings b on b.id and b.mode=s.mode
    where s.user_id=auth.uid() and s.revoked_at is null
      and s.starts_at<=now() and s.expires_at>now());
$$;
revoke all on function public.billing_has_access() from public, anon;
grant execute on function public.billing_has_access() to authenticated, service_role;

create function public.billing_begin_order(p_user uuid, p_plan text, p_price bigint, p_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.billing_settings; p public.subscription_plans; o public.payment_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 14));
  select * into b from public.billing_settings where id for share;
  if not b.checkout_enabled then raise exception 'CHECKOUT_DISABLED'; end if;
  if exists(select 1 from public.user_subscriptions where user_id=p_user and mode=b.mode
    and revoked_at is null and starts_at<=now() and expires_at>now()) then
    raise exception 'ALREADY_ACTIVE';
  end if;
  select * into p from public.subscription_plans where code=p_plan and is_active for share;
  if not found then raise exception 'PLAN_UNAVAILABLE'; end if;
  if p.price_toman<>p_price or p.duration_days<>p_days then raise exception 'OFFER_CHANGED'; end if;
  -- An existing checkout is resumed, never duplicated by a double-click or network retry.
  select * into o from public.payment_orders where user_id=p_user and mode=b.mode
    and status in ('creating','pending') and created_at>now()-interval '20 minutes'
    order by created_at desc limit 1;
  if found then
    if o.status='pending' then
      if o.plan_code<>p.code or o.price_toman<>p.price_toman or o.duration_days<>p.duration_days then
        raise exception 'PENDING_ORDER_EXISTS';
      end if;
      return to_jsonb(o)||jsonb_build_object('is_new',false);
    end if;
    if o.created_at>now()-interval '60 seconds' then raise exception 'CHECKOUT_BUSY'; end if;
    update public.payment_orders set status='failed' where id=o.id;
  end if;
  if (select count(*) from public.payment_orders where user_id=p_user
    and created_at>now()-interval '5 minutes')>=5 then raise exception 'RATE_LIMITED'; end if;
  insert into public.payment_orders(user_id,plan_code,plan_name,price_toman,duration_days,mode)
    values(p_user,p.code,p.name,p.price_toman,p.duration_days,b.mode) returning * into o;
  return to_jsonb(o)||jsonb_build_object('is_new',true);
end $$;

-- This RPC is callable only by the backend after a genuine gateway verify response.
create function public.billing_settle(p_order uuid, p_ref text, p_code integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.payment_orders; v_user uuid; v_start timestamptz; s public.user_subscriptions;
begin
  select user_id into v_user from public.payment_orders where id=p_order;
  if v_user is null then raise exception 'ORDER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,14));
  select * into o from public.payment_orders where id=p_order for update;
  if o.status='paid' then
    select * into s from public.user_subscriptions where source_order_id=o.id;
    return to_jsonb(s);
  end if;
  if o.price_toman>0 and (o.authority is null or p_code is null or p_code not in (100,101)
    or p_ref is null or p_ref !~ '^[0-9]{1,30}$') then raise exception 'VERIFY_REQUIRED'; end if;
  if o.price_toman=0 and (p_ref is not null or p_code is distinct from 0) then raise exception 'INVALID_FREE_ORDER'; end if;
  select greatest(now(),coalesce(max(expires_at),now())) into v_start from public.user_subscriptions
    where user_id=o.user_id and mode=o.mode and revoked_at is null;
  insert into public.user_subscriptions(user_id,source_order_id,plan_code,mode,starts_at,expires_at)
    values(o.user_id,o.id,o.plan_code,o.mode,v_start,v_start+make_interval(days=>o.duration_days)) returning * into s;
  update public.payment_orders set status='paid', ref_id=p_ref, last_code=p_code,
    verified_at=now(),verify_lease_until=null where id=o.id;
  return to_jsonb(s);
end $$;

create function public.billing_claim_verify(p_order uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_orders set verify_lease_until=now()+interval '40 seconds', checked_at=now()
  where id=p_order and status='pending' and authority is not null
    and (verify_lease_until is null or verify_lease_until<now())
    and (checked_at is null or checked_at<now()-interval '10 seconds');
  return found;
end $$;

revoke all on function public.billing_begin_order(uuid,text,bigint,integer),
  public.billing_settle(uuid,text,integer),public.billing_claim_verify(uuid) from public, anon, authenticated;
grant execute on function public.billing_begin_order(uuid,text,bigint,integer),
  public.billing_settle(uuid,text,integer),public.billing_claim_verify(uuid) to service_role;

-- Existing row ownership/catalog policies still apply, together with subscription access.
do $$ declare t text; begin
  foreach t in array array['food_items','food_substitutes','meal_templates','meal_template_slots','nutrition_protein_policy'] loop
    execute format('create policy billing_read_access on public.%I as restrictive for select to authenticated using (public.billing_has_access())',t);
  end loop;
end $$;
create policy billing_checkin_insert on public.daily_meal_checkins as restrictive for insert to authenticated with check(public.billing_has_access());
create policy billing_checkin_update on public.daily_meal_checkins as restrictive for update to authenticated using(public.billing_has_access()) with check(public.billing_has_access());
create policy billing_checkin_delete on public.daily_meal_checkins as restrictive for delete to authenticated using(public.billing_has_access());

commit;
