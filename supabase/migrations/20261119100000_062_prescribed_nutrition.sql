begin;

create table pro_private.nutrition_overrides (
 plan_id uuid primary key references public.pro_authored_plans(id),
 source_plan_id uuid references public.pro_authored_plans(id),
 before_content jsonb not null check (octet_length(before_content::text) < 150000),
 reason text not null check (char_length(btrim(reason)) between 1 and 1000)
);

create table pro_private.nutrition_deliveries (
 plan_id uuid primary key references public.pro_authored_plans(id),
 member_id uuid not null references auth.users(id) on delete cascade,
 phone text not null,
 sent_by uuid not null references auth.users(id),
 sent_at timestamptz not null default now()
);
create index nutrition_deliveries_member on pro_private.nutrition_deliveries(member_id,sent_at desc,plan_id);
alter table pro_private.nutrition_deliveries enable row level security;
alter table pro_private.nutrition_overrides enable row level security;
revoke all on pro_private.nutrition_deliveries,pro_private.nutrition_overrides from public,anon,authenticated,service_role;

create function public.pro_save_nutrition_override(
 p_org uuid,p_record uuid,p_revision integer,p_content jsonb,p_key uuid,
 p_source uuid,p_before jsonb,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare original jsonb; saved uuid; prior pro_private.nutrition_overrides;
begin
 -- Reuse the current authorization, revision, schema validation and retry protocol.
 saved := public.pro_save_authored_plan(p_org,p_record,p_revision,'nutrition',p_content,p_key);
 if p_source is not null then
   select content into original from public.pro_authored_plans
   where id=p_source and id<>saved and organization_id=p_org and record_id=p_record and kind='nutrition';
 else
   original := p_before;
 end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000
    or original is null or octet_length(original::text)>=150000
    or not pro_private.valid_authored_content(original,'nutrition')
    or (original->'sections',original->'nutritionTargets') is not distinct from (p_content->'sections',p_content->'nutritionTargets')
 then raise exception 'PRO_INVALID_PLAN'; end if;
 select * into prior from pro_private.nutrition_overrides where plan_id=saved;
 if found then
   if (prior.source_plan_id,prior.before_content,prior.reason) is distinct from (p_source,original,btrim(p_reason))
   then raise exception 'PRO_REQUEST_CONFLICT'; end if;
 else
   insert into pro_private.nutrition_overrides values(saved,p_source,original,btrim(p_reason));
 end if;
 return saved;
end $$;

create function public.pro_deliver_nutrition(p_org uuid,p_record uuid,p_plan uuid,p_phone text,p_deliver boolean)
returns void language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases; recipient uuid; phone_key text;
begin
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.real_case_editor(p_org,p_record) or not exists (
   select 1 from public.pro_authored_plans where id=p_plan and organization_id=p_org and record_id=p_record
   and kind='nutrition' and content->'reviewed'='true'::jsonb)
 then raise exception 'PRO_ACCESS_DENIED' using errcode='42501'; end if;
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

create function public.member_prescribed_nutrition(p_before timestamptz default null,p_before_id uuid default null)
returns table(id uuid,content jsonb,recorded_at timestamptz,delivered_at timestamptz)
language sql stable security definer set search_path='' as $$
 select p.id,p.content,p.recorded_at,d.sent_at
 from pro_private.nutrition_deliveries d
 join public.pro_authored_plans p on p.id=d.plan_id
 join public.pro_real_cases c on c.id=p.record_id and c.organization_id=p.organization_id
 join auth.users u on u.id=d.member_id and u.phone in (d.phone,'+'||d.phone) and u.phone_confirmed_at is not null
 where d.member_id=auth.uid() and pro_private.normalized_case_phone(c.phone)=d.phone
 and (p_before is null or (d.sent_at,p.id)<(p_before,p_before_id))
 order by d.sent_at desc,p.id desc limit 11;
$$;

create function public.pro_nutrition_override(p_org uuid,p_record uuid,p_plan uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('before',o.before_content,'reason',o.reason)
 from pro_private.nutrition_overrides o
 join public.pro_authored_plans p on p.id=o.plan_id
 where p.id=p_plan and p.organization_id=p_org and p.record_id=p_record
 and pro_private.real_case_editor(p_org,p_record);
$$;

revoke all on function public.pro_save_nutrition_override(uuid,uuid,integer,jsonb,uuid,uuid,jsonb,text),
 public.pro_deliver_nutrition(uuid,uuid,uuid,text,boolean),
 public.pro_nutrition_override(uuid,uuid,uuid),
 public.member_prescribed_nutrition(timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.pro_save_nutrition_override(uuid,uuid,integer,jsonb,uuid,uuid,jsonb,text),
 public.pro_deliver_nutrition(uuid,uuid,uuid,text,boolean),
 public.pro_nutrition_override(uuid,uuid,uuid),
 public.member_prescribed_nutrition(timestamptz,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
