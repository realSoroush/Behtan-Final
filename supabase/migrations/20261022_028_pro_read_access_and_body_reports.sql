begin;
-- Suspension is a commercial write lock, not membership revocation.
create or replace function pro_private.workspace_visible(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pro_private.verified_actor() is not null and (exists(select 1 from public.pro_workspace_licenses where organization_id=org) or exists(select 1 from public.pro_pilot_access where user_id=pro_private.verified_actor()))
$$;
create or replace function pro_private.has_role(org uuid,requested_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select pro_private.workspace_visible(org) and exists(select 1 from public.pro_memberships m join public.pro_organizations o on o.id=m.organization_id where m.organization_id=org and m.user_id=pro_private.verified_actor() and m.status='active' and m.roles && requested_roles)
$$;
create or replace function pro_private.can_write_workspace(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pro_private.has_role(org,array['owner','practitioner']) and exists(select 1 from public.pro_organizations where id=org and status='active') and case when exists(select 1 from public.pro_workspace_licenses where organization_id=org) then exists(select 1 from public.pro_workspace_licenses where organization_id=org and status='active' and expires_at>now()) else pro_private.pilot_allowed() end
$$;
create table public.pro_body_report_jobs(
 id uuid primary key,organization_id uuid not null references public.pro_organizations(id),record_id uuid not null references public.pro_real_cases(id),actor_id uuid not null references auth.users(id),intake_revision integer not null,request_hash text not null check(length(request_hash)=64),attempts integer not null default 1 check(attempts between 1 and 3),state text not null check(state in('processing','failed','complete')),lease uuid not null,started_at timestamptz not null default now(),created_at timestamptz not null default now(),report jsonb,check((state='complete')=(report is not null))
);
create index pro_body_report_quota on public.pro_body_report_jobs(organization_id,created_at);
alter table public.pro_body_report_jobs enable row level security;
revoke all on public.pro_body_report_jobs from public,anon,authenticated,service_role;
create table public.pro_body_report_approvals(report_id uuid primary key references public.pro_body_report_jobs(id),organization_id uuid not null references public.pro_organizations(id),approved_by uuid not null references auth.users(id),approved_at timestamptz not null default now());
create table public.pro_plan_body_reports(plan_id uuid primary key references public.pro_real_plans(id),report_id uuid not null references public.pro_body_report_approvals(report_id),organization_id uuid not null references public.pro_organizations(id),attached_by uuid not null references auth.users(id),attached_at timestamptz not null default now());
alter table public.pro_body_report_approvals enable row level security;alter table public.pro_plan_body_reports enable row level security;
revoke all on public.pro_body_report_approvals,public.pro_plan_body_reports from public,anon,authenticated,service_role;
create trigger pro_body_approvals_immutable before update or delete on public.pro_body_report_approvals for each row execute function pro_private.immutable_audit();
create trigger pro_plan_body_reports_immutable before update or delete on public.pro_plan_body_reports for each row execute function pro_private.immutable_audit();
create function pro_private.guard_completed_body_report() returns trigger language plpgsql set search_path='' as $$begin
 if old.state='complete' then raise exception 'PRO_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function pro_private.guard_completed_body_report() from public,anon,authenticated,service_role;
create trigger pro_completed_body_report_immutable before update or delete on public.pro_body_report_jobs for each row execute function pro_private.guard_completed_body_report();
create function public.pro_reserve_body_report(p_actor uuid,p_org uuid,p_record uuid,p_revision integer,p_key uuid,p_hash text,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases;j public.pro_body_report_jobs;
begin
 perform pro_private.bind_plan_actor(p_actor);
 if not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED';end if;
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into c from public.pro_real_cases where organization_id=p_org and id=p_record for update;
 if not found then raise exception 'PRO_ACCESS_DENIED';end if;
 select * into j from public.pro_body_report_jobs where id=p_key;
 if found then
  if j.organization_id<>p_org or j.record_id<>p_record or j.actor_id<>p_actor or j.intake_revision<>p_revision or j.request_hash<>p_hash then raise exception 'PRO_REQUEST_CONFLICT';end if;
  if j.state='complete' then return jsonb_build_object('id',j.id,'report',j.report);end if;
  if j.attempts>=3 then raise exception 'PRO_SCAN_LIMIT';end if;
  if j.state='processing' and j.started_at>now()-interval '90 seconds' then raise exception 'PRO_SCAN_PROCESSING';end if;
 end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED';end if;
 if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED';end if;
 if c.revision<>p_revision then raise exception 'PRO_STALE_REVISION';end if;
 if p_key is null or p_lease is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'PRO_INVALID_REQUEST';end if;
 if (select count(*) from public.pro_body_report_jobs where organization_id=p_org and created_at>now()-interval '1 hour')>=20 then raise exception 'PRO_SCAN_LIMIT';end if;
 insert into public.pro_body_report_jobs(id,organization_id,record_id,actor_id,intake_revision,request_hash,state,lease) values(p_key,p_org,p_record,p_actor,p_revision,p_hash,'processing',p_lease) on conflict(id) do update set state='processing',lease=p_lease,started_at=now(),attempts=pro_body_report_jobs.attempts+1;
 return jsonb_build_object('id',p_key,'answers',c.answers);
end $$;
create function public.pro_finish_body_report(p_actor uuid,p_org uuid,p_key uuid,p_lease uuid,p_report jsonb) returns void language plpgsql security definer set search_path='' as $$
declare j public.pro_body_report_jobs;c public.pro_real_cases;
begin
 perform pro_private.bind_plan_actor(p_actor);
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into j from public.pro_body_report_jobs where id=p_key for update;
 if not found or j.organization_id<>p_org or j.actor_id<>p_actor or j.lease<>p_lease or j.state<>'processing' then raise exception 'PRO_REQUEST_CONFLICT';end if;
 if not pro_private.real_case_editor(p_org,j.record_id) then raise exception 'PRO_ACCESS_DENIED';end if;
 if p_report is not null then
  if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED';end if;
  select * into c from public.pro_real_cases where id=j.record_id and organization_id=p_org for update;
  if c.revision<>j.intake_revision then raise exception 'PRO_STALE_REVISION';end if;
  if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED';end if;
  if jsonb_typeof(p_report)<>'object' or p_report->>'version'<>'1' or octet_length(p_report::text)>32000 then raise exception 'PRO_INVALID_REQUEST';end if;
 end if;
 update public.pro_body_report_jobs set state=case when p_report is null then 'failed' else 'complete' end,report=p_report where id=p_key;
end $$;
create function public.pro_body_reports(p_org uuid,p_record uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED';end if;
 return(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select j.id,j.intake_revision,j.created_at,j.report,a.approved_at from public.pro_body_report_jobs j left join public.pro_body_report_approvals a on a.report_id=j.id where j.organization_id=p_org and j.record_id=p_record and j.state='complete' order by j.created_at desc,j.id limit 30)x);
end $$;
create function public.pro_approve_body_report(p_org uuid,p_report uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.pro_body_report_jobs;c public.pro_real_cases;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into j from public.pro_body_report_jobs where id=p_report and organization_id=p_org and state='complete';
 if not found or not pro_private.real_case_editor(p_org,j.record_id) then raise exception 'PRO_ACCESS_DENIED';end if;
 if exists(select 1 from public.pro_body_report_approvals where report_id=p_report) then return;end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED';end if;
 select * into c from public.pro_real_cases where id=j.record_id for update;
 if c.revision<>j.intake_revision then raise exception 'PRO_STALE_REVISION';end if;
 if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED';end if;
 insert into public.pro_body_report_approvals(report_id,organization_id,approved_by) values(p_report,p_org,auth.uid());
end $$;
create function public.pro_attach_body_report(p_org uuid,p_plan uuid,p_report uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.pro_real_plans;j public.pro_body_report_jobs;prior uuid;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into p from public.pro_real_plans where id=p_plan and organization_id=p_org;
 if not found or not pro_private.real_case_editor(p_org,p.record_id) then raise exception 'PRO_ACCESS_DENIED';end if;
 select report_id into prior from public.pro_plan_body_reports where plan_id=p_plan;
 if found then if prior<>p_report then raise exception 'PRO_REQUEST_CONFLICT';end if;return;end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED';end if;
 select * into j from public.pro_body_report_jobs where id=p_report and organization_id=p_org and record_id=p.record_id and intake_revision=p.intake_revision and state='complete';
 if not found or not exists(select 1 from public.pro_body_report_approvals where report_id=p_report) then raise exception 'PRO_SCAN_REVIEW_REQUIRED';end if;
 if exists(select 1 from public.pro_real_cases where id=p.record_id and archived_at is not null) then raise exception 'PRO_CASE_ARCHIVED';end if;
 insert into public.pro_plan_body_reports(plan_id,report_id,organization_id,attached_by) values(p_plan,p_report,p_org,auth.uid());
end $$;
create function public.pro_plan_body_report(p_org uuid,p_plan uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.pro_real_plans;
begin
 select * into p from public.pro_real_plans where id=p_plan and organization_id=p_org;
 if not found or not pro_private.real_case_editor(p_org,p.record_id) then raise exception 'PRO_ACCESS_DENIED';end if;
 return(select j.report from public.pro_plan_body_reports a join public.pro_body_report_jobs j on j.id=a.report_id where a.plan_id=p_plan and a.organization_id=p_org);
end $$;
revoke all on function public.pro_reserve_body_report(uuid,uuid,uuid,integer,uuid,text,uuid),public.pro_finish_body_report(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_reserve_body_report(uuid,uuid,uuid,integer,uuid,text,uuid),public.pro_finish_body_report(uuid,uuid,uuid,uuid,jsonb) to service_role;
revoke all on function public.pro_body_reports(uuid,uuid),public.pro_approve_body_report(uuid,uuid),public.pro_attach_body_report(uuid,uuid,uuid),public.pro_plan_body_report(uuid,uuid) from public,anon;
grant execute on function public.pro_body_reports(uuid,uuid),public.pro_approve_body_report(uuid,uuid),public.pro_attach_body_report(uuid,uuid,uuid),public.pro_plan_body_report(uuid,uuid) to authenticated;
alter table public.pro_failure_events drop constraint pro_failure_events_operation_check;
alter table public.pro_failure_events add constraint pro_failure_events_operation_check check(operation in ('generate','save','scan'));
create or replace function public.pro_report_failure(p_id uuid,p_actor uuid,p_org uuid,p_operation text,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pro_private.bind_plan_actor(p_actor);
 if not pro_private.has_role(p_org,array['owner','practitioner']) then return; end if;
 if p_id is null or p_operation is null or p_operation not in ('generate','save','scan') or p_code is null or p_code !~ '^PRO_[A-Z_]{1,60}$' then raise exception 'PRO_INVALID_REQUEST'; end if;
 -- Store codes/identifiers only, never health answers, notes, phone, tokens or raw exceptions.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,26026));
 if (select count(*) from public.pro_failure_events where actor_id=p_actor and created_at>now()-interval '1 hour')>=100 then return; end if;
 insert into public.pro_failure_events(id,organization_id,actor_id,operation,error_code) values(p_id,p_org,p_actor,p_operation,p_code) on conflict(id) do nothing;
end $$;

commit;
