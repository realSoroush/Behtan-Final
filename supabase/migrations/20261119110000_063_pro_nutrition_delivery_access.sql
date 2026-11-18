begin;

-- Opt in independently for each membership. Existing and new memberships start off.
create table pro_private.nutrition_delivery_access (
 organization_id uuid not null,
 user_id uuid not null,
 enabled boolean not null,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key (organization_id,user_id),
 foreign key (organization_id,user_id) references public.pro_memberships(organization_id,user_id) on delete cascade
);
alter table pro_private.nutrition_delivery_access enable row level security;
revoke all on pro_private.nutrition_delivery_access from public,anon,authenticated,service_role;

create function pro_private.nutrition_delivery_enabled(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select pro_private.has_role(p_org,array['owner','practitioner']) and exists(
  select 1 from pro_private.nutrition_delivery_access
  where organization_id=p_org and user_id=auth.uid() and enabled
 );
$$;
revoke all on function pro_private.nutrition_delivery_enabled(uuid) from public,anon,authenticated,service_role;

alter function public.pro_workspace_status(uuid) rename to pro_workspace_status_before_nutrition_delivery;
revoke all on function public.pro_workspace_status_before_nutrition_delivery(uuid) from public,anon,authenticated,service_role;
create function public.pro_workspace_status(p_org uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.pro_workspace_status_before_nutrition_delivery(p_org)
  || jsonb_build_object('nutrition_delivery',pro_private.nutrition_delivery_enabled(p_org));
$$;
revoke all on function public.pro_workspace_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pro_workspace_status(uuid) to authenticated;

create function public.admin_pro_nutrition_delivery_access(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.pro_organizations where id=p_org) then raise exception 'PRO_ACCESS_DENIED'; end if;
 return (
  select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'phone',u.phone,'enabled',coalesce(a.enabled,false)) order by u.phone,m.user_id),'[]'::jsonb)
  from public.pro_memberships m join auth.users u on u.id=m.user_id
  left join pro_private.nutrition_delivery_access a using (organization_id,user_id)
  where m.organization_id=p_org and m.status='active' and m.roles && array['owner','practitioner']
 );
end $$;

create function public.admin_pro_set_nutrition_delivery(p_org uuid,p_user uuid,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_enabled is null then raise exception 'PRO_INVALID_REQUEST'; end if;
 -- Serialize with delivery so a request cannot pass a concurrently removed grant.
 perform 1 from public.pro_organizations where id=p_org for update;
 perform 1 from public.pro_memberships where organization_id=p_org and user_id=p_user
  and status='active' and roles && array['owner','practitioner'] for update;
 if not found then raise exception 'PRO_ACCESS_DENIED'; end if;
 insert into pro_private.nutrition_delivery_access(organization_id,user_id,enabled,updated_by)
 values(p_org,p_user,p_enabled,auth.uid())
 on conflict(organization_id,user_id) do update
 set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now()
 where nutrition_delivery_access.enabled is distinct from excluded.enabled;
 return p_enabled;
end $$;

create or replace function public.pro_deliver_nutrition(p_org uuid,p_record uuid,p_plan uuid,p_phone text,p_deliver boolean)
returns void language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases; recipient uuid; phone_key text;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.real_case_editor(p_org,p_record) or not exists (
   select 1 from public.pro_authored_plans where id=p_plan and organization_id=p_org and record_id=p_record
   and kind='nutrition' and content->'reviewed'='true'::jsonb)
 then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
 if not pro_private.nutrition_delivery_enabled(p_org) then raise exception 'PRO_DELIVERY_DISABLED' using errcode='42501'; end if;
 if p_deliver is false then
   delete from pro_private.nutrition_deliveries where plan_id=p_plan;
   return;
 end if;
 if p_deliver is distinct from true then raise exception 'PRO_INVALID_REQUEST'; end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED'; end if;
 if not pro_private.module_enabled(p_org,'nutrition') then raise exception 'PRO_MODULE_DISABLED'; end if;
 select * into c from public.pro_real_cases where organization_id=p_org and id=p_record for update;
 if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED'; end if;
 phone_key := pro_private.normalized_case_phone(c.phone);
 if phone_key !~ '^989[0-9]{9}$' or phone_key is distinct from pro_private.normalized_case_phone(p_phone)
 then raise exception 'PRO_DELIVERY_PHONE_CHANGED'; end if;
 -- Auth stores the canonical phone. Bind delivery to an account UUID at send time.
 select case when count(*)=1 then (array_agg(u.id))[1] end into recipient
 from auth.users u where u.phone in (phone_key,'+'||phone_key) and u.phone_confirmed_at is not null;
 if recipient is null then raise exception 'PRO_DELIVERY_MEMBER_NOT_FOUND'; end if;
 insert into pro_private.nutrition_deliveries(plan_id,member_id,phone,sent_by) values(p_plan,recipient,phone_key,auth.uid())
 on conflict(plan_id) do update set member_id=excluded.member_id,phone=excluded.phone,sent_by=excluded.sent_by,sent_at=now()
 where (nutrition_deliveries.member_id,nutrition_deliveries.phone) is distinct from (excluded.member_id,excluded.phone);
end $$;

revoke all on function public.admin_pro_nutrition_delivery_access(uuid),
 public.admin_pro_set_nutrition_delivery(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.admin_pro_nutrition_delivery_access(uuid),
 public.admin_pro_set_nutrition_delivery(uuid,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
