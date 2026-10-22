begin;
-- Requires 025–028. No nutrition, auth or existing PDF tables are altered.
create table public.pro_training_plans (
 id uuid primary key, organization_id uuid not null references public.pro_organizations(id),
 record_id uuid not null references public.pro_real_cases(id), actor_id uuid not null references auth.users(id),
 intake_revision integer not null check(intake_revision>0), request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 plan jsonb not null check(jsonb_typeof(plan)='object' and octet_length(plan::text)<150000),
 created_at timestamptz not null default now()
);
create index pro_training_case_history on public.pro_training_plans(organization_id,record_id,created_at desc,id);
create index pro_training_rate on public.pro_training_plans(organization_id,created_at);
create table public.pro_training_approvals (
 plan_id uuid primary key references public.pro_training_plans(id),
 organization_id uuid not null references public.pro_organizations(id),
 approved_by uuid not null references auth.users(id),approved_at timestamptz not null default now()
);
alter table public.pro_training_plans enable row level security;
alter table public.pro_training_approvals enable row level security;
revoke all on public.pro_training_plans,public.pro_training_approvals from public,anon,authenticated,service_role;
create trigger pro_training_plan_immutable before update or delete on public.pro_training_plans for each row execute function pro_private.immutable_audit();
create trigger pro_training_approval_immutable before update or delete on public.pro_training_approvals for each row execute function pro_private.immutable_audit();
create function public.pro_training_context(p_actor uuid,p_org uuid,p_record uuid,p_revision integer,p_key uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases; prior public.pro_training_plans;
begin
 perform pro_private.bind_plan_actor(p_actor);
 select * into c from public.pro_real_cases where id=p_record and organization_id=p_org;
 if not found or not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED';end if;
 if p_key is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'PRO_INVALID_REQUEST';end if;
 select * into prior from public.pro_training_plans where id=p_key;
 if found then
  if prior.organization_id<>p_org or prior.record_id<>p_record or prior.actor_id<>p_actor or prior.intake_revision<>p_revision or prior.request_hash<>p_hash then raise exception 'PRO_REQUEST_CONFLICT';end if;
  return jsonb_build_object('id',prior.id,'plan',prior.plan);
 end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED';end if;
 if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED';end if;
 if c.revision<>p_revision then raise exception 'PRO_STALE_REVISION';end if;
 return jsonb_build_object('answers',c.answers);
end $$;
create function public.pro_stage_training(p_actor uuid,p_org uuid,p_record uuid,p_revision integer,p_key uuid,p_hash text,p_plan jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx jsonb;
begin
 perform pro_private.bind_plan_actor(p_actor);
 -- Same org lock order as intake, archive, licensing and nutrition operations.
 perform 1 from public.pro_organizations where id=p_org for update;
 perform 1 from public.pro_real_cases where id=p_record and organization_id=p_org for update;
 ctx:=public.pro_training_context(p_actor,p_org,p_record,p_revision,p_key,p_hash);
 if ctx ? 'plan' then return ctx;end if;
 if (select count(*) from public.pro_training_plans where organization_id=p_org and created_at>now()-interval '1 hour')>=60 then raise exception 'PRO_GENERATION_LIMIT';end if;
 if p_plan is null or jsonb_typeof(p_plan)<>'object' or p_plan->>'engine' is distinct from 'behtan-training-1.0' or p_plan->>'version' is distinct from '1'
 or p_plan->>'intake_revision' is distinct from p_revision::text or p_plan->>'display_name' is distinct from ctx->'answers'->>'display_name'
 or jsonb_typeof(p_plan->'weeks') is distinct from 'array' or jsonb_array_length(p_plan->'weeks')<>4 or octet_length(p_plan::text)>=150000 then raise exception 'PRO_INVALID_PLAN';end if;
 insert into public.pro_training_plans(id,organization_id,record_id,actor_id,intake_revision,request_hash,plan) values(p_key,p_org,p_record,p_actor,p_revision,p_hash,p_plan);
 return jsonb_build_object('id',p_key,'plan',p_plan);
end $$;
create function public.pro_training_history(p_org uuid,p_record uuid,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.pro_real_cases where id=p_record and organization_id=p_org) or not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED';end if;
 if p_page is null or p_page<0 or p_page>10000 then raise exception 'PRO_INVALID_REQUEST';end if;
 return jsonb_build_object('total',(select count(*) from public.pro_training_plans where organization_id=p_org and record_id=p_record),'rows',
 (select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') from(select p.id,p.intake_revision,p.created_at,p.plan,a.approved_at from public.pro_training_plans p left join public.pro_training_approvals a on a.plan_id=p.id where p.organization_id=p_org and p.record_id=p_record order by p.created_at desc,p.id limit 10 offset p_page*10)x));
end $$;
create function public.pro_approve_training(p_org uuid,p_plan uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.pro_training_plans;c public.pro_real_cases;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into p from public.pro_training_plans where id=p_plan and organization_id=p_org;
 if not found or not pro_private.real_case_editor(p_org,p.record_id) then raise exception 'PRO_ACCESS_DENIED';end if;
 if exists(select 1 from public.pro_training_approvals where plan_id=p_plan) then return;end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED';end if;
 select * into c from public.pro_real_cases where id=p.record_id and organization_id=p_org for update;
 if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED';end if;
 if c.revision<>p.intake_revision then raise exception 'PRO_STALE_REVISION';end if;
 insert into public.pro_training_approvals(plan_id,organization_id,approved_by) values(p.id,p_org,auth.uid());
end $$;
revoke all on function public.pro_training_context(uuid,uuid,uuid,integer,uuid,text),public.pro_stage_training(uuid,uuid,uuid,integer,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pro_training_context(uuid,uuid,uuid,integer,uuid,text),public.pro_stage_training(uuid,uuid,uuid,integer,uuid,text,jsonb) to service_role;
revoke all on function public.pro_training_history(uuid,uuid,integer),public.pro_approve_training(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.pro_training_history(uuid,uuid,integer),public.pro_approve_training(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
