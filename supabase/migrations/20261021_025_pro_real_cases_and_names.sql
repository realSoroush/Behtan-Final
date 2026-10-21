begin;
alter table public.user_profiles add column display_name text check(display_name is null or char_length(btrim(display_name)) between 1 and 80);
-- Real clients are kept separate from all phase 1/2a synthetic data.
create table public.pro_real_cases (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.pro_organizations(id),
 assigned_to uuid not null, display_name text not null, phone text not null default '', answers jsonb not null,
 revision integer not null check(revision>0), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,assigned_to) references public.pro_memberships(organization_id,user_id)
);
create index pro_real_cases_assigned on public.pro_real_cases(assigned_to,organization_id);
create table public.pro_real_intake_versions (
 organization_id uuid not null, record_id uuid not null, revision integer not null, answers jsonb not null,
 expected_revision integer not null, request_key uuid not null, recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 primary key(organization_id,record_id,revision), unique(organization_id,request_key),
 foreign key(organization_id,record_id) references public.pro_real_cases(organization_id,id)
);
create table public.pro_real_plans (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, record_id uuid not null,
 intake_revision integer not null, plan jsonb not null, request_key uuid not null,
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 unique(organization_id,request_key),
 foreign key(organization_id,record_id,intake_revision) references public.pro_real_intake_versions(organization_id,record_id,revision)
);
create function pro_private.real_case_editor(org uuid,rec uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select pro_private.has_role(org,array['owner']) or (pro_private.has_role(org,array['practitioner']) and exists(
 select 1 from public.pro_real_cases c where c.organization_id=org and c.id=rec and c.assigned_to=pro_private.verified_actor()))
$$;
create function pro_private.valid_real_intake(a jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 return coalesce(jsonb_typeof(a)='object' and jsonb_typeof(a->'display_name')='string'
 and char_length(btrim(a->>'display_name')) between 1 and 80
 and jsonb_typeof(a->'phone')='string' and char_length(a->>'phone')<=20
 and (a->>'phone'='' or a->>'phone' ~ '^\+?[0-9]{8,15}$')
 and pro_private.valid_intake(a-'display_name'-'phone'),false);
exception when others then return false;
end $$;
alter table public.pro_real_cases enable row level security;
alter table public.pro_real_intake_versions enable row level security;
alter table public.pro_real_plans enable row level security;
revoke all on public.pro_real_cases,public.pro_real_intake_versions,public.pro_real_plans from public,anon,authenticated;
grant select on public.pro_real_cases,public.pro_real_intake_versions,public.pro_real_plans to authenticated;
create policy real_cases_read on public.pro_real_cases for select to authenticated using(pro_private.real_case_editor(organization_id,id));
create policy real_intakes_read on public.pro_real_intake_versions for select to authenticated using(pro_private.real_case_editor(organization_id,record_id));
create policy real_plans_read on public.pro_real_plans for select to authenticated using(pro_private.real_case_editor(organization_id,record_id));
create trigger real_intakes_immutable before update or delete on public.pro_real_intake_versions for each row execute function pro_private.immutable_audit();
create trigger real_plans_immutable before update or delete on public.pro_real_plans for each row execute function pro_private.immutable_audit();
create function public.pro_save_real_case(p_org uuid,p_record uuid,p_expected integer,p_answers jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=pro_private.verified_actor(); c public.pro_real_cases; v public.pro_real_intake_versions; next_rev integer;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.has_role(p_org,array['owner','practitioner']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if p_key is null or p_expected is null or p_expected<0 or not pro_private.valid_real_intake(p_answers) then raise exception 'PRO_INVALID_INTAKE'; end if;
 select * into v from public.pro_real_intake_versions where organization_id=p_org and request_key=p_key;
 if found then
  if v.recorded_by<>actor or v.answers<>p_answers or v.expected_revision<>p_expected or (p_record is not null and v.record_id<>p_record) then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  if not pro_private.real_case_editor(p_org,v.record_id) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
  return jsonb_build_object('id',v.record_id,'revision',v.revision);
 end if;
 if p_record is null then
  if p_expected<>0 then raise exception 'PRO_STALE_REVISION'; end if;
  insert into public.pro_real_cases(organization_id,assigned_to,display_name,phone,answers,revision,created_by)
  values(p_org,actor,btrim(p_answers->>'display_name'),p_answers->>'phone',p_answers,1,actor) returning * into c;
  next_rev:=1;
 else
  select * into c from public.pro_real_cases where organization_id=p_org and id=p_record for update;
  if not found or not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
  if c.revision<>p_expected then raise exception 'PRO_STALE_REVISION'; end if;
  next_rev:=c.revision+1;
  update public.pro_real_cases set display_name=btrim(p_answers->>'display_name'),phone=p_answers->>'phone',answers=p_answers,revision=next_rev,updated_at=now() where id=c.id;
 end if;
 insert into public.pro_real_intake_versions(organization_id,record_id,revision,answers,expected_revision,request_key,recorded_by)
 values(p_org,c.id,next_rev,p_answers,p_expected,p_key,actor);
 return jsonb_build_object('id',c.id,'revision',next_rev);
end $$;
-- Client-computed snapshots; these are not a server certification of nutrition.
create function pro_private.valid_printed_plan(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare d jsonb; s jsonb; m jsonb; comp jsonb; key text; n integer; slots text[];
begin
 if p is null or not (p ?& array['version','requested_menus','days','notes','display_name','intake_revision','date','created_at'])
 or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>500000
 or p->'version' is distinct from '1'::jsonb
 or jsonb_typeof(p->'requested_menus') is distinct from 'number'
 or (p->>'requested_menus')::numeric<>trunc((p->>'requested_menus')::numeric)
 or (p->>'requested_menus')::integer not between 1 and 4
 or jsonb_typeof(p->'notes') is distinct from 'string' or char_length(p->>'notes')>2000
 or jsonb_typeof(p->'display_name') is distinct from 'string' or char_length(btrim(p->>'display_name')) not between 1 and 80
 or jsonb_typeof(p->'date') is distinct from 'string' or char_length(p->>'date')<>10
 or jsonb_typeof(p->'created_at') is distinct from 'string'
 or jsonb_typeof(p->'intake_revision') is distinct from 'number'
 or (p->>'intake_revision')::numeric<1 or (p->>'intake_revision')::numeric<>trunc((p->>'intake_revision')::numeric)
 or jsonb_typeof(p->'days') is distinct from 'array' or jsonb_array_length(p->'days') not between 1 and 2
 then return false; end if;
 for d in select value from jsonb_array_elements(p->'days') loop
  if not (d ?& array['workout','slots','targets']) or not ((d->'targets') ?& array['targetCalories','proteinGrams','carbGrams','fatGrams']) or jsonb_typeof(d->'workout')<>'boolean' or jsonb_typeof(d->'slots')<>'array' then return false; end if;
  n:=case when (d->>'workout')::boolean then 7 else 6 end;
  if jsonb_array_length(d->'slots')<>n then return false; end if;
  slots:=array[]::text[];
  foreach key in array array['targetCalories','proteinGrams','carbGrams','fatGrams'] loop
   if jsonb_typeof(d->'targets'->key)<>'number' or (d->'targets'->>key)::numeric<=0 then return false; end if;
  end loop;
  for s in select value from jsonb_array_elements(d->'slots') loop
   if not (s ?& array['slot','options']) or jsonb_typeof(s->'slot') is distinct from 'string' or s->>'slot' not in ('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack','post_workout')
    or s->>'slot'=any(slots) or jsonb_typeof(s->'options')<>'array'
    or jsonb_array_length(s->'options') not between 1 and (p->>'requested_menus')::integer then return false; end if;
   slots:=array_append(slots,s->>'slot');
   for m in select value from jsonb_array_elements(s->'options') loop
    if not (m ?& array['slot','components','totalKcal','totalProtein','totalCarbs','totalFat']) or jsonb_typeof(m->'slot') is distinct from 'string' or m->>'slot'<>s->>'slot' or jsonb_typeof(m->'components')<>'array' or jsonb_array_length(m->'components') not between 1 and 20 then return false; end if;
    foreach key in array array['totalKcal','totalProtein','totalCarbs','totalFat'] loop
     if jsonb_typeof(m->key)<>'number' or (m->>key)::numeric<0 then return false; end if;
    end loop;
    for comp in select value from jsonb_array_elements(m->'components') loop
     if not (comp ?& array['foodItem','grams','units']) or not ((comp->'foodItem') ?& array['name','unitLabel']) or jsonb_typeof(comp->'foodItem'->'name')<>'string' or char_length(comp->'foodItem'->>'name')>160
       or jsonb_typeof(comp->'foodItem'->'unitLabel') is distinct from 'string' or char_length(comp->'foodItem'->>'unitLabel')>80
       or jsonb_typeof(comp->'units') is distinct from 'number' or (comp->>'units')::numeric<=0
       or jsonb_typeof(comp->'grams')<>'number' or (comp->>'grams')::numeric<=0 then return false; end if;
    end loop;
   end loop;
  end loop;
  if not (slots @> array['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack']) or ((d->>'workout')::boolean <> ('post_workout'=any(slots))) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
create function public.pro_save_real_plan(p_org uuid,p_record uuid,p_revision integer,p_plan jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases; r public.pro_real_plans; actor uuid:=pro_private.verified_actor();
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into c from public.pro_real_cases where organization_id=p_org and id=p_record for update;
 if not found or not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if p_key is null or p_revision is null or p_plan is null or not pro_private.valid_printed_plan(p_plan) then raise exception 'PRO_INVALID_PLAN'; end if;
 select * into r from public.pro_real_plans where organization_id=p_org and request_key=p_key;
 if found then
  if r.record_id<>p_record or r.intake_revision<>p_revision or r.plan<>p_plan or r.recorded_by<>actor then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return r.id;
 end if;
 if c.revision<>p_revision then raise exception 'PRO_STALE_REVISION'; end if;
 if p_plan->>'display_name'<>btrim(c.answers->>'display_name') or (p_plan->>'intake_revision')::integer<>p_revision then raise exception 'PRO_INVALID_PLAN'; end if;
 insert into public.pro_real_plans(organization_id,record_id,intake_revision,plan,request_key,recorded_by)
 values(p_org,p_record,p_revision,p_plan,p_key,actor) returning * into r;
 return r.id;
end $$;
revoke all on function pro_private.real_case_editor(uuid,uuid),pro_private.valid_real_intake(jsonb),pro_private.valid_printed_plan(jsonb) from public,anon,authenticated;
grant execute on function pro_private.real_case_editor(uuid,uuid) to authenticated;
revoke all on function public.pro_save_real_case(uuid,uuid,integer,jsonb,uuid),public.pro_save_real_plan(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pro_save_real_case(uuid,uuid,integer,jsonb,uuid),public.pro_save_real_plan(uuid,uuid,integer,jsonb,uuid) to authenticated;
grant all on public.pro_real_cases,public.pro_real_intake_versions,public.pro_real_plans to service_role;
-- Nutrition snapshots are accepted only from the server generator. The old
-- client-snapshot endpoint remains defined for internal reuse, with no API grant.
revoke all on function public.pro_save_real_plan(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
create table public.pro_server_plan_drafts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, record_id uuid not null,
 intake_revision integer not null, recorded_by uuid not null references auth.users(id),
 request_key uuid not null, request jsonb not null, plan jsonb not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '30 minutes'),
 unique(organization_id,request_key),
 foreign key(organization_id,record_id,intake_revision) references public.pro_real_intake_versions(organization_id,record_id,revision)
);
create index pro_server_plan_drafts_actor_time on public.pro_server_plan_drafts(recorded_by,created_at);
alter table public.pro_server_plan_drafts enable row level security;
revoke all on public.pro_server_plan_drafts from public,anon,authenticated,service_role;
-- No SELECT policy or direct client write. Drafts may be pruned by trusted
-- maintenance after expiry; confirmed snapshots live in pro_real_plans.
create function pro_private.bind_plan_actor(actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if actor is null then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
revoke all on function pro_private.bind_plan_actor(uuid) from public,anon,authenticated,service_role;
create function public.pro_stage_server_plan(p_org uuid,p_record uuid,p_revision integer,p_actor uuid,p_key uuid,p_request jsonb,p_plan jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases; d public.pro_server_plan_drafts;
begin
 perform pro_private.bind_plan_actor(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,25));
 perform 1 from public.pro_organizations where id=p_org for update;
 select * into c from public.pro_real_cases where organization_id=p_org and id=p_record for update;
 if not found or not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if c.revision is distinct from p_revision then raise exception 'PRO_STALE_REVISION'; end if;
 if p_key is null or p_request is null or jsonb_typeof(p_request)<>'object' or not (p_request ?& array['date','count','notes'])
 or p_plan is null or not pro_private.valid_printed_plan(p_plan)
 or p_plan->>'display_name'<>btrim(c.answers->>'display_name') or (p_plan->>'intake_revision')::integer<>p_revision
 or p_plan->>'date' is distinct from p_request->>'date'
 or p_plan->'requested_menus' is distinct from p_request->'count'
 or p_plan->>'notes' is distinct from p_request->>'notes' then raise exception 'PRO_INVALID_PLAN'; end if;
 select * into d from public.pro_server_plan_drafts where organization_id=p_org and request_key=p_key;
 if found then
  if d.record_id<>p_record or d.intake_revision<>p_revision or d.recorded_by<>p_actor or d.request<>p_request then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  if d.expires_at<=now() then raise exception 'PRO_DRAFT_EXPIRED'; end if;
  return jsonb_build_object('draft_id',d.id,'plan',d.plan);
 end if;
 if (select count(*) from public.pro_server_plan_drafts where recorded_by=p_actor and created_at>now()-interval '1 hour')>=20 then raise exception 'PRO_GENERATION_LIMIT'; end if;
 insert into public.pro_server_plan_drafts(organization_id,record_id,intake_revision,recorded_by,request_key,request,plan)
 values(p_org,p_record,p_revision,p_actor,p_key,p_request,p_plan) returning * into d;
 return jsonb_build_object('draft_id',d.id,'plan',d.plan);
end $$;
create function public.pro_publish_server_plan(p_org uuid,p_record uuid,p_revision integer,p_actor uuid,p_key uuid,p_draft uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.pro_server_plan_drafts; r public.pro_real_plans;
begin
 perform pro_private.bind_plan_actor(p_actor);
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 select * into d from public.pro_server_plan_drafts where id=p_draft and organization_id=p_org and record_id=p_record
 and intake_revision=p_revision and recorded_by=p_actor;
 if not found or p_key is null then raise exception 'PRO_INVALID_PLAN'; end if;
 -- A retry of a committed write remains successful after draft expiry/revision
 -- changes, but never after access revocation; content is the server snapshot.
 select * into r from public.pro_real_plans where organization_id=p_org and request_key=p_key;
 if found then
  if r.recorded_by<>p_actor or r.record_id<>p_record or r.intake_revision<>p_revision or r.plan<>d.plan then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return r.id;
 end if;
 if d.expires_at<=now() then raise exception 'PRO_DRAFT_EXPIRED'; end if;
 return public.pro_save_real_plan(p_org,p_record,p_revision,d.plan,p_key);
end $$;
revoke all on function public.pro_stage_server_plan(uuid,uuid,integer,uuid,uuid,jsonb,jsonb),public.pro_publish_server_plan(uuid,uuid,integer,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_stage_server_plan(uuid,uuid,integer,uuid,uuid,jsonb,jsonb),public.pro_publish_server_plan(uuid,uuid,integer,uuid,uuid,uuid) to service_role;

commit;
