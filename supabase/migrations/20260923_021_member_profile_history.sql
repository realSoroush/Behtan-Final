begin;
-- Capture entered profile at checkout creation, never reconstruct past values
-- from today's profile. Own users read paid records only through the RPC.
create table if not exists public.order_profile_snapshots (
 order_id uuid primary key references public.payment_orders(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 captured_at timestamptz not null default now(),
 profile jsonb not null
);
alter table public.order_profile_snapshots enable row level security;
revoke all on public.order_profile_snapshots from public,anon,authenticated;
create or replace function public.capture_checkout_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.order_profile_snapshots(order_id,user_id,profile)
 select new.id,new.user_id,jsonb_build_object(
   'weight',p.weight,'height',p.height,'goal',p.goal,'gender',p.gender,
   'birth_date',p.birth_date,'activity_level',p.activity_level,'workout_days',p.workout_days,
   'protein_budget_preference',p.protein_budget_preference,
   'dietary_preferences_json',p.dietary_preferences_json)
 from public.user_profiles p where p.id=new.user_id on conflict do nothing;
 return new;
end $$;
revoke all on function public.capture_checkout_profile() from public,anon,authenticated;
drop trigger if exists checkout_profile_capture on public.payment_orders;
create trigger checkout_profile_capture after insert on public.payment_orders
for each row execute function public.capture_checkout_profile();
create or replace function public.my_membership_history() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'ACCESS_DENIED'; end if;
 return jsonb_build_object(
 'subscriptions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
  (select s.plan_code,s.starts_at,s.expires_at from public.user_subscriptions s
   where s.user_id=auth.uid() and s.revoked_at is null and s.mode=(select mode from public.billing_settings where id) order by s.expires_at desc limit 20) t),
 'orders',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
  (select o.id,o.plan_name,o.price_toman,o.mode,o.verified_at,h.captured_at,h.profile
   from public.payment_orders o left join public.order_profile_snapshots h on h.order_id=o.id and h.user_id=o.user_id
   where o.user_id=auth.uid() and o.status='paid' order by o.verified_at desc limit 20) t));
end $$;
revoke all on function public.my_membership_history() from public,anon;
grant execute on function public.my_membership_history() to authenticated;
commit;
