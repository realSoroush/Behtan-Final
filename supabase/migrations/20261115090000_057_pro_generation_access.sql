begin;

-- The API binds this actor only after GoTrue verifies the phone session.
create function pro_private.generation_case(p_org uuid, p_record uuid, p_revision integer)
returns public.pro_real_cases language plpgsql stable security definer set search_path='' as $$
declare c public.pro_real_cases;
begin
 select * into c from public.pro_real_cases where organization_id=p_org and id=p_record;
 if not found or not pro_private.real_case_editor(p_org,p_record) then
  raise exception 'PRO_ACCESS_DENIED' using errcode='42501';
 end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED'; end if;
 if not pro_private.module_enabled(p_org,'nutrition') then raise exception 'PRO_MODULE_DISABLED'; end if;
 if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED'; end if;
 if c.revision is distinct from p_revision then raise exception 'PRO_STALE_REVISION'; end if;
 return c;
end $$;
revoke all on function pro_private.generation_case(uuid,uuid,integer) from public,anon,authenticated,service_role;

create function public.pro_prepare_server_plan(
 p_org uuid, p_record uuid, p_revision integer, p_actor uuid, p_key uuid, p_request jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases; d public.pro_server_plan_drafts;
begin
 perform pro_private.bind_plan_actor(p_actor);
 c := pro_private.generation_case(p_org,p_record,p_revision);
 select * into d from public.pro_server_plan_drafts where organization_id=p_org and request_key=p_key;
 if found then
  if d.record_id is distinct from p_record or d.intake_revision is distinct from p_revision
   or d.recorded_by is distinct from p_actor or d.request is distinct from p_request then
   raise exception 'PRO_REQUEST_CONFLICT';
  end if;
  if d.expires_at<=now() then raise exception 'PRO_DRAFT_EXPIRED'; end if;
  return jsonb_build_object('draft',jsonb_build_object('draft_id',d.id,'plan',d.plan));
 end if;
 if (select count(*) from public.pro_server_plan_drafts where recorded_by=p_actor and created_at>now()-interval '1 hour')>=20 then
  raise exception 'PRO_GENERATION_LIMIT';
 end if;
 return jsonb_build_object('revision',c.revision,'answers',c.answers);
end $$;
revoke all on function public.pro_prepare_server_plan(uuid,uuid,integer,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pro_prepare_server_plan(uuid,uuid,integer,uuid,uuid,jsonb) to service_role;

-- Recheck under the same actor/org/record lock order as the writer. A status
-- change while the solver is running must be seen before a new draft is saved.
alter function public.pro_stage_server_plan(uuid,uuid,integer,uuid,uuid,jsonb,jsonb) set schema pro_private;
revoke all on function pro_private.pro_stage_server_plan(uuid,uuid,integer,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.pro_stage_server_plan(
 p_org uuid,p_record uuid,p_revision integer,p_actor uuid,p_key uuid,p_request jsonb,p_plan jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pro_private.bind_plan_actor(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,25));
 perform 1 from public.pro_organizations where id=p_org for update;
 perform 1 from public.pro_real_cases where organization_id=p_org and id=p_record for update;
 perform pro_private.generation_case(p_org,p_record,p_revision);
 return pro_private.pro_stage_server_plan(p_org,p_record,p_revision,p_actor,p_key,p_request,p_plan);
end $$;
revoke all on function public.pro_stage_server_plan(uuid,uuid,integer,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pro_stage_server_plan(uuid,uuid,integer,uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
