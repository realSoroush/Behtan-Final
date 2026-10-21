begin;
alter table public.pro_real_cases add column archived_at timestamptz, add column archive_revision integer not null default 0;
create table public.pro_case_archive_events(id uuid primary key,organization_id uuid not null references public.pro_organizations(id),record_id uuid not null references public.pro_real_cases(id),actor_id uuid not null references auth.users(id),request jsonb not null,result jsonb not null,created_at timestamptz not null default now());
create table public.pro_renewal_requests(id uuid primary key,organization_id uuid not null references public.pro_organizations(id),actor_id uuid not null references auth.users(id),status text not null default 'pending' check(status in ('pending','resolved')),created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references auth.users(id));
create unique index pro_one_pending_renewal on public.pro_renewal_requests(organization_id) where status='pending';
alter table public.pro_case_archive_events enable row level security;
alter table public.pro_renewal_requests enable row level security;
revoke all on public.pro_case_archive_events,public.pro_renewal_requests from public,anon,authenticated,service_role;
create trigger pro_archive_audit_immutable before update or delete on public.pro_case_archive_events for each row execute function pro_private.immutable_audit();
create function pro_private.guard_archived_case() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.archived_at is not null and (new.answers is distinct from old.answers or new.revision<>old.revision) then raise exception 'PRO_CASE_ARCHIVED';end if;return new;
end $$;
create trigger pro_case_archive_guard before update on public.pro_real_cases for each row execute function pro_private.guard_archived_case();
revoke all on function pro_private.guard_archived_case() from public,anon,authenticated,service_role;
create function public.pro_set_case_archived(p_org uuid,p_record uuid,p_expected integer,p_archived boolean,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases; prior public.pro_case_archive_events; request jsonb; result jsonb;
begin
 if not pro_private.real_case_editor(p_org,p_record) or not pro_private.can_write_workspace(p_org) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501';end if;
 if p_key is null or p_expected is null or p_archived is null then raise exception 'PRO_INVALID_REQUEST';end if;
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into c from public.pro_real_cases where organization_id=p_org and id=p_record for update;
 request:=jsonb_build_object('expected',p_expected,'archived',p_archived);
 select * into prior from public.pro_case_archive_events where id=p_key;
 if found then if prior.actor_id<>auth.uid() or prior.organization_id<>p_org or prior.record_id<>p_record or prior.request<>request then raise exception 'PRO_REQUEST_CONFLICT';end if;return prior.result;end if;
 if c.archive_revision<>p_expected then raise exception 'PRO_STALE_REVISION';end if;
 update public.pro_real_cases set archived_at=case when p_archived then now() else null end,archive_revision=archive_revision+1 where id=p_record returning * into c;
 result:=jsonb_build_object('archived_at',c.archived_at,'archive_revision',c.archive_revision);
 insert into public.pro_case_archive_events values(p_key,p_org,p_record,auth.uid(),request,result,now());return result;
end $$;
create function public.pro_browse_case_directory(p_org uuid,p_search text default '',p_page integer default 0,p_archived boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=btrim(coalesce(p_search,''));total bigint;rows jsonb;
begin
 if not pro_private.has_role(p_org,array['owner','practitioner']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501';end if;
 if p_page is null or p_page<0 or p_page>100000 or length(q)>100 or p_archived is null then raise exception 'PRO_INVALID_REQUEST';end if;
 select count(*) into total from public.pro_real_cases c where c.organization_id=p_org and pro_private.real_case_editor(p_org,c.id) and (c.archived_at is not null)=p_archived and(q='' or strpos(lower(c.display_name),lower(q))>0 or strpos(c.phone,q)>0);
 select coalesce(jsonb_agg(x order by x.updated_at desc,x.id),'[]') into rows from(select c.id,c.display_name,c.phone,c.revision,c.updated_at,c.archived_at,c.archive_revision from public.pro_real_cases c where c.organization_id=p_org and pro_private.real_case_editor(p_org,c.id) and (c.archived_at is not null)=p_archived and(q='' or strpos(lower(c.display_name),lower(q))>0 or strpos(c.phone,q)>0) order by c.updated_at desc,c.id limit 25 offset p_page*25)x;
 return jsonb_build_object('rows',rows,'total',total);
end $$;
create function pro_private.normalized_case_phone(p text) returns text language sql immutable set search_path='' as $$select case when n ~ '^09[0-9]{9}$' then '98'||substr(n,2) when n ~ '^9[0-9]{9}$' then '98'||n else n end from(select regexp_replace(translate(coalesce(p,''),'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'),'[^0-9]','','g') n)x$$;
revoke all on function pro_private.normalized_case_phone(text) from public,anon,authenticated,service_role;
create function public.pro_duplicate_cases(p_org uuid,p_phone text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n text:=pro_private.normalized_case_phone(p_phone);rows jsonb;
begin
 if not pro_private.has_role(p_org,array['owner','practitioner']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501';end if;
 if length(coalesce(p_phone,''))>30 then raise exception 'PRO_INVALID_REQUEST';end if;
 if n='' then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(x),'[]') into rows from(select c.id,c.display_name,c.archived_at from public.pro_real_cases c where c.organization_id=p_org and pro_private.real_case_editor(p_org,c.id) and pro_private.normalized_case_phone(c.phone)=n order by c.updated_at desc limit 10)x;return rows;
end $$;
create function public.pro_subscription_details(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;history jsonb;pending jsonb;
begin
 result:=public.pro_workspace_status(p_org);
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]') into history from(select id,created_at,after_data->>'status' as status,after_data->>'expires_at' as expires_at,after_data->>'case_limit' as case_limit from public.pro_license_audit where organization_id=p_org order by created_at desc,id limit 30)x;
 select jsonb_build_object('id',id,'created_at',created_at) into pending from public.pro_renewal_requests where organization_id=p_org and status='pending';
 return result||jsonb_build_object('history',history,'renewal',pending,'can_request_renewal',pro_private.has_role(p_org,array['owner']));
end $$;
create function public.pro_request_renewal(p_org uuid,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.pro_renewal_requests;result uuid;
begin
 if not pro_private.has_role(p_org,array['owner']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501';end if;
 if p_key is null then raise exception 'PRO_INVALID_REQUEST';end if;
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into prior from public.pro_renewal_requests where id=p_key;
 if found then if prior.organization_id<>p_org or prior.actor_id<>auth.uid() then raise exception 'PRO_REQUEST_CONFLICT';end if;return prior.id;end if;
 select id into result from public.pro_renewal_requests where organization_id=p_org and status='pending';if found then return result;end if;
 insert into public.pro_renewal_requests(id,organization_id,actor_id) values(p_key,p_org,auth.uid());return p_key;
end $$;
create function public.admin_pro_renewals(p_org uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 select coalesce(jsonb_agg(x order by x.created_at),'[]') into rows from(select r.id,r.organization_id,o.name,r.created_at from public.pro_renewal_requests r join public.pro_organizations o on o.id=r.organization_id where r.status='pending' and(p_org is null or r.organization_id=p_org) order by r.created_at limit 100)x;return rows;
end $$;
create function public.admin_pro_resolve_renewal(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 update public.pro_renewal_requests set status='resolved',resolved_at=now(),resolved_by=auth.uid() where id=p_id and status='pending';
end $$;
-- Only the authenticated admin server can resolve a phone or provision an
-- unconfirmed Auth account. Provisioning does not confirm ownership of a phone.
create function public.admin_pro_lookup_phone(p_actor uuid,p_phone text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pro_private.bind_plan_actor(p_actor);if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_phone !~ '^989[0-9]{9}$' or p_phone is null then raise exception 'PRO_INVALID_REQUEST';end if;
 select id into result from auth.users where phone in(p_phone,'+'||p_phone);return result;
end $$;
create function public.admin_pro_provision_phone(p_actor uuid,p_user uuid,p_name text,p_expires timestamptz,p_limit integer,p_reason text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.pro_admin_workspace_commands;request jsonb;org uuid;
begin
 perform pro_private.bind_plan_actor(p_actor);if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_key is null or p_name is null or length(btrim(p_name)) not between 1 and 100 then raise exception 'PRO_INVALID_REQUEST';end if;
 perform 1 from auth.users where id=p_user and phone ~ '^\+?989[0-9]{9}$' for update;if not found then raise exception 'PRO_INVALID_REQUEST';end if;
 request:=jsonb_build_object('user',p_user,'name',btrim(p_name),'expires',p_expires,'limit',p_limit,'reason',btrim(p_reason));
 select * into prior from public.pro_admin_workspace_commands where id=p_key;if found then if prior.actor_id<>auth.uid() or prior.request<>request then raise exception 'PRO_REQUEST_CONFLICT';end if;return prior.organization_id;end if;
 if exists(select 1 from public.pro_memberships where user_id=p_user and 'owner'=any(roles) and status='active') then raise exception 'PRO_WORKSPACE_EXISTS';end if;
 insert into public.pro_organizations(name,created_by,request_key) values(btrim(p_name),p_user,p_key) returning id into org;
 insert into public.pro_memberships(organization_id,user_id,roles) values(org,p_user,array['owner']);
 perform public.admin_pro_set_license(org,0,'active',p_expires,p_limit,p_reason,p_key);
 insert into public.pro_admin_workspace_commands(id,actor_id,request,organization_id) values(p_key,auth.uid(),request,org);return org;
end $$;
revoke all on function public.pro_set_case_archived(uuid,uuid,integer,boolean,uuid),public.pro_browse_case_directory(uuid,text,integer,boolean),public.pro_duplicate_cases(uuid,text),public.pro_subscription_details(uuid),public.pro_request_renewal(uuid,uuid),public.admin_pro_renewals(uuid),public.admin_pro_resolve_renewal(uuid),public.admin_pro_lookup_phone(uuid,text),public.admin_pro_provision_phone(uuid,uuid,text,timestamptz,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.pro_set_case_archived(uuid,uuid,integer,boolean,uuid),public.pro_browse_case_directory(uuid,text,integer,boolean),public.pro_duplicate_cases(uuid,text),public.pro_subscription_details(uuid),public.pro_request_renewal(uuid,uuid),public.admin_pro_renewals(uuid),public.admin_pro_resolve_renewal(uuid) to authenticated;
grant execute on function public.admin_pro_lookup_phone(uuid,text),public.admin_pro_provision_phone(uuid,uuid,text,timestamptz,integer,text,uuid) to service_role;
create function pro_private.guard_unarchived_plan() returns trigger language plpgsql security definer set search_path='' as $$
declare archived timestamptz;
begin
 select archived_at into archived from public.pro_real_cases where id=new.record_id and organization_id=new.organization_id for update;
 if archived is not null then raise exception 'PRO_CASE_ARCHIVED';end if;return new;
end $$;
create trigger pro_draft_archive_guard before insert on public.pro_server_plan_drafts for each row execute function pro_private.guard_unarchived_plan();
create trigger pro_snapshot_archive_guard before insert on public.pro_real_plans for each row execute function pro_private.guard_unarchived_plan();
revoke all on function pro_private.guard_unarchived_plan() from public,anon,authenticated,service_role;
create or replace function public.pro_service_status() returns text language sql stable security definer set search_path='' as $$select 'operations-v2'::text$$;
create or replace function public.admin_pro_overview(p_search text default '',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=btrim(coalesce(p_search,'')); rows jsonb; total bigint;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 or length(q)>100 then raise exception 'PRO_INVALID_REQUEST'; end if;
 select count(*) into total from public.pro_organizations o where q='' or strpos(lower(o.name),lower(q))>0 or o.id::text=q
 or exists(select 1 from public.pro_memberships m join auth.users u on u.id=m.user_id where m.organization_id=o.id and strpos(coalesce(u.phone,''),q)>0);
 select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') into rows from (
 select o.id,o.name,o.status,o.created_at,l.status as license_status,l.expires_at,l.case_limit,coalesce(l.revision,0) as revision,
 (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'phone',u.phone,'roles',m.roles,'phone_confirmed',u.phone_confirmed_at is not null)),'[]') from public.pro_memberships m join auth.users u on u.id=m.user_id where m.organization_id=o.id and m.status='active') as members,
 (select count(*) from public.pro_real_cases c where c.organization_id=o.id) as case_count,
 (select count(*) from public.pro_real_plans p where p.organization_id=o.id) as plan_count,
 (select max(p.expires_at) from public.pro_pilot_access p join public.pro_memberships m on m.user_id=p.user_id where m.organization_id=o.id and m.status='active') as pilot_expires_at
 from public.pro_organizations o left join public.pro_workspace_licenses l on l.organization_id=o.id
 where q='' or strpos(lower(o.name),lower(q))>0 or o.id::text=q
 or exists(select 1 from public.pro_memberships m join auth.users u on u.id=m.user_id where m.organization_id=o.id and strpos(coalesce(u.phone,''),q)>0)
 order by o.created_at desc,o.id limit 25 offset p_page*25) x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page);
end $$;

commit;
