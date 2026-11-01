begin;
-- Additive migration: no changes to Auth phone numbers, subscriptions or saved plans.
create table public.pro_specialist_profiles (
 user_id uuid primary key references auth.users(id),
 full_name text not null check(char_length(btrim(full_name)) between 3 and 100),
 contact_phone text not null check(contact_phone ~ '^\+?[0-9]{8,15}$'),
 profession text not null check(profession in('fitness_coach','bodybuilding_coach','nutritionist','physician','sports_medicine','physiotherapist','gym_manager','clinic_manager')),
 province text not null check(char_length(btrim(province)) between 1 and 80),
 city text not null check(char_length(btrim(city)) between 1 and 80),
 address text not null check(char_length(btrim(address)) between 5 and 500),
 updated_at timestamptz not null default now()
);
alter table public.pro_specialist_profiles enable row level security;
revoke all on public.pro_specialist_profiles from public,anon,authenticated,service_role;
grant select on public.pro_specialist_profiles to authenticated;
create policy pro_specialist_self_read on public.pro_specialist_profiles for select to authenticated
 using(user_id=(select auth.uid()));

create function public.pro_specialist_profile() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=pro_private.verified_actor();p public.pro_specialist_profiles;a public.pro_applications;
begin
 if actor is null then raise exception 'PRO_AUTH_REQUIRED' using errcode='42501';end if;
 select * into p from public.pro_specialist_profiles where user_id=actor;
 if found then return (to_jsonb(p)-'user_id'-'updated_at')||jsonb_build_object('completed',true);end if;
 -- Existing registration details are a suggestion only, never a fabricated address.
 select * into a from public.pro_applications where user_id=actor;
 return jsonb_build_object('completed',false,'full_name',coalesce(a.name,''),
 'contact_phone',(select phone from auth.users where id=actor),
 'profession',case a.field when 'training' then 'fitness_coach' when 'nutrition' then 'nutritionist' when 'clinic' then 'clinic_manager' when 'gym' then 'gym_manager' else '' end,
 'province','','city','','address','');
end $$;

create function public.pro_save_specialist_profile(p_full_name text,p_contact_phone text,p_profession text,p_province text,p_city text,p_address text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=pro_private.verified_actor();phone text;full_name text:=btrim(p_full_name);province text:=btrim(p_province);city text:=btrim(p_city);address text:=btrim(p_address);
begin
 if actor is null then raise exception 'PRO_AUTH_REQUIRED' using errcode='42501';end if;
 if p_contact_phone is null or char_length(p_contact_phone)>30 then raise exception 'PRO_INVALID_PROFILE';end if;
 phone:=regexp_replace(translate(p_contact_phone,'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'),'[[:space:]()\-]','','g');
 if left(phone,2)='00' then phone:='+'||substr(phone,3);end if;
 if full_name is null or char_length(full_name) not between 3 and 100
 or phone !~ '^\+?[0-9]{8,15}$'
 or p_profession is null or p_profession not in('fitness_coach','bodybuilding_coach','nutritionist','physician','sports_medicine','physiotherapist','gym_manager','clinic_manager')
 or province is null or char_length(province) not between 1 and 80
 or city is null or char_length(city) not between 1 and 80
 or address is null or char_length(address) not between 5 and 500 then raise exception 'PRO_INVALID_PROFILE';end if;
 insert into public.pro_specialist_profiles(user_id,full_name,contact_phone,profession,province,city,address)
 values(actor,full_name,phone,p_profession,province,city,address)
 on conflict(user_id) do update set full_name=excluded.full_name,contact_phone=excluded.contact_phone,
 profession=excluded.profession,province=excluded.province,city=excluded.city,address=excluded.address,updated_at=now();
 return public.pro_specialist_profile();
end $$;

-- Resolve the actual author of an accessible saved document, never the current viewer.
-- No arbitrary user-id lookup and no broad organization-wide address directory.
create function public.pro_plan_specialist(p_org uuid,p_kind text,p_plan uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=pro_private.verified_actor();author_id uuid;case_id uuid;identity jsonb;
begin
 if actor is null then raise exception 'PRO_AUTH_REQUIRED' using errcode='42501';end if;
 if p_kind='nutrition' then
  select record_id,recorded_by into case_id,author_id from public.pro_real_plans where id=p_plan and organization_id=p_org;
 elsif p_kind='training' then
  select t.record_id,coalesce(a.approved_by,t.actor_id) into case_id,author_id from public.pro_training_plans t
   left join public.pro_training_approvals a on a.plan_id=t.id and a.organization_id=t.organization_id
   where t.id=p_plan and t.organization_id=p_org;
 elsif p_kind='authored' then
  select record_id,recorded_by into case_id,author_id from public.pro_authored_plans where id=p_plan and organization_id=p_org;
 else raise exception 'PRO_INVALID_REQUEST';end if;
 if case_id is null or not pro_private.real_case_editor(p_org,case_id) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501';end if;
 select to_jsonb(p)-'user_id'-'updated_at' into identity from public.pro_specialist_profiles p where user_id=author_id;
 return identity;
end $$;
revoke all on function public.pro_specialist_profile(),public.pro_save_specialist_profile(text,text,text,text,text,text),public.pro_plan_specialist(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.pro_specialist_profile(),public.pro_save_specialist_profile(text,text,text,text,text,text),public.pro_plan_specialist(uuid,text,uuid) to authenticated;
comment on table public.pro_specialist_profiles is 'Professional contact details supplied by each OTP-verified user. Does not certify credentials or modify the Auth phone.';
notify pgrst,'reload schema';
commit;
