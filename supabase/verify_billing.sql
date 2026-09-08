-- Read-only post-install audit: the four integrity counts must all be zero.
select count(*) as paid_orders_without_subscription from public.payment_orders o
where o.status='paid' and not exists(select 1 from public.user_subscriptions s where s.source_order_id=o.id);
select count(*) as subscriptions_without_paid_order from public.user_subscriptions s
join public.payment_orders o on o.id=s.source_order_id
where o.status<>'paid' or o.user_id<>s.user_id or o.mode<>s.mode;
select count(*) as invalid_paid_orders from public.payment_orders
where status='paid' and price_toman>0 and (authority is null or ref_id is null or last_code not in (100,101));
select count(*) as unsafe_billing_function_grants from information_schema.routine_privileges
where routine_schema='public' and routine_name in ('billing_begin_order','billing_settle','billing_claim_verify')
and grantee in ('PUBLIC','anon','authenticated');
select * from public.billing_settings;
select status,mode,count(*) from public.payment_orders group by status,mode;
-- Pending older than one day need operational review; do not grant access manually from callback Status.
select id,created_at,mode,last_code from public.payment_orders
where status='pending' and created_at<now()-interval '1 day';
