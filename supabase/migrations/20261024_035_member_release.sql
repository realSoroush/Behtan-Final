begin;
alter table public.user_profiles add column if not exists workout_weekdays integer[] not null default '{}';
alter table public.user_profiles add constraint member_weekdays_valid check(cardinality(workout_weekdays)<=7 and workout_weekdays <@ array[0,1,2,3,4,5,6]);
alter table public.subscription_plans add column if not exists training_enabled boolean not null default false;
update public.subscription_plans set name='برنامه تغذیه',features=array['برنامه غذایی شخصی‌سازی‌شده','برنامه هفتگی و فهرست مواد','جایگزینی و ثبت وعده','ثبت دستی غذا و تحلیل عکس','پیگیری وزن و تجربه','اسکن بدن تخمینی هر ۵ روز','ارتباط با پشتیبانی در تلگرام'] where code='silver';
update public.subscription_plans set name='تغذیه و تمرین',training_enabled=true,features=array['تمام امکانات برنامه تغذیه','برنامه تمرینی شخصی بر اساس اطلاعات و امکانات','نمایش آموزش حرکات و جلسات','ارتباط با پشتیبانی در تلگرام'] where code='gold';
insert into public.subscription_plans(code,name,emoji,price_toman,price_note,duration_days,features,theme,sort_order) values('trial','آزمایشی سه روزه','🌱',0,'۳ روز',3,array['آزمایش برنامه تغذیه','ثبت و جایگزینی غذا','پیگیری روند'], 'green',0) on conflict(code) do nothing;
update public.subscription_plans set is_active=false where code not in('trial','silver','gold');
create table public.member_catalog_version(id boolean primary key default true check(id),revision bigint not null default 1);
insert into public.member_catalog_version values(true,1);
alter table public.member_catalog_version enable row level security;
revoke all on public.member_catalog_version from public,anon,authenticated;
create function public.member_bump_catalog() returns trigger language plpgsql security definer set search_path='' as $$begin update public.member_catalog_version set revision=revision+1 where id;return null;end$$;
revoke all on function public.member_bump_catalog() from public,anon,authenticated;
do $$declare t text;begin foreach t in array array['food_items','food_substitutes','meal_templates','meal_template_slots','nutrition_protein_policy'] loop execute format('create trigger member_catalog_changed after insert or update or delete on public.%I for each statement execute function public.member_bump_catalog()',t);end loop;end$$;
create table public.member_preflights(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),profile_hash text not null,catalog_revision bigint not null,training_eligible boolean not null default false,training_plan jsonb check(training_plan is null or octet_length(training_plan::text)<500000),plan jsonb not null check(octet_length(plan::text)<500000),created_at timestamptz not null default now());
alter table public.member_preflights enable row level security;
revoke all on public.member_preflights from public,anon,authenticated;
create function public.member_store_preflight(p_user uuid,p_revision bigint,p_plan jsonb,p_training boolean,p_profile jsonb,p_training_plan jsonb default null) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;current_profile jsonb;begin
 select to_jsonb(p) into current_profile from public.user_profiles p where id=p_user for share;
 if current_profile is distinct from p_profile then raise exception 'PROFILE_CHANGED';end if;
 perform 1 from public.member_catalog_version where id for share;
 if p_revision<>(select revision from public.member_catalog_version where id) then raise exception 'CATALOG_CHANGED';end if;
 -- Approved snapshots are retained for order audit.
 insert into public.member_preflights(user_id,profile_hash,catalog_revision,plan,training_eligible,training_plan) select id,md5(to_jsonb(p)::text),p_revision,p_plan,p_training,p_training_plan from public.user_profiles p where id=p_user returning id into result;return result;end$$;
revoke all on function public.member_store_preflight(uuid,bigint,jsonb,boolean,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.member_store_preflight(uuid,bigint,jsonb,boolean,jsonb,jsonb) to service_role;
grant select on public.member_catalog_version to service_role;
create table public.member_trial_claims(user_id uuid not null references auth.users(id),mode text not null,order_id uuid not null references public.payment_orders(id),primary key(user_id,mode));
alter table public.member_trial_claims enable row level security;revoke all on public.member_trial_claims from public,anon,authenticated;
alter table public.payment_orders add column if not exists upgrade_source uuid references public.user_subscriptions(id);
alter table public.payment_orders add column if not exists upgrade_expiry timestamptz;
alter table public.payment_orders add column if not exists pro_application uuid;
alter table public.payment_orders add column member_preflight uuid references public.member_preflights(id);
create function public.member_begin_order(p_user uuid,p_plan text,p_price bigint,p_days integer,p_preflight uuid,p_upgrade boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.billing_settings;p public.subscription_plans;o public.payment_orders;s public.user_subscriptions;old_price bigint;amount bigint;days integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,14));
 perform 1 from public.user_profiles where id=p_user for share;
 perform 1 from public.member_catalog_version where id for share;
 select * into b from public.billing_settings where id for share;if not b.checkout_enabled then raise exception 'CHECKOUT_DISABLED';end if;
 if not exists(select 1 from public.member_preflights f join public.user_profiles u on u.id=f.user_id where f.id=p_preflight and f.user_id=p_user and f.created_at>now()-interval '15 minutes' and f.profile_hash=md5(to_jsonb(u)::text) and f.catalog_revision=(select revision from public.member_catalog_version where id)) then raise exception 'PREFLIGHT_REQUIRED';end if;
 if p_plan='gold' and not exists(select 1 from public.member_preflights where id=p_preflight and training_eligible and training_plan is not null) then raise exception 'TRAINING_REVIEW_REQUIRED';end if;
 select * into p from public.subscription_plans where code=p_plan and is_active for share;if not found or p.code not in ('trial','silver','gold') then raise exception 'PLAN_UNAVAILABLE';end if;
 select * into s from public.user_subscriptions where user_id=p_user and mode=b.mode and revoked_at is null and starts_at<=now() and expires_at>now() order by expires_at desc limit 1 for update;
 days:=case when p.code='trial' then 3 else p_days end;
 if days not in(3,14,30) or (p.code<>'trial' and days=3) then raise exception 'INVALID_PERIOD';end if;
 amount:=case when p.code='trial' then 0 when days=14 then ceil(p.price_toman/2.0) else p.price_toman end;
 if p_upgrade then
  if s.id is null or p.code<>'gold' or s.plan_code='gold' then raise exception 'INVALID_UPGRADE';end if;
  days:=case when s.plan_code='trial' then p_days else least(30,ceil(extract(epoch from(s.expires_at-s.starts_at))/86400.0)::integer) end;
  if days not in(14,30) then raise exception 'INVALID_PERIOD';end if;
  select price_toman into old_price from public.subscription_plans where code=s.plan_code;
  amount:=greatest(0,case when days=14 then ceil(p.price_toman/2.0)-case when s.plan_code='trial' then 0 else ceil(old_price/2.0) end else p.price_toman-case when s.plan_code='trial' then 0 else old_price end end);
 elsif s.id is not null then raise exception 'ALREADY_ACTIVE';end if;
 if amount<>p_price or days<>p_days then raise exception 'OFFER_CHANGED';end if;
 select * into o from public.payment_orders where user_id=p_user and mode=b.mode and status in('creating','pending') and created_at>now()-interval '20 minutes' order by created_at desc limit 1;
 if found then
  if o.plan_code<>p.code or o.price_toman<>amount or o.duration_days<>days or o.upgrade_source is distinct from (case when p_upgrade then s.id else null end) then raise exception 'PENDING_ORDER_EXISTS';end if;
  if not exists(select 1 from public.member_preflights old_f join public.member_preflights new_f on new_f.id=p_preflight where old_f.id=o.member_preflight and old_f.profile_hash=new_f.profile_hash and old_f.catalog_revision=new_f.catalog_revision and old_f.training_plan->'input' is not distinct from new_f.training_plan->'input') then raise exception 'PENDING_ORDER_REVIEW_REQUIRED';end if;
  if o.status='pending' then return to_jsonb(o)||jsonb_build_object('is_new',false);end if;
  if o.created_at>now()-interval '60 seconds' then raise exception 'CHECKOUT_BUSY';end if;
  update public.payment_orders set status='failed' where id=o.id;
 end if;
 if (select count(*) from public.payment_orders where user_id=p_user and created_at>now()-interval '5 minutes')>=5 then raise exception 'RATE_LIMITED';end if;
 if p.code='trial' and exists(select 1 from public.member_trial_claims where user_id=p_user and mode=b.mode) then raise exception 'TRIAL_USED';end if;
 insert into public.payment_orders(user_id,plan_code,plan_name,price_toman,duration_days,mode,upgrade_source,upgrade_expiry,member_preflight) values(p_user,p.code,p.name,amount,days,b.mode,case when p_upgrade then s.id else null end,case when p_upgrade and s.plan_code<>'trial' then s.expires_at else null end,p_preflight) returning * into o;
 if p.code='trial' then insert into public.member_trial_claims values(p_user,b.mode,o.id);end if;
 return to_jsonb(o)||jsonb_build_object('is_new',true);
end$$;
revoke all on function public.member_begin_order(uuid,text,bigint,integer,uuid,boolean) from public,anon,authenticated;grant execute on function public.member_begin_order(uuid,text,bigint,integer,uuid,boolean) to service_role;
alter function public.billing_settle(uuid,text,integer) rename to billing_settle_before_member;
revoke all on function public.billing_settle_before_member(uuid,text,integer) from public,anon,authenticated,service_role;
create function public.billing_settle(p_order uuid,p_ref text,p_code integer) returns jsonb language plpgsql security definer set search_path='' as $$declare o public.payment_orders;s public.user_subscriptions;begin
 select * into o from public.payment_orders where id=p_order;
 perform pg_advisory_xact_lock(hashtextextended(o.user_id::text,14));select * into o from public.payment_orders where id=p_order for update;
 if o.status='paid' then select * into s from public.user_subscriptions where source_order_id=o.id;return to_jsonb(s);end if;
 if o.upgrade_source is null then return public.billing_settle_before_member(p_order,p_ref,p_code);end if;
 if o.price_toman>0 and(o.authority is null or p_code is null or p_code not in(100,101) or p_ref is null or p_ref!~'^[0-9]{1,30}$') then raise exception 'VERIFY_REQUIRED';end if;
 if o.price_toman=0 and(p_ref is not null or p_code is distinct from 0) then raise exception 'INVALID_FREE_ORDER';end if;
 update public.user_subscriptions set revoked_at=now() where id=o.upgrade_source and user_id=o.user_id;
 insert into public.user_subscriptions(user_id,source_order_id,plan_code,mode,starts_at,expires_at) values(o.user_id,o.id,o.plan_code,o.mode,now(),greatest(now()+interval '1 minute',coalesce(o.upgrade_expiry,now()+make_interval(days=>o.duration_days)))) returning * into s;
 update public.payment_orders set status='paid',ref_id=p_ref,last_code=p_code,verified_at=now(),verify_lease_until=null where id=o.id;return to_jsonb(s);
end$$;
revoke all on function public.billing_settle(uuid,text,integer) from public,anon,authenticated;grant execute on function public.billing_settle(uuid,text,integer) to service_role;
-- A short server-owned lease protects provider credits; only a saved success uses the five-day allowance.
create table public.member_body_reports(id uuid primary key,user_id uuid not null references auth.users(id),result jsonb not null,created_at timestamptz not null default now());
alter table public.member_body_reports enable row level security;
revoke all on public.member_body_reports from public,anon,authenticated;
grant select on public.member_body_reports to authenticated;
create policy member_report_owner on public.member_body_reports for select to authenticated using(user_id=auth.uid());
create table public.member_body_jobs(id uuid primary key,user_id uuid not null references auth.users(id),status text not null check(status in('pending','success','failed')),created_at timestamptz not null default now());
alter table public.member_body_jobs enable row level security;revoke all on public.member_body_jobs from public,anon,authenticated;
create function public.member_begin_body_scan(p_user uuid,p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,35));
 if not exists(select 1 from auth.users where id=p_user and phone_confirmed_at is not null) then raise exception 'AUTH_REQUIRED';end if;
 if exists(select 1 from public.member_body_reports where user_id=p_user and created_at>now()-interval '5 days') or exists(select 1 from public.member_body_jobs where user_id=p_user and status='pending' and created_at>now()-interval '2 minutes') or (select count(*) from public.member_body_jobs where user_id=p_user and created_at>now()-interval '1 day')>=5 then return false;end if;
 insert into public.member_body_jobs values(p_id,p_user,'pending',now());return true;end$$;
create function public.member_finish_body_scan(p_user uuid,p_id uuid,p_result jsonb default null) returns void language plpgsql security definer set search_path='' as $$declare job public.member_body_jobs;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,35));
 select * into job from public.member_body_jobs where id=p_id and user_id=p_user for update;
 if not found then raise exception 'SCAN_LEASE_REQUIRED';end if;
 if job.status<>'pending' then return;end if;
 if p_result is null then update public.member_body_jobs set status='failed' where id=p_id;return;end if;
 if job.created_at<now()-interval '2 minutes' or octet_length(p_result::text)>10000 or jsonb_typeof(p_result)<>'object' or not(p_result ?& array['bodyFatPct','bodyType','estimatedMuscleMass','narrative','confidence']) or (p_result->>'bodyFatPct')::numeric not between 5 and 50 or p_result->>'bodyType' not in('ectomorph','mesomorph','endomorph') or length(p_result->>'narrative') not between 1 and 600 then raise exception 'INVALID_RESULT';end if;
 insert into public.member_body_reports(id,user_id,result) values(p_id,p_user,p_result);
 update public.member_body_jobs set status='success' where id=p_id;
 -- Informational scan result only; do not change the prescription's clinical inputs.
end$$;
revoke all on function public.member_begin_body_scan(uuid,uuid),public.member_finish_body_scan(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.member_begin_body_scan(uuid,uuid),public.member_finish_body_scan(uuid,uuid,jsonb) to service_role;
create function public.member_entitlements() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('training',exists(select 1 from public.user_subscriptions s join public.billing_settings b on b.id and b.mode=s.mode join public.subscription_plans p on p.code=s.plan_code where s.user_id=auth.uid() and s.revoked_at is null and s.starts_at<=now() and s.expires_at>now() and p.training_enabled),'scan_next_at',(select max(created_at)+interval '5 days' from public.member_body_reports where user_id=auth.uid()))$$;
revoke all on function public.member_entitlements() from public,anon;grant execute on function public.member_entitlements() to authenticated;
-- Existing onboarding scan and profile scan share a durable cooldown.
create or replace function public.reserve_body_scan() returns boolean language plpgsql security definer set search_path='' as $$declare latest timestamptz;begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null and phone ~ '^\+?989[0-9]{9}$') then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,35));
 select max(last_request_at) into latest from public.member_body_scan_usage where user_id=auth.uid();
 if latest>clock_timestamp()-interval '5 days' then return false;end if;
 insert into public.member_body_scan_usage(user_id,usage_date,requests,last_request_at) values(auth.uid(),current_date,1,clock_timestamp()) on conflict(user_id,usage_date) do update set requests=1,last_request_at=clock_timestamp();return true;
end$$;
create table public.member_skipped_meals(user_id uuid not null references auth.users(id),plan_date date not null,slot text not null check(slot in('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack','post_workout')),primary key(user_id,plan_date,slot));
alter table public.member_skipped_meals enable row level security;revoke all on public.member_skipped_meals from public,anon;grant select,insert,update,delete on public.member_skipped_meals to authenticated;
create policy member_skip_own on public.member_skipped_meals for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.billing_has_access() and plan_date between current_date-1 and current_date+1);
create function public.member_meal_status_exclusive() returns trigger language plpgsql security definer set search_path='' as $$declare slot_name text;begin
 slot_name:=case when tg_table_name='daily_meal_checkins' then to_jsonb(new)->>'meal_slot' else to_jsonb(new)->>'slot' end;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||new.plan_date::text||slot_name,41));
 if tg_table_name='daily_meal_checkins' then delete from public.member_skipped_meals where user_id=new.user_id and plan_date=new.plan_date and slot=slot_name;
 else delete from public.daily_meal_checkins where user_id=new.user_id and plan_date=new.plan_date and meal_slot=slot_name;end if;return new;end$$;
revoke all on function public.member_meal_status_exclusive() from public,anon,authenticated;
create trigger member_checkin_exclusive before insert or update on public.daily_meal_checkins for each row execute function public.member_meal_status_exclusive();
create trigger member_skip_exclusive before insert or update on public.member_skipped_meals for each row execute function public.member_meal_status_exclusive();
create table public.member_extra_foods(id uuid primary key,user_id uuid not null references auth.users(id),plan_date date not null,meal_slot text not null check(meal_slot in('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack','post_workout')),meal_snapshot jsonb not null check(jsonb_typeof(meal_snapshot)='object' and octet_length(meal_snapshot::text)<100000),created_at timestamptz not null default now());
create index member_extra_food_day on public.member_extra_foods(user_id,plan_date);
alter table public.member_extra_foods enable row level security;revoke all on public.member_extra_foods from public,anon,authenticated;grant select,insert,delete on public.member_extra_foods to authenticated;
create policy member_extra_read on public.member_extra_foods for select to authenticated using(user_id=auth.uid());
create policy member_extra_insert on public.member_extra_foods for insert to authenticated with check(user_id=auth.uid() and public.billing_has_access() and plan_date between current_date-1 and current_date+1 and (meal_snapshot->>'slot')=meal_slot);
create policy member_extra_delete on public.member_extra_foods for delete to authenticated using(user_id=auth.uid() and public.billing_has_access());
-- Keep an append-only revision log rather than overwriting feedback history.
create table public.member_experiences(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),entry_date date not null,weight_kg numeric,adherence text,hunger text,difficulty text,created_at timestamptz not null default now());
alter table public.member_experiences enable row level security;revoke all on public.member_experiences from public,anon,authenticated;grant select on public.member_experiences to authenticated;
create policy member_experience_read on public.member_experiences for select to authenticated using(user_id=auth.uid());
create function public.member_progress_logged() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.member_experiences(user_id,entry_date,weight_kg,adherence,hunger,difficulty) values(new.user_id,new.entry_date,new.weight_kg,new.adherence,new.hunger,new.difficulty);
 if new.weight_kg is not null then update public.user_profiles set weight=(select weight_kg from public.user_progress_entries where user_id=new.user_id and weight_kg is not null order by entry_date desc limit 1) where id=new.user_id;end if;return new;end$$;
revoke all on function public.member_progress_logged() from public,anon,authenticated;
create trigger member_progress_audit after insert or update on public.user_progress_entries for each row execute function public.member_progress_logged();
create table public.product_events(id uuid primary key,user_id uuid references auth.users(id),session_id uuid not null,event text not null,step smallint,source text not null,created_at timestamptz not null default now());
create index product_event_user_time on public.product_events(user_id,created_at);
create index product_event_time_name on public.product_events(created_at,event);
alter table public.product_events enable row level security;revoke all on public.product_events from public,anon,authenticated;
create function public.record_product_event(p_id uuid,p_session uuid,p_event text,p_step integer default null,p_source text default 'app') returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,39));
 if p_event not in('app_open','onboarding_step','onboarding_complete','paywall_view','preflight_ok','preflight_failed','checkout_started','meal_recorded','meal_undone','meal_skipped','meal_changed','food_manual','food_scan','progress_saved','training_view','training_generated','pro_signup') or p_source not in('app','landing','pro') or(p_step is not null and p_step not between 1 and 11) or p_session is null then raise exception 'INVALID_EVENT';end if;
 if (select count(*) from public.product_events where user_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then return;end if;
 insert into public.product_events values(p_id,auth.uid(),p_session,p_event,p_step,p_source,now()) on conflict(id) do nothing;end$$;
revoke all on function public.record_product_event(uuid,uuid,text,integer,text) from public;grant execute on function public.record_product_event(uuid,uuid,text,integer,text) to authenticated;
create function public.admin_member_experiences(p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$begin if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED';end if;return(select coalesce(jsonb_agg(x),'[]'::jsonb) from(select e.*,u.phone from public.member_experiences e join auth.users u on u.id=e.user_id order by created_at desc limit 50 offset greatest(0,least(p_page,10000))*50)x);end$$;
create function public.admin_business_pulse(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED';end if;if p_days not between 7 and 90 then raise exception 'INVALID_RANGE';end if;
 select jsonb_build_object('events',(select coalesce(jsonb_agg(x),'[]') from(select event,count(*) as events,count(distinct user_id) as users from public.product_events where created_at>now()-make_interval(days=>p_days) group by event)x),'daily',(select coalesce(jsonb_agg(x),'[]') from(select created_at::date as date,count(distinct user_id) as active_users from public.product_events where created_at>now()-make_interval(days=>p_days) group by created_at::date order by created_at::date)x),'payments',(select jsonb_build_object('successful',count(*) filter(where status='paid' and price_toman>0),'attempts',count(*) filter(where price_toman>0),'trials',count(*) filter(where status='paid' and plan_code='trial'),'revenue',coalesce(sum(price_toman) filter(where status='paid' and price_toman>0),0)) from public.payment_orders where mode='live' and created_at>now()-make_interval(days=>p_days)),'payment_segments',(select coalesce(jsonb_agg(x),'[]') from(select case when pro_application is null then 'app' else 'pro' end as source,plan_code,duration_days,count(*) filter(where price_toman>0) as attempts,count(*) filter(where status='paid' and price_toman>0) as successful,coalesce(sum(price_toman) filter(where status='paid' and price_toman>0),0) as revenue from public.payment_orders where mode='live' and created_at>now()-make_interval(days=>p_days) group by 1,2,3)x),'retention',(select coalesce(jsonb_agg(x),'[]') from(select d as day,count(*) as eligible,count(*) filter(where exists(select 1 from public.product_events e where e.user_id=u.id and e.created_at::date=u.created_at::date+d)) as returned from auth.users u cross join unnest(array[1,7,14,30])d where u.created_at::date<=current_date-d and u.created_at>greatest(now()-interval '90 days',coalesce((select min(created_at) from public.product_events),now())) group by d order by d)x),'onboarding',(select coalesce(jsonb_agg(x),'[]') from(select step,count(distinct user_id) as users from public.product_events where event='onboarding_step' and created_at>now()-make_interval(days=>p_days) group by step order by step)x)) into result;return result;end$$;
revoke all on function public.admin_business_pulse(integer),public.admin_member_experiences(integer) from public,anon;grant execute on function public.admin_business_pulse(integer),public.admin_member_experiences(integer) to authenticated;
create table public.member_training_plans(user_id uuid primary key references auth.users(id),profile_hash text not null,plan jsonb not null check(octet_length(plan::text)<500000),created_at timestamptz not null default now());
alter table public.member_training_plans enable row level security;revoke all on public.member_training_plans from public,anon,authenticated;
create function public.member_training_access(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.user_subscriptions s join public.billing_settings b on b.id and b.mode=s.mode join public.subscription_plans p on p.code=s.plan_code where s.user_id=p_user and s.revoked_at is null and s.starts_at<=now() and s.expires_at>now() and p.training_enabled)$$;
revoke all on function public.member_training_access(uuid) from public,anon,authenticated;grant execute on function public.member_training_access(uuid) to service_role;
grant select on public.user_profiles,public.food_items,public.food_substitutes,public.meal_templates,public.meal_template_slots,public.nutrition_protein_policy to service_role;
create function public.member_store_training(p_user uuid,p_plan jsonb,p_hash text,p_expected jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.member_training_access(p_user) then raise exception 'TRAINING_LOCKED';end if;
 perform 1 from public.user_profiles where id=p_user for update;
 if p_expected is distinct from (select to_jsonb(u) from public.user_profiles u where id=p_user) then raise exception 'PROFILE_CHANGED';end if;
 update public.user_profiles set workout_weekdays=array(select value::integer from jsonb_array_elements_text(p_plan#>'{input,days}')),workout_days=jsonb_array_length(p_plan#>'{input,days}') where id=p_user;
 insert into public.member_training_plans(user_id,plan,profile_hash) values(p_user,p_plan,(select (to_jsonb(u)-'updated_at')::text from public.user_profiles u where id=p_user)) on conflict(user_id) do update set plan=excluded.plan,profile_hash=excluded.profile_hash,created_at=now();end$$;
revoke all on function public.member_store_training(uuid,jsonb,text,jsonb) from public,anon,authenticated;grant execute on function public.member_store_training(uuid,jsonb,text,jsonb) to service_role;
grant select on public.member_training_plans to service_role;
create function public.member_activate_training(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare approved jsonb;p public.user_profiles;hash text;begin
 perform 1 from public.user_profiles where id=p_user for update;
 if not public.member_training_access(p_user) then raise exception 'TRAINING_LOCKED';end if;
 select f.training_plan into approved from public.user_subscriptions s join public.payment_orders o on o.id=s.source_order_id join public.member_preflights f on f.id=o.member_preflight join public.user_profiles u on u.id=f.user_id where s.user_id=p_user and s.revoked_at is null and s.starts_at<=now() and s.expires_at>now() and s.plan_code='gold' and f.profile_hash=md5(to_jsonb(u)::text) order by s.starts_at desc limit 1;
 if approved is null then return null;end if;
 -- The server validates training inputs; the SQL function never accepts a client-supplied plan.
 select * into p from public.user_profiles where id=p_user;
 hash:=jsonb_build_object('display_name',coalesce(p.display_name,'عضو به‌تن'),'gender',p.gender,'birth_date',p.birth_date,'height_cm',p.height,'weight_kg',p.weight,'goal',p.goal,'workout_days',jsonb_array_length(approved#>'{input,days}'),'medical_conditions',coalesce(p.medical_conditions_json->'conditions','[]'),'medications_present',length(trim(coalesce(p.medical_conditions_json#>>'{medications}','')))>0,'injuries_present',length(trim(coalesce(p.medical_conditions_json#>>'{injuries}','')))>0,'pregnancy_status',coalesce(p.medical_conditions_json->>'pregnancyStatus','not_applicable'),'eating_disorder_status',coalesce(p.medical_conditions_json->>'eatingDisorderStatus','none'),'safety_confirmed',coalesce((p.medical_conditions_json->>'safetyAnswersConfirmed')::boolean,false),'screening_version',1)::text;
 perform public.member_store_training(p_user,approved,hash,to_jsonb(p));return approved;end$$;
revoke all on function public.member_activate_training(uuid) from public,anon,authenticated;grant execute on function public.member_activate_training(uuid) to service_role;
create function public.member_order_training_ready() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='paid' and old.status<>'paid' and new.plan_code='gold' then perform public.member_activate_training(new.user_id);end if;return new;end$$;
revoke all on function public.member_order_training_ready() from public,anon,authenticated;
create trigger member_paid_training after update of status on public.payment_orders for each row execute function public.member_order_training_ready();
commit;
