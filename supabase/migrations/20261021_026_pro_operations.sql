begin;
create table public.pro_workspace_licenses (
 organization_id uuid primary key references public.pro_organizations(id),
 status text not null check(status in ('active','suspended')),
 expires_at timestamptz not null, case_limit integer not null check(case_limit between 1 and 100000),
 revision integer not null default 1, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.pro_license_audit (
 id uuid primary key, organization_id uuid not null references public.pro_organizations(id),
 actor_id uuid not null references auth.users(id), reason text not null, request jsonb not null,
 before_data jsonb, after_data jsonb not null, created_at timestamptz not null default now()
);
create table public.pro_failure_events (
 id uuid primary key, organization_id uuid not null references public.pro_organizations(id),
 actor_id uuid not null references auth.users(id), operation text not null check(operation in ('generate','save')),
 error_code text not null check(error_code ~ '^PRO_[A-Z_]{1,60}$'), created_at timestamptz not null default now()
);
create index pro_failure_actor_time on public.pro_failure_events(actor_id,created_at);
create index pro_failure_recent on public.pro_failure_events(organization_id,created_at desc,id);
create index pro_cases_browse on public.pro_real_cases(organization_id,updated_at desc,id);
create index pro_plan_browse on public.pro_real_plans(organization_id,record_id,recorded_at desc,id);
create table public.pro_maintenance_runs (
 id uuid primary key, actor_id uuid references auth.users(id), drafts_deleted integer not null,
 failures_deleted integer not null, created_at timestamptz not null default now()
);
alter table public.pro_workspace_licenses enable row level security;
alter table public.pro_license_audit enable row level security;
alter table public.pro_failure_events enable row level security;
alter table public.pro_maintenance_runs enable row level security;
revoke all on public.pro_workspace_licenses,public.pro_license_audit,public.pro_failure_events,public.pro_maintenance_runs from public,anon,authenticated,service_role;
create trigger pro_license_audit_immutable before update or delete on public.pro_license_audit for each row execute function pro_private.immutable_audit();

-- Expiry permits reading/downloading old snapshots; explicit suspension denies
-- all workspace access, including existing pilot access. No paid order is fabricated.
create function pro_private.workspace_visible(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pro_private.verified_actor() is not null and case
 when exists(select 1 from public.pro_workspace_licenses l where l.organization_id=org)
 then exists(select 1 from public.pro_workspace_licenses l where l.organization_id=org and l.status='active')
 else pro_private.pilot_allowed() end
$$;
create or replace function pro_private.has_role(org uuid,requested_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select pro_private.workspace_visible(org) and exists(select 1 from public.pro_memberships m join public.pro_organizations o on o.id=m.organization_id
 where m.organization_id=org and m.user_id=pro_private.verified_actor() and m.status='active' and o.status='active' and m.roles && requested_roles)
$$;
create or replace function public.pro_pilot_status() returns boolean language sql stable security definer set search_path='' as $$
 select pro_private.pilot_allowed() or exists(select 1 from public.pro_memberships m where m.user_id=pro_private.verified_actor()
 and pro_private.has_role(m.organization_id,array['owner','practitioner','assistant']))
$$;
create function pro_private.can_write_workspace(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pro_private.has_role(org,array['owner','practitioner']) and case
 when exists(select 1 from public.pro_workspace_licenses l where l.organization_id=org)
 then exists(select 1 from public.pro_workspace_licenses l where l.organization_id=org and l.status='active' and l.expires_at>now())
 else pro_private.pilot_allowed() end
$$;
create function pro_private.guard_pro_write() returns trigger language plpgsql security definer set search_path='' as $$
declare cap integer;
begin
 if not pro_private.can_write_workspace(new.organization_id) then raise exception 'PRO_SUBSCRIPTION_EXPIRED' using errcode='42501'; end if;
 if tg_table_name='pro_real_cases' and tg_op='INSERT' then
  select case_limit into cap from public.pro_workspace_licenses where organization_id=new.organization_id;
  if cap is not null and (select count(*) from public.pro_real_cases where organization_id=new.organization_id)>=cap then raise exception 'PRO_CASE_LIMIT'; end if;
 end if;
 return new;
end $$;
create trigger pro_case_license_guard before insert or update on public.pro_real_cases for each row execute function pro_private.guard_pro_write();
create trigger pro_draft_license_guard before insert on public.pro_server_plan_drafts for each row execute function pro_private.guard_pro_write();
create trigger pro_plan_license_guard before insert on public.pro_real_plans for each row execute function pro_private.guard_pro_write();
create function public.pro_workspace_status(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.pro_workspace_licenses;
begin
 if not pro_private.has_role(p_org,array['owner','practitioner','assistant']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 select * into l from public.pro_workspace_licenses where organization_id=p_org;
 return jsonb_build_object('can_write',pro_private.can_write_workspace(p_org),'source',case when found then 'admin' else 'pilot' end,
 'expires_at',coalesce(l.expires_at,(select expires_at from public.pro_pilot_access where user_id=auth.uid())),
 'case_limit',l.case_limit,'case_count',(select count(*) from public.pro_real_cases c where c.organization_id=p_org and pro_private.real_case_editor(p_org,c.id)));
end $$;
-- Summary-only rows: health answers are fetched only when a case is opened.
create function public.pro_browse_cases(p_org uuid,p_search text default '',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=btrim(coalesce(p_search,'')); total bigint; rows jsonb;
begin
 if not pro_private.has_role(p_org,array['owner','practitioner']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 or length(q)>100 then raise exception 'PRO_INVALID_REQUEST'; end if;
 -- Literal substring search: % and _ are ordinary text, not SQL wildcards.
 select count(*) into total from public.pro_real_cases c where c.organization_id=p_org and pro_private.real_case_editor(p_org,c.id)
 and (q='' or strpos(lower(c.display_name),lower(q))>0 or strpos(c.phone,q)>0);
 select coalesce(jsonb_agg(x order by x.updated_at desc,x.id),'[]') into rows from (
 select c.id,c.display_name,c.phone,c.revision,c.updated_at from public.pro_real_cases c
 where c.organization_id=p_org and pro_private.real_case_editor(p_org,c.id)
 and (q='' or strpos(lower(c.display_name),lower(q))>0 or strpos(c.phone,q)>0)
 order by c.updated_at desc,c.id limit 25 offset p_page*25) x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',25);
end $$;
create function public.pro_browse_case_history(p_org uuid,p_record uuid,p_kind text,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; total bigint;
begin
 if not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 or p_kind not in ('intakes','plans') or p_kind is null then raise exception 'PRO_INVALID_REQUEST'; end if;
 if p_kind='intakes' then
  select count(*) into total from public.pro_real_intake_versions where organization_id=p_org and record_id=p_record;
  select coalesce(jsonb_agg(x order by x.revision desc),'[]') into rows from (
   select revision,answers,recorded_at from public.pro_real_intake_versions where organization_id=p_org and record_id=p_record order by revision desc limit 10 offset p_page*10) x;
 else
  select count(*) into total from public.pro_real_plans where organization_id=p_org and record_id=p_record;
  select coalesce(jsonb_agg(x order by x.recorded_at desc,x.id),'[]') into rows from (
   select id,intake_revision,recorded_at,plan from public.pro_real_plans where organization_id=p_org and record_id=p_record order by recorded_at desc,id limit 10 offset p_page*10) x;
 end if;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',10);
end $$;
create function public.admin_pro_overview(p_search text default '',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=btrim(coalesce(p_search,'')); rows jsonb; total bigint;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 or length(q)>100 then raise exception 'PRO_INVALID_REQUEST'; end if;
 select count(*) into total from public.pro_organizations o where q='' or strpos(lower(o.name),lower(q))>0 or o.id::text=q
 or exists(select 1 from public.pro_memberships m join auth.users u on u.id=m.user_id where m.organization_id=o.id and strpos(coalesce(u.phone,''),q)>0);
 select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') into rows from (
 select o.id,o.name,o.status,o.created_at,l.status as license_status,l.expires_at,l.case_limit,coalesce(l.revision,0) as revision,
 (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'phone',u.phone,'roles',m.roles)),'[]') from public.pro_memberships m join auth.users u on u.id=m.user_id where m.organization_id=o.id and m.status='active') as members,
 (select count(*) from public.pro_real_cases c where c.organization_id=o.id) as case_count,
 (select count(*) from public.pro_real_plans p where p.organization_id=o.id) as plan_count,
 (select max(p.expires_at) from public.pro_pilot_access p join public.pro_memberships m on m.user_id=p.user_id where m.organization_id=o.id and m.status='active') as pilot_expires_at
 from public.pro_organizations o left join public.pro_workspace_licenses l on l.organization_id=o.id
 where q='' or strpos(lower(o.name),lower(q))>0 or o.id::text=q
 or exists(select 1 from public.pro_memberships m join auth.users u on u.id=m.user_id where m.organization_id=o.id and strpos(coalesce(u.phone,''),q)>0)
 order by o.created_at desc,o.id limit 25 offset p_page*25) x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end $$;
create function public.admin_pro_set_license(p_org uuid,p_expected integer,p_status text,p_expires timestamptz,p_limit integer,p_reason text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.pro_workspace_licenses; fresh public.pro_workspace_licenses; prior public.pro_license_audit; request jsonb;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_key is null or p_expected is null or p_expected<0 or p_status is null or p_status not in ('active','suspended') or p_expires is null
 or p_expires<now()-interval '10 years' or p_expires>now()+interval '10 years' or p_limit is null or p_limit not between 1 and 100000
 or p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'PRO_INVALID_REQUEST'; end if;
 perform 1 from public.pro_organizations where id=p_org for update;
 if not found then raise exception 'PRO_ACCESS_DENIED'; end if;
 request:=jsonb_build_object('org',p_org,'expected',p_expected,'status',p_status,'expires',p_expires,'limit',p_limit,'reason',btrim(p_reason));
 select * into prior from public.pro_license_audit where id=p_key;
 if found then
  if prior.actor_id<>auth.uid() or prior.request<>request then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return prior.after_data;
 end if;
 select * into old from public.pro_workspace_licenses where organization_id=p_org;
 if coalesce(old.revision,0)<>p_expected then raise exception 'PRO_STALE_REVISION'; end if;
 insert into public.pro_workspace_licenses(organization_id,status,expires_at,case_limit,revision,updated_by)
 values(p_org,p_status,p_expires,p_limit,p_expected+1,auth.uid()) on conflict(organization_id) do update
 set status=excluded.status,expires_at=excluded.expires_at,case_limit=excluded.case_limit,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now() returning * into fresh;
 insert into public.pro_license_audit(id,organization_id,actor_id,reason,request,before_data,after_data)
 values(p_key,p_org,auth.uid(),btrim(p_reason),request,to_jsonb(old),to_jsonb(fresh));
 return to_jsonb(fresh);
end $$;
create function public.admin_pro_events(p_org uuid,p_kind text default 'failures',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; total bigint;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 or p_kind is null or p_kind not in ('failures','audit') then raise exception 'PRO_INVALID_REQUEST'; end if;
 if p_kind='failures' then
  select count(*) into total from public.pro_failure_events where organization_id=p_org;
  select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') into rows from (select id,actor_id,operation,error_code,created_at from public.pro_failure_events where organization_id=p_org order by created_at desc,id limit 25 offset p_page*25) x;
 else
  select count(*) into total from public.pro_license_audit where organization_id=p_org;
  select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') into rows from (select id,actor_id,reason,before_data,after_data,created_at from public.pro_license_audit where organization_id=p_org order by created_at desc,id limit 25 offset p_page*25) x;
 end if;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end $$;
create function public.pro_report_failure(p_id uuid,p_actor uuid,p_org uuid,p_operation text,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pro_private.bind_plan_actor(p_actor);
 if not pro_private.has_role(p_org,array['owner','practitioner']) then return; end if;
 if p_id is null or p_operation is null or p_operation not in ('generate','save') or p_code is null or p_code !~ '^PRO_[A-Z_]{1,60}$' then raise exception 'PRO_INVALID_REQUEST'; end if;
 -- Store codes/identifiers only, never health answers, notes, phone, tokens or raw exceptions.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,26026));
 if (select count(*) from public.pro_failure_events where actor_id=p_actor and created_at>now()-interval '1 hour')>=100 then return; end if;
 insert into public.pro_failure_events(id,organization_id,actor_id,operation,error_code) values(p_id,p_org,p_actor,p_operation,p_code) on conflict(id) do nothing;
end $$;
create function pro_private.cleanup_pro(p_key uuid,p_actor uuid,p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.pro_maintenance_runs; nd integer; nf integer;
begin
 if p_key is null or p_limit is null or p_limit not between 1 and 1000 then raise exception 'PRO_INVALID_REQUEST'; end if;
 perform pg_advisory_xact_lock(26021);
 select * into old from public.pro_maintenance_runs where id=p_key;
 if found then
  if old.actor_id is distinct from p_actor then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return to_jsonb(old);
 end if;
 -- Retain drafts backing confirmed plans, preserving publish-response retry semantics.
 with doomed as (select d.id from public.pro_server_plan_drafts d where d.expires_at<now()-interval '24 hours'
 and not exists(select 1 from public.pro_real_plans p where p.organization_id=d.organization_id and p.record_id=d.record_id and p.intake_revision=d.intake_revision and p.plan=d.plan)
 order by d.expires_at,d.id limit p_limit)
 delete from public.pro_server_plan_drafts where id in (select id from doomed);
 get diagnostics nd=row_count;
 with doomed as (select id from public.pro_failure_events where created_at<now()-interval '90 days' order by created_at,id limit p_limit)
 delete from public.pro_failure_events where id in (select id from doomed);
 get diagnostics nf=row_count;
 insert into public.pro_maintenance_runs(id,actor_id,drafts_deleted,failures_deleted) values(p_key,p_actor,nd,nf) returning * into old;
 return to_jsonb(old);
end $$;
create function public.admin_pro_cleanup(p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 return pro_private.cleanup_pro(p_key,auth.uid(),500);
end $$;
create function public.pro_service_cleanup(p_key uuid) returns jsonb language sql security definer set search_path='' as $$
 select pro_private.cleanup_pro(p_key,null,500)
$$;
create function public.pro_service_status() returns text language sql stable security definer set search_path='' as $$select 'operations-v1'::text$$;
revoke all on function public.pro_service_status() from public,anon,authenticated;
grant execute on function public.pro_service_status() to service_role;
revoke all on function pro_private.workspace_visible(uuid),pro_private.can_write_workspace(uuid),pro_private.guard_pro_write(),pro_private.cleanup_pro(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.pro_workspace_status(uuid),public.pro_browse_cases(uuid,text,integer),public.pro_browse_case_history(uuid,uuid,text,integer),public.admin_pro_overview(text,integer),public.admin_pro_set_license(uuid,integer,text,timestamptz,integer,text,uuid),public.admin_pro_events(uuid,text,integer),public.admin_pro_cleanup(uuid),public.pro_report_failure(uuid,uuid,uuid,text,text),public.pro_service_cleanup(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pro_workspace_status(uuid),public.pro_browse_cases(uuid,text,integer),public.pro_browse_case_history(uuid,uuid,text,integer),public.admin_pro_overview(text,integer),public.admin_pro_set_license(uuid,integer,text,timestamptz,integer,text,uuid),public.admin_pro_events(uuid,text,integer),public.admin_pro_cleanup(uuid) to authenticated;
grant execute on function public.pro_report_failure(uuid,uuid,uuid,text,text),public.pro_service_cleanup(uuid) to service_role;
create table public.pro_admin_workspace_commands (
 id uuid primary key, actor_id uuid not null references auth.users(id), request jsonb not null,
 organization_id uuid not null references public.pro_organizations(id), created_at timestamptz not null default now()
);
alter table public.pro_admin_workspace_commands enable row level security;
revoke all on public.pro_admin_workspace_commands from public,anon,authenticated,service_role;
create trigger pro_workspace_commands_immutable before update or delete on public.pro_admin_workspace_commands for each row execute function pro_private.immutable_audit();
create function public.admin_pro_create_workspace(p_user uuid,p_name text,p_expires timestamptz,p_limit integer,p_reason text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.pro_admin_workspace_commands; request jsonb; org uuid;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_key is null or p_name is null or length(btrim(p_name)) not between 1 and 100 then raise exception 'PRO_INVALID_REQUEST'; end if;
 perform 1 from auth.users where id=p_user and phone is not null and phone_confirmed_at is not null for update;
 if not found then raise exception 'PRO_VERIFIED_USER_REQUIRED'; end if;
 request:=jsonb_build_object('user',p_user,'name',btrim(p_name),'expires',p_expires,'limit',p_limit,'reason',btrim(p_reason));
 select * into prior from public.pro_admin_workspace_commands where id=p_key;
 if found then
  if prior.actor_id<>auth.uid() or prior.request<>request then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return prior.organization_id;
 end if;
 if exists(select 1 from public.pro_memberships where user_id=p_user and 'owner'=any(roles) and status='active') then raise exception 'PRO_WORKSPACE_EXISTS'; end if;
 insert into public.pro_organizations(name,created_by,request_key) values(btrim(p_name),p_user,p_key) returning id into org;
 insert into public.pro_memberships(organization_id,user_id,roles) values(org,p_user,array['owner']);
 perform public.admin_pro_set_license(org,0,'active',p_expires,p_limit,p_reason,p_key);
 insert into public.pro_admin_workspace_commands(id,actor_id,request,organization_id) values(p_key,auth.uid(),request,org);
 return org;
end $$;
revoke all on function public.admin_pro_create_workspace(uuid,text,timestamptz,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_pro_create_workspace(uuid,text,timestamptz,integer,text,uuid) to authenticated;

commit;
