begin;
create table public.pro_applications(user_id uuid primary key references auth.users(id),name text not null check(length(name) between 1 and 100),field text not null check(field in('nutrition','training','clinic','gym')),phone text not null,organization_id uuid references public.pro_organizations(id),trial_claimed boolean not null default false,offer text,months integer,created_at timestamptz not null default now());
alter table public.pro_applications enable row level security;revoke all on public.pro_applications from public,anon,authenticated;
grant select on public.pro_applications to authenticated;
create policy pro_application_self on public.pro_applications for select to authenticated using(user_id=auth.uid());
alter table public.payment_orders add constraint pro_order_application_fk foreign key(pro_application) references public.pro_applications(user_id);
-- Internal immutable order identifiers. Not marketed in the B2C catalog.
insert into public.subscription_plans(code,name,price_toman,duration_days,features,is_active) values('pro_nutrition','پنل تغذیه',0,30,array['پنل متخصص'],false),('pro_training','پنل تمرین',0,30,array['پنل متخصص'],false),('pro_combined','پنل ترکیبی',0,30,array['پنل متخصص'],false);
create function pro_private.self_workspace(p_user uuid,p_code text,p_months integer,p_trial boolean) returns uuid language plpgsql security definer set search_path='' as $$declare a public.pro_applications;org uuid;until_date timestamptz;begin
 select * into a from public.pro_applications where user_id=p_user for update;if not found then raise exception 'APPLICATION_REQUIRED';end if;
 if not p_trial and a.offer is not null and a.offer<>'trial' and a.offer<>p_code and exists(select 1 from public.pro_workspace_licenses where organization_id=a.organization_id and status='active' and expires_at>now()) then raise exception 'PRO_PLAN_CHANGE_REQUIRES_SUPPORT';end if;
 org:=a.organization_id;until_date:=case when p_trial then now()+interval '10 years' else now()+make_interval(months=>p_months) end;
 if org is null then
  insert into public.pro_organizations(name,created_by,request_key) values(a.name,p_user,gen_random_uuid()) returning id into org;
  insert into public.pro_memberships(organization_id,user_id,roles) values(org,p_user,array['owner','practitioner']);
  update public.pro_applications set organization_id=org where user_id=p_user;
 end if;
 insert into public.pro_pilot_access(user_id,expires_at) values(p_user,until_date) on conflict(user_id) do update set expires_at=greatest(public.pro_pilot_access.expires_at,excluded.expires_at);
 insert into public.pro_workspace_licenses(organization_id,status,expires_at,case_limit,updated_by) values(org,'active',until_date,case when p_trial then 3 else 100000 end,p_user) on conflict(organization_id) do update set status='active',expires_at=case when a.offer='trial' then now()+make_interval(months=>p_months) else greatest(public.pro_workspace_licenses.expires_at,now())+make_interval(months=>p_months) end,case_limit=100000,revision=public.pro_workspace_licenses.revision+1,updated_by=p_user;
 insert into public.pro_module_access(organization_id,nutrition,training,updated_by) values(org,p_code in('nutrition','combined','trial'),p_code in('training','combined','trial'),p_user) on conflict(organization_id) do update set nutrition=excluded.nutrition,training=excluded.training,revision=public.pro_module_access.revision+1,updated_by=p_user;
 update public.pro_applications set offer=p_code,months=p_months,trial_claimed=trial_claimed or p_trial where user_id=p_user;
 return org;
end$$;
revoke all on function pro_private.self_workspace(uuid,text,integer,boolean) from public,anon,authenticated,service_role;
create function public.pro_register(p_name text,p_field text,p_trial boolean default false) returns uuid language plpgsql security definer set search_path='' as $$declare u auth.users;a public.pro_applications;begin
 select * into u from auth.users where id=auth.uid() and phone_confirmed_at is not null and phone is not null for update;if not found then raise exception 'AUTH_REQUIRED';end if;
 if length(trim(p_name)) not between 1 and 100 or p_field not in('nutrition','training','clinic','gym') then raise exception 'INVALID_APPLICATION';end if;
 insert into public.pro_applications(user_id,name,field,phone) values(u.id,trim(p_name),p_field,u.phone) on conflict(user_id) do update set name=excluded.name,field=excluded.field;
 select * into a from public.pro_applications where user_id=u.id for update;
 if not p_trial then return a.organization_id;end if;
 if a.trial_claimed then if a.organization_id is not null then return a.organization_id;end if;raise exception 'TRIAL_USED';end if;
 if a.organization_id is not null or exists(select 1 from public.pro_memberships where user_id=u.id and 'owner'=any(roles)) then raise exception 'WORKSPACE_EXISTS';end if;
 return pro_private.self_workspace(u.id,'trial',0,true);
end$$;
revoke all on function public.pro_register(text,text,boolean) from public,anon;grant execute on function public.pro_register(text,text,boolean) to authenticated;
create function public.pro_begin_checkout(p_user uuid,p_code text,p_months integer,p_price bigint) returns jsonb language plpgsql security definer set search_path='' as $$declare b public.billing_settings;offer public.pro_offers;o public.payment_orders;amount bigint;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,14));
 if not exists(select 1 from public.pro_applications where user_id=p_user) then raise exception 'APPLICATION_REQUIRED';end if;
 if exists(select 1 from public.pro_applications a join public.pro_workspace_licenses l on l.organization_id=a.organization_id where a.user_id=p_user and a.offer is not null and a.offer not in('trial',p_code) and l.status='active' and l.expires_at>now()) then raise exception 'PRO_PLAN_CHANGE_REQUIRES_SUPPORT';end if;
 if p_months not in(1,3,6,12) then raise exception 'INVALID_PERIOD';end if;
 select * into offer from public.pro_offers where code=p_code and active for share;if not found then raise exception 'PLAN_UNAVAILABLE';end if;
 amount:=(offer.prices->>p_months::text)::bigint;if amount is null or amount<>p_price then raise exception 'OFFER_CHANGED';end if;
 select * into b from public.billing_settings where id for share;if not b.checkout_enabled then raise exception 'CHECKOUT_DISABLED';end if;
 select * into o from public.payment_orders where user_id=p_user and mode=b.mode and status in('creating','pending') and created_at>now()-interval '20 minutes' order by created_at desc limit 1;
 if found then if o.plan_code<>'pro_'||p_code or o.price_toman<>amount or o.duration_days<>p_months*30 then raise exception 'PENDING_ORDER_EXISTS';end if;if o.status='pending' then return to_jsonb(o)||jsonb_build_object('is_new',false);end if;if o.created_at>now()-interval '60 seconds' then raise exception 'CHECKOUT_BUSY';end if;update public.payment_orders set status='failed' where id=o.id;end if;
 if(select count(*) from public.payment_orders where user_id=p_user and created_at>now()-interval '5 minutes')>=5 then raise exception 'RATE_LIMITED';end if;
 insert into public.payment_orders(user_id,plan_code,plan_name,price_toman,duration_days,mode,pro_application) values(p_user,'pro_'||p_code,offer.title,amount,p_months*30,b.mode,p_user) returning * into o;
 return to_jsonb(o)||jsonb_build_object('is_new',true);
end$$;
revoke all on function public.pro_begin_checkout(uuid,text,integer,bigint) from public,anon,authenticated;grant execute on function public.pro_begin_checkout(uuid,text,integer,bigint) to service_role;
alter function public.billing_settle(uuid,text,integer) rename to billing_settle_before_pro;
revoke all on function public.billing_settle_before_pro(uuid,text,integer) from public,anon,authenticated,service_role;
create function public.billing_settle(p_order uuid,p_ref text,p_code integer) returns jsonb language plpgsql security definer set search_path='' as $$declare o public.payment_orders;org uuid;begin
 select * into o from public.payment_orders where id=p_order;perform pg_advisory_xact_lock(hashtextextended(o.user_id::text,14));select * into o from public.payment_orders where id=p_order for update;
 if o.pro_application is null then return public.billing_settle_before_pro(p_order,p_ref,p_code);end if;
 if o.status='paid' then return jsonb_build_object('organization_id',(select organization_id from public.pro_applications where user_id=o.user_id));end if;
 if o.price_toman>0 and(o.authority is null or p_code is null or p_code not in(100,101) or p_ref is null or p_ref!~'^[0-9]{1,30}$') then raise exception 'VERIFY_REQUIRED';end if;
 if o.price_toman=0 and(p_ref is not null or p_code is distinct from 0) then raise exception 'INVALID_FREE_ORDER';end if;
 -- Sandbox verifies gateway integration only; it must not provision commercial access.
 if o.mode='live' then org:=pro_private.self_workspace(o.user_id,substring(o.plan_code from 5),o.duration_days/30,false);end if;
 update public.payment_orders set status='paid',ref_id=p_ref,last_code=p_code,verified_at=now(),verify_lease_until=null where id=o.id;return jsonb_build_object('organization_id',org);
end$$;
revoke all on function public.billing_settle(uuid,text,integer) from public,anon,authenticated;grant execute on function public.billing_settle(uuid,text,integer) to service_role;
commit;
