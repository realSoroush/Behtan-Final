-- Phase 2a: synthetic case registry + isolated intake history. No patient claims,
-- real contact details, legal consent or clinical plan generation/publication.
begin;
create table public.pro_case_records (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.pro_organizations(id),
 case_code text not null default ('CASE-'||replace(gen_random_uuid()::text,'-','')),
 mode text not null default 'sandbox' check(mode='sandbox'),
 created_by uuid not null references auth.users(id),
 request_key uuid not null,
 created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,request_key), unique(organization_id,case_code)
);
-- Explicitly separate simulated capabilities from REAL practitioner credentials.
-- A sandbox capability can never verify a professional's medical qualification.
create table public.pro_sandbox_capabilities (
 user_id uuid primary key references auth.users(id),
 expires_at timestamptz not null,
 granted_by uuid not null references auth.users(id),
 granted_at timestamptz not null default now()
);
create table public.pro_sandbox_capability_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 reviewed_by uuid not null references auth.users(id), expires_at timestamptz not null,
 action text not null check(action in ('INSERT','UPDATE','DELETE')), occurred_at timestamptz not null default now()
);
create function pro_private.audit_sandbox_capability() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  insert into public.pro_sandbox_capability_events(user_id,reviewed_by,expires_at,action) values(OLD.user_id,OLD.granted_by,OLD.expires_at,TG_OP);
  return OLD;
 end if;
 insert into public.pro_sandbox_capability_events(user_id,reviewed_by,expires_at,action) values(NEW.user_id,NEW.granted_by,NEW.expires_at,TG_OP);
 return NEW;
end $$;
create trigger pro_sandbox_capability_audit after insert or update or delete on public.pro_sandbox_capabilities for each row execute function pro_private.audit_sandbox_capability();
create table public.pro_case_assignments (
 organization_id uuid not null,
 record_id uuid not null,
 practitioner_id uuid not null,
 status text not null default 'active' check(status in ('active','revoked')),
 assigned_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(organization_id,record_id,practitioner_id),
 foreign key(organization_id,record_id) references public.pro_case_records(organization_id,id),
 foreign key(organization_id,practitioner_id) references public.pro_memberships(organization_id,user_id)
);
create index pro_case_assignments_actor_idx on public.pro_case_assignments(practitioner_id,organization_id,record_id);
create table public.pro_case_assignment_commands (
 organization_id uuid not null, request_key uuid not null, record_id uuid not null,
 practitioner_id uuid not null, active boolean not null, actor_id uuid not null references auth.users(id),
 occurred_at timestamptz not null default now(), primary key(organization_id,request_key),
 foreign key(organization_id,record_id) references public.pro_case_records(organization_id,id),
 foreign key(organization_id,practitioner_id) references public.pro_memberships(organization_id,user_id)
);
create table public.pro_case_permission_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 record_id uuid not null, purpose text not null check(purpose in ('processing','relationship','progress_sharing')),
 decision text not null check(decision in ('grant','revoke')),
 source text not null default 'synthetic_simulation' check(source='synthetic_simulation'),
 notice_version integer not null default 1 check(notice_version=1),
 expires_at timestamptz, actor_id uuid not null references auth.users(id),
 request_key uuid not null, sequence bigint not null,
 occurred_at timestamptz not null default now(),
 foreign key(organization_id,record_id) references public.pro_case_records(organization_id,id),
 unique(organization_id,request_key), unique(organization_id,record_id,id), unique(organization_id,record_id,purpose,sequence),
 check((decision='grant' and expires_at is not null) or (decision='revoke' and expires_at is null))
);
create index pro_case_permissions_latest_idx on public.pro_case_permission_events(organization_id,record_id,purpose,sequence desc);
create table public.pro_intake_revisions (
 organization_id uuid not null, record_id uuid not null, revision integer not null check(revision>0),
 schema_version integer not null default 1 check(schema_version=1),
 answers jsonb not null check(jsonb_typeof(answers)='object'),
 processing_event_id uuid not null,
 recorded_by uuid not null references auth.users(id), request_key uuid not null,
 expected_revision integer not null check(expected_revision>=0),
 recorded_at timestamptz not null default now(),
 primary key(organization_id,record_id,revision), unique(organization_id,request_key),
 foreign key(organization_id,record_id,processing_event_id) references public.pro_case_permission_events(organization_id,record_id,id),
 foreign key(organization_id,record_id) references public.pro_case_records(organization_id,id)
);
create table public.pro_case_audit_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,
 record_id uuid not null, actor_id uuid not null references auth.users(id),
 action text not null check(action in ('record_created','assignment_granted','assignment_revoked','permission_grant','permission_revoke','intake_saved')),
 occurred_at timestamptz not null default now(),
 foreign key(organization_id,record_id) references public.pro_case_records(organization_id,id)
);

create function pro_private.case_reception(org uuid,rec uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select pro_private.has_role(org,array['owner','assistant']) or (
  pro_private.has_role(org,array['practitioner']) and exists(select 1 from public.pro_case_assignments a
  where a.organization_id=org and a.record_id=rec and a.practitioner_id=pro_private.verified_actor() and a.status='active'))
$$;
create function pro_private.processing_event(org uuid,rec uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select case when e.decision='grant' and e.expires_at>now() then e.id else null end
 from public.pro_case_permission_events e where e.organization_id=org and e.record_id=rec and e.purpose='processing'
 order by e.sequence desc limit 1
$$;
create function pro_private.case_clinical(org uuid,rec uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select pro_private.has_role(org,array['practitioner'])
 and exists(select 1 from public.pro_sandbox_capabilities c where c.user_id=pro_private.verified_actor() and c.expires_at>now())
 and exists(select 1 from public.pro_case_assignments a where a.organization_id=org and a.record_id=rec
  and a.practitioner_id=pro_private.verified_actor() and a.status='active')
 and pro_private.processing_event(org,rec) is not null
$$;
-- Validate a bounded v1 intake contract. No arbitrary text, identities, images,
-- output macros or server-authority fields may be smuggled into the payload.
create function pro_private.valid_intake(a jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; born date;
begin
 if a is null or jsonb_typeof(a)<>'object' or octet_length(a::text)>4096 then return false; end if;
 if (select count(*) from jsonb_object_keys(a))<>18 then return false; end if;
 for k in select jsonb_object_keys(a) loop
  if k not in ('gender','birth_date','height_cm','weight_kg','goal','activity_level','workout_days','training_type',
   'protein_budget','vegetarian_status','allergies','medical_conditions','pregnancy_status','eating_disorder_status',
   'medications_present','injuries_present','safety_confirmed','screening_version') then return false; end if;
 end loop;
 if a->>'gender' not in ('male','female') or a->>'goal' not in ('weight_loss','weight_gain','maintenance')
 or a->>'activity_level' not in ('sedentary','lightly_active','moderate','active')
 or a->>'training_type' not in ('none','cardio','resistance','mixed')
 or a->>'protein_budget' not in ('economic','balanced','performance')
 or a->>'vegetarian_status' not in ('none','vegan','lacto_ovo','pescatarian','raw')
 or a->>'pregnancy_status' not in ('not_applicable','not_pregnant','pregnant','breastfeeding')
 or a->>'eating_disorder_status' not in ('none','history','active_or_treatment') then return false; end if;
 foreach k in array array['gender','birth_date','goal','activity_level','training_type','protein_budget','vegetarian_status','pregnancy_status','eating_disorder_status'] loop
  if jsonb_typeof(a->k)<>'string' then return false; end if;
 end loop;
 foreach k in array array['height_cm','weight_kg','workout_days','screening_version'] loop
  if jsonb_typeof(a->k)<>'number' then return false; end if;
 end loop;
 if (a->>'height_cm')::numeric not between 100 and 250 or (a->>'weight_kg')::numeric not between 30 and 300
 or (a->>'workout_days')::numeric not between 0 and 7 or (a->>'workout_days')::numeric<>trunc((a->>'workout_days')::numeric)
 or (a->>'screening_version')::numeric<>1 then return false; end if;
 if a->>'birth_date' !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
 born:=(a->>'birth_date')::date;
 -- Range sanity only; age and medical eligibility are rechecked by the shared
 -- policy before any future generation. Storing a hard-stop case is not bypass.
 if born<date '1900-01-01' or born>date '2100-01-01' then return false; end if;
 foreach k in array array['medications_present','injuries_present','safety_confirmed'] loop
  if jsonb_typeof(a->k)<>'boolean' then return false; end if;
 end loop;
 if a->'safety_confirmed'<>'true'::jsonb then return false; end if;
 if (a->>'gender'='male' and a->>'pregnancy_status'<>'not_applicable') or
    (a->>'gender'='female' and a->>'pregnancy_status'='not_applicable') then return false; end if;
 if ((a->>'workout_days')::numeric=0) <> (a->>'training_type'='none') then return false; end if;
 foreach k in array array['allergies','medical_conditions'] loop
  if jsonb_typeof(a->k)<>'array' or jsonb_array_length(a->k)>10 then return false; end if;
  for v in select value from jsonb_array_elements(a->k) loop
   if jsonb_typeof(v)<>'string' then return false; end if;
   if k='allergies' and v#>>'{}' not in ('dairy','gluten','peanut','tree_nut','soy','seafood') then return false; end if;
   if k='medical_conditions' and v#>>'{}' not in ('diabetes','kidney_disease','heart_disease','advanced_liver_disease','fatty_liver','pcos','thyroid') then return false; end if;
   if a->>'gender'='male' and v#>>'{}'='pcos' then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;

alter table public.pro_sandbox_capability_events enable row level security;
revoke all on public.pro_sandbox_capability_events from public,anon,authenticated;
grant select on public.pro_sandbox_capability_events to authenticated;
create policy pro_capability_events_self on public.pro_sandbox_capability_events for select to authenticated using(user_id=pro_private.verified_actor() and pro_private.pilot_allowed());
alter table public.pro_case_assignment_commands enable row level security;
revoke all on public.pro_case_assignment_commands from public,anon,authenticated;
alter table public.pro_case_records enable row level security;
alter table public.pro_sandbox_capabilities enable row level security;
alter table public.pro_case_assignments enable row level security;
alter table public.pro_case_permission_events enable row level security;
alter table public.pro_intake_revisions enable row level security;
alter table public.pro_case_audit_events enable row level security;
revoke all on public.pro_case_records,public.pro_sandbox_capabilities,public.pro_case_assignments,
 public.pro_case_permission_events,public.pro_intake_revisions,public.pro_case_audit_events from public,anon,authenticated;
grant select on public.pro_case_records,public.pro_sandbox_capabilities,public.pro_case_assignments,
 public.pro_case_permission_events,public.pro_intake_revisions,public.pro_case_audit_events to authenticated;
create policy pro_records_read on public.pro_case_records for select to authenticated using(pro_private.case_reception(organization_id,id));
create policy pro_capability_self on public.pro_sandbox_capabilities for select to authenticated using(user_id=pro_private.verified_actor() and pro_private.pilot_allowed());
create policy pro_assignment_read on public.pro_case_assignments for select to authenticated using(pro_private.case_reception(organization_id,record_id));
create policy pro_permission_read on public.pro_case_permission_events for select to authenticated using(pro_private.case_reception(organization_id,record_id));
create policy pro_intake_read on public.pro_intake_revisions for select to authenticated using(pro_private.case_clinical(organization_id,record_id));
create policy pro_case_audit_read on public.pro_case_audit_events for select to authenticated using(pro_private.has_role(organization_id,array['owner']));

create function public.pro_create_case(p_org uuid,p_key uuid) returns public.pro_case_records
language plpgsql security definer set search_path='' as $$
declare r public.pro_case_records; actor uuid:=pro_private.verified_actor();
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.has_role(p_org,array['owner','assistant']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if p_key is null then raise exception 'PRO_INVALID_REQUEST'; end if;
 select * into r from public.pro_case_records where organization_id=p_org and request_key=p_key;
 if found then
  if r.created_by<>actor then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return r;
 end if;
 if (select count(*) from public.pro_case_records where organization_id=p_org)>=100 then raise exception 'PRO_SANDBOX_LIMIT'; end if;
 insert into public.pro_case_records(organization_id,created_by,request_key) values(p_org,actor,p_key) returning * into r;
 insert into public.pro_case_audit_events(organization_id,record_id,actor_id,action) values(p_org,r.id,actor,'record_created');
 return r;
end $$;
create function public.pro_assign_case(p_org uuid,p_record uuid,p_practitioner uuid,p_active boolean,p_key uuid) returns void
language plpgsql security definer set search_path='' as $$
declare command public.pro_case_assignment_commands;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.has_role(p_org,array['owner']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if p_key is null or p_active is null or not exists(select 1 from public.pro_case_records where organization_id=p_org and id=p_record) then raise exception 'PRO_INVALID_REQUEST'; end if;
 select * into command from public.pro_case_assignment_commands where organization_id=p_org and request_key=p_key;
 if found then
  if command.record_id<>p_record or command.practitioner_id<>p_practitioner or command.active<>p_active or command.actor_id<>pro_private.verified_actor() then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return;
 end if;
 if p_active and not exists(select 1 from public.pro_memberships where organization_id=p_org and user_id=p_practitioner and status='active' and 'practitioner'=any(roles)) then raise exception 'PRO_INVALID_PRACTITIONER'; end if;
 insert into public.pro_case_assignment_commands(organization_id,request_key,record_id,practitioner_id,active,actor_id)
 values(p_org,p_key,p_record,p_practitioner,p_active,pro_private.verified_actor());
 insert into public.pro_case_assignments(organization_id,record_id,practitioner_id,status,assigned_by)
 values(p_org,p_record,p_practitioner,case when p_active then 'active' else 'revoked' end,pro_private.verified_actor())
 on conflict(organization_id,record_id,practitioner_id) do update set status=excluded.status,assigned_by=excluded.assigned_by,updated_at=now()
 where pro_case_assignments.status is distinct from excluded.status;
 if found then insert into public.pro_case_audit_events(organization_id,record_id,actor_id,action)
 values(p_org,p_record,pro_private.verified_actor(),case when p_active then 'assignment_granted' else 'assignment_revoked' end); end if;
end $$;
create function public.pro_simulate_case_permission(p_org uuid,p_record uuid,p_purpose text,p_decision text,p_expires timestamptz,p_key uuid)
returns public.pro_case_permission_events
language plpgsql security definer set search_path='' as $$
declare r public.pro_case_permission_events;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.has_role(p_org,array['owner']) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if p_key is null or p_purpose is null or p_decision is null or p_purpose not in ('processing','relationship','progress_sharing') or p_decision not in ('grant','revoke')
 or not exists(select 1 from public.pro_case_records where organization_id=p_org and id=p_record) then raise exception 'PRO_INVALID_REQUEST'; end if;
 select * into r from public.pro_case_permission_events where organization_id=p_org and request_key=p_key;
 if found then
  if r.record_id<>p_record or r.purpose<>p_purpose or r.decision<>p_decision or r.expires_at is distinct from p_expires or r.actor_id<>pro_private.verified_actor() then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return r; -- Old grant replay NEVER supersedes a later revocation.
 end if;
 if (p_decision='grant' and (p_expires is null or p_expires<=now() or p_expires>now()+interval '30 days'))
 or (p_decision='revoke' and p_expires is not null) then raise exception 'PRO_INVALID_EXPIRY'; end if;
 insert into public.pro_case_permission_events(organization_id,record_id,purpose,decision,expires_at,actor_id,request_key,sequence)
 values(p_org,p_record,p_purpose,p_decision,p_expires,pro_private.verified_actor(),p_key,
 (select coalesce(max(sequence),0)+1 from public.pro_case_permission_events where organization_id=p_org and record_id=p_record and purpose=p_purpose)) returning * into r;
 insert into public.pro_case_audit_events(organization_id,record_id,actor_id,action) values(p_org,p_record,pro_private.verified_actor(),'permission_'||p_decision);
 return r;
end $$;
create function public.pro_save_intake(p_org uuid,p_record uuid,p_expected integer,p_answers jsonb,p_key uuid)
returns public.pro_intake_revisions
language plpgsql security definer set search_path='' as $$
declare r public.pro_intake_revisions; latest integer; event uuid;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.case_clinical(p_org,p_record) then raise exception 'PRO_CLINICAL_ACCESS_DENIED' using errcode='42501'; end if;
 if p_key is null or p_expected is null or p_expected<0 or not pro_private.valid_intake(p_answers) then raise exception 'PRO_INVALID_INTAKE'; end if;
 -- Reject future dates, malformed/normalized dates and unsupported ages, even
 -- when posted directly to RPC. Current engine's supported age range is 18–70.
 if (p_answers->>'birth_date')::date::text<>p_answers->>'birth_date'
 or extract(year from age((now() at time zone 'UTC')::date,(p_answers->>'birth_date')::date)) not between 18 and 70 then raise exception 'PRO_INVALID_INTAKE'; end if;
 select * into r from public.pro_intake_revisions where organization_id=p_org and request_key=p_key;
 if found then
  if r.record_id<>p_record or r.expected_revision<>p_expected or r.answers<>p_answers or r.recorded_by<>pro_private.verified_actor() then raise exception 'PRO_REQUEST_CONFLICT'; end if;
  return r;
 end if;
 select coalesce(max(revision),0) into latest from public.pro_intake_revisions where organization_id=p_org and record_id=p_record;
 if latest<>p_expected then raise exception 'PRO_STALE_REVISION' using errcode='40001'; end if;
 event:=pro_private.processing_event(p_org,p_record);
 insert into public.pro_intake_revisions(organization_id,record_id,revision,answers,processing_event_id,recorded_by,request_key,expected_revision)
 values(p_org,p_record,latest+1,p_answers,event,pro_private.verified_actor(),p_key,p_expected) returning * into r;
 insert into public.pro_case_audit_events(organization_id,record_id,actor_id,action) values(p_org,p_record,pro_private.verified_actor(),'intake_saved');
 return r;
end $$;
-- Status RPC returns capability flags, never hidden health data. SELECT of
-- revisions still uses independent RLS, not these UI hints as authorization.
create function public.pro_case_permission_summary(p_org uuid,p_record uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not pro_private.case_reception(p_org,p_record) or not exists(select 1 from public.pro_case_records where organization_id=p_org and id=p_record) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
 select distinct on (purpose) id,purpose,decision,expires_at,sequence,occurred_at
 from public.pro_case_permission_events where organization_id=p_org and record_id=p_record order by purpose,sequence desc
 ) t;
 return result;
end $$;
create function public.pro_case_access(p_org uuid,p_record uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not pro_private.case_reception(p_org,p_record) or not exists(select 1 from public.pro_case_records where organization_id=p_org and id=p_record) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 return jsonb_build_object('can_edit',pro_private.case_clinical(p_org,p_record),'can_manage',pro_private.has_role(p_org,array['owner']),
 'has_processing',pro_private.processing_event(p_org,p_record) is not null);
end $$;
create trigger pro_capability_events_immutable before update or delete on public.pro_sandbox_capability_events for each row execute function pro_private.immutable_audit();
create trigger pro_assignment_commands_immutable before update or delete on public.pro_case_assignment_commands for each row execute function pro_private.immutable_audit();
create trigger pro_permission_events_immutable before update or delete on public.pro_case_permission_events for each row execute function pro_private.immutable_audit();
create trigger pro_intake_immutable before update or delete on public.pro_intake_revisions for each row execute function pro_private.immutable_audit();
create trigger pro_case_audit_immutable before update or delete on public.pro_case_audit_events for each row execute function pro_private.immutable_audit();
revoke all on function pro_private.audit_sandbox_capability() from public,anon,authenticated;
revoke all on function pro_private.case_reception(uuid,uuid),pro_private.case_clinical(uuid,uuid),pro_private.processing_event(uuid,uuid),pro_private.valid_intake(jsonb) from public,anon,authenticated;
grant execute on function pro_private.case_reception(uuid,uuid),pro_private.case_clinical(uuid,uuid) to authenticated;
revoke all on function public.pro_create_case(uuid,uuid),public.pro_assign_case(uuid,uuid,uuid,boolean,uuid),
 public.pro_simulate_case_permission(uuid,uuid,text,text,timestamptz,uuid),public.pro_save_intake(uuid,uuid,integer,jsonb,uuid),public.pro_case_access(uuid,uuid),public.pro_case_permission_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_create_case(uuid,uuid),public.pro_assign_case(uuid,uuid,uuid,boolean,uuid),
 public.pro_simulate_case_permission(uuid,uuid,text,text,timestamptz,uuid),public.pro_save_intake(uuid,uuid,integer,jsonb,uuid),public.pro_case_access(uuid,uuid),public.pro_case_permission_summary(uuid,uuid) to authenticated;
grant all on public.pro_sandbox_capability_events,public.pro_case_assignment_commands,public.pro_case_records,public.pro_sandbox_capabilities,public.pro_case_assignments,public.pro_case_permission_events,public.pro_intake_revisions,public.pro_case_audit_events to service_role;
commit;
