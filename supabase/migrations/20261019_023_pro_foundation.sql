-- Behtan Professional, phase 1. Sandbox ONLY: no clinical payloads, phone numbers,
-- patient Auth identities, billing grants or SMS. Apply once in a staging project.
begin;

create table public.pro_pilot_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  granted_at timestamptz not null default now()
);
create table public.pro_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'کلینیک آزمایشی',
  mode text not null default 'sandbox' check (mode = 'sandbox'),
  status text not null default 'active' check (status in ('active','suspended')),
  created_by uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  created_at timestamptz not null default now(),
  unique (created_by, request_key)
);
-- Multiple roles allow an owner to also be a practitioner; ownership alone
-- grants reception/administration, NEVER clinical authority.
create table public.pro_memberships (
  organization_id uuid not null references public.pro_organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  roles text[] not null check (cardinality(roles) between 1 and 3 and
    roles <@ array['owner','assistant','practitioner']::text[] and array_position(roles,null) is null),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index pro_memberships_user_idx on public.pro_memberships(user_id, organization_id);
create table public.pro_practitioner_credentials (
  user_id uuid primary key references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','verified','revoked')),
  scope text not null default 'none' check (scope in ('none','nutrition')),
  expires_at timestamptz,
  reviewed_at timestamptz,
  -- Documents belong in private storage in a later phase, never in this table.
  check (status <> 'verified' or (expires_at is not null and reviewed_at is not null and scope = 'nutrition'))
);
-- Deliberately no free-text clinical fields, names, phone or Auth linkage yet.
create table public.pro_sandbox_patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pro_organizations(id) on delete restrict,
  case_code text not null default ('TEST-' || replace(gen_random_uuid()::text,'-','')),
  request_key uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_key),
  unique (organization_id, case_code)
);
create table public.pro_sandbox_assignments (
  organization_id uuid not null,
  patient_id uuid not null,
  practitioner_id uuid not null,
  status text not null default 'active' check (status in ('active','revoked')),
  primary key (organization_id, patient_id, practitioner_id),
  foreign key (organization_id, patient_id) references public.pro_sandbox_patients(organization_id,id),
  foreign key (organization_id, practitioner_id) references public.pro_memberships(organization_id,user_id)
);
create index pro_sandbox_assignments_user_idx on public.pro_sandbox_assignments(practitioner_id,organization_id);
create table public.pro_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pro_organizations(id),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('sandbox.organization_created','sandbox.patient_created')),
  subject_id uuid not null,
  occurred_at timestamptz not null default now()
);

-- Dedicated helper schema is not exposed by PostgREST. Every definer pins its
-- search_path; helpers use fully qualified relations and do not accept user IDs.
create schema if not exists pro_private;
revoke all on schema pro_private from public, anon, authenticated;
grant usage on schema pro_private to authenticated;
create function pro_private.verified_actor() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where u.id = auth.uid()
    and u.phone is not null and u.phone_confirmed_at is not null
$$;
create function pro_private.pilot_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.pro_pilot_access p
    where p.user_id = pro_private.verified_actor() and p.expires_at > now())
$$;
create function pro_private.has_role(org uuid, requested_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select pro_private.pilot_allowed() and exists (
    select 1 from public.pro_memberships m join public.pro_organizations o on o.id=m.organization_id
    where m.organization_id=org and m.user_id=pro_private.verified_actor()
      and m.status='active' and o.status='active' and m.roles && requested_roles)
$$;
create function pro_private.can_read_case(org uuid, patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select pro_private.has_role(org,array['owner','assistant']) or (
    pro_private.has_role(org,array['practitioner']) and exists (
      select 1 from public.pro_sandbox_assignments a where a.organization_id=org
      and a.patient_id=patient and a.practitioner_id=pro_private.verified_actor() and a.status='active'))
$$;

alter table public.pro_pilot_access enable row level security;
alter table public.pro_organizations enable row level security;
alter table public.pro_memberships enable row level security;
alter table public.pro_practitioner_credentials enable row level security;
alter table public.pro_sandbox_patients enable row level security;
alter table public.pro_sandbox_assignments enable row level security;
alter table public.pro_audit_events enable row level security;
-- Explicitly defeat Supabase default table grants on all new tables.
revoke all on public.pro_pilot_access, public.pro_organizations, public.pro_memberships,
  public.pro_practitioner_credentials, public.pro_sandbox_patients,
  public.pro_sandbox_assignments, public.pro_audit_events from public, anon, authenticated;
grant select on public.pro_organizations, public.pro_memberships,
  public.pro_practitioner_credentials, public.pro_sandbox_patients,
  public.pro_sandbox_assignments, public.pro_audit_events to authenticated;
create policy pro_org_read on public.pro_organizations for select to authenticated
  using (pro_private.has_role(id,array['owner','assistant','practitioner']));
create policy pro_members_read on public.pro_memberships for select to authenticated
  using (pro_private.has_role(organization_id,array['owner']) or (
    user_id=auth.uid() and pro_private.has_role(organization_id,array['assistant','practitioner'])));
create policy pro_credentials_self on public.pro_practitioner_credentials for select to authenticated
  using (user_id=pro_private.verified_actor() and pro_private.pilot_allowed());
create policy pro_case_read on public.pro_sandbox_patients for select to authenticated
  using (pro_private.can_read_case(organization_id,id));
create policy pro_assignments_read on public.pro_sandbox_assignments for select to authenticated
  using (pro_private.has_role(organization_id,array['owner']) or (
    practitioner_id=auth.uid() and pro_private.has_role(organization_id,array['practitioner'])));
create policy pro_audit_read on public.pro_audit_events for select to authenticated
  using (pro_private.has_role(organization_id,array['owner']));

create function public.pro_pilot_status() returns boolean
language sql stable security definer set search_path = '' as $$
 select pro_private.pilot_allowed()
$$;
create function public.pro_create_sandbox_organization(p_request_key uuid) returns public.pro_organizations
language plpgsql security definer set search_path = '' as $$
declare result public.pro_organizations; actor uuid := pro_private.verified_actor();
begin
  if not pro_private.pilot_allowed() then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
  if p_request_key is null then raise exception 'PRO_INVALID_REQUEST'; end if;
  -- One sandbox per invited actor; actor lock serializes concurrent retries.
  perform 1 from auth.users where id=actor for update;
  select * into result from public.pro_organizations where created_by=actor and request_key=p_request_key;
  if found then
    if not pro_private.has_role(result.id,array['owner']) then
      raise exception 'PRO_ACCESS_DENIED' using errcode='42501';
    end if;
    return result;
  end if;
  if exists(select 1 from public.pro_organizations where created_by=actor) then
    raise exception 'PRO_SANDBOX_LIMIT';
  end if;
  insert into public.pro_organizations(created_by,request_key) values(actor,p_request_key) returning * into result;
  insert into public.pro_memberships(organization_id,user_id,roles) values(result.id,actor,array['owner']);
  insert into public.pro_audit_events(organization_id,actor_id,action,subject_id)
    values(result.id,actor,'sandbox.organization_created',result.id);
  return result;
end $$;
create function public.pro_create_sandbox_patient(p_organization_id uuid,p_request_key uuid) returns public.pro_sandbox_patients
language plpgsql security definer set search_path = '' as $$
declare result public.pro_sandbox_patients; actor uuid := pro_private.verified_actor();
begin
  -- Lock the workspace before checking authorization/status. Provisioning tools
  -- must take this same lock before changing membership/assignments.
  perform 1 from public.pro_organizations where id=p_organization_id for update;
  if not pro_private.has_role(p_organization_id,array['owner','assistant']) then
    raise exception 'PRO_ACCESS_DENIED' using errcode='42501';
  end if;
  if p_request_key is null then raise exception 'PRO_INVALID_REQUEST'; end if;
  select * into result from public.pro_sandbox_patients where organization_id=p_organization_id and request_key=p_request_key;
  if found then
    if result.created_by <> actor then raise exception 'PRO_REQUEST_CONFLICT'; end if;
    return result;
  end if;
  if (select count(*) from public.pro_sandbox_patients where organization_id=p_organization_id) >= 100 then
    raise exception 'PRO_SANDBOX_LIMIT';
  end if;
  insert into public.pro_sandbox_patients(organization_id,request_key,created_by)
    values(p_organization_id,p_request_key,actor) returning * into result;
  insert into public.pro_audit_events(organization_id,actor_id,action,subject_id)
    values(p_organization_id,actor,'sandbox.patient_created',result.id);
  return result;
end $$;
-- Serialize membership changes with workspace writes and preserve an active owner.
create function pro_private.guard_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  org := case when TG_OP='DELETE' then OLD.organization_id else NEW.organization_id end;
  if TG_OP='UPDATE' and (NEW.organization_id <> OLD.organization_id or NEW.user_id <> OLD.user_id) then
    raise exception 'PRO_MEMBERSHIP_ID_IMMUTABLE';
  end if;
  perform 1 from public.pro_organizations where id=org for update;
  if TG_OP <> 'INSERT' and OLD.status='active' and 'owner'=any(OLD.roles) then
    if TG_OP='DELETE' or NEW.status <> 'active' or not ('owner'=any(NEW.roles)) then
      if not exists(select 1 from public.pro_memberships m where m.organization_id=org
        and m.user_id <> OLD.user_id and m.status='active' and 'owner'=any(m.roles)) then
        raise exception 'PRO_LAST_OWNER';
      end if;
    end if;
  end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
create trigger pro_membership_guard before insert or update or delete on public.pro_memberships
for each row execute function pro_private.guard_membership();

-- Block mutation of audit evidence even through an accidental privileged update.
create function pro_private.immutable_audit() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'PRO_IMMUTABLE_AUDIT'; end $$;
create trigger pro_audit_immutable before update or delete on public.pro_audit_events
for each row execute function pro_private.immutable_audit();

revoke all on all functions in schema pro_private from public,anon,authenticated;
grant execute on function pro_private.verified_actor(),pro_private.pilot_allowed(),
  pro_private.has_role(uuid,text[]),pro_private.can_read_case(uuid,uuid) to authenticated;
revoke all on function public.pro_pilot_status(), public.pro_create_sandbox_organization(uuid),
  public.pro_create_sandbox_patient(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_pilot_status(), public.pro_create_sandbox_organization(uuid),
  public.pro_create_sandbox_patient(uuid,uuid) to authenticated;
-- Infrastructure-only provisioning. No service credential belongs in any client.
grant all on public.pro_pilot_access,public.pro_organizations,public.pro_memberships,
  public.pro_practitioner_credentials,public.pro_sandbox_patients,
  public.pro_sandbox_assignments,public.pro_audit_events to service_role;
commit;
