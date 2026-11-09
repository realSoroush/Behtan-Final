begin;
-- Commercial expiry is authoritative. A free registration is one calendar month.
create or replace function pro_private.self_workspace(p_user uuid,p_code text,p_months integer,p_trial boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.pro_applications;l public.pro_workspace_licenses;org uuid;until_date timestamptz;
begin
 select * into a from public.pro_applications where user_id=p_user for update;
 if not found then raise exception 'APPLICATION_REQUIRED';end if;
 if p_trial is null or p_code is null or p_months is null or
  (p_trial and(p_code<>'trial' or p_months<>0)) or
  (not p_trial and(p_code not in('nutrition','training','combined') or p_months not in(1,3,6,12))) then raise exception 'INVALID_PERIOD';end if;
 org:=a.organization_id;
 if p_trial and(org is not null or a.trial_claimed) then raise exception 'TRIAL_USED';end if;
 if org is not null then
  perform 1 from public.pro_organizations where id=org for update;
  select * into l from public.pro_workspace_licenses where organization_id=org for update;
 end if;
 if not p_trial and a.offer is not null and a.offer<>'trial' and a.offer<>p_code and l.status='active' and l.expires_at>now() then raise exception 'PRO_PLAN_CHANGE_REQUIRES_SUPPORT';end if;
 until_date:=case when p_trial then now()+interval '1 month'
  when a.offer='trial' or l.organization_id is null then now()+make_interval(months=>p_months)
  else greatest(l.expires_at,now())+make_interval(months=>p_months) end;
 if org is null then
  insert into public.pro_organizations(name,created_by,request_key)values(a.name,p_user,gen_random_uuid())returning id into org;
  insert into public.pro_memberships(organization_id,user_id,roles)values(org,p_user,array['owner','practitioner']);
  update public.pro_applications set organization_id=org where user_id=p_user;
 end if;
 insert into public.pro_workspace_licenses(organization_id,status,expires_at,case_limit,updated_by)
 values(org,'active',until_date,case when p_trial then 3 else 100000 end,p_user)
 on conflict(organization_id)do update set status='active',expires_at=excluded.expires_at,case_limit=excluded.case_limit,revision=public.pro_workspace_licenses.revision+1,updated_by=p_user,updated_at=now();
 insert into public.pro_pilot_access(user_id,expires_at)values(p_user,until_date)
 on conflict(user_id)do update set expires_at=case
  when a.offer='trial' and public.pro_pilot_access.expires_at=l.expires_at then greatest(excluded.expires_at,coalesce((select max(w.expires_at)from public.pro_workspace_licenses w join public.pro_memberships m on m.organization_id=w.organization_id where m.user_id=p_user and m.status='active' and w.status='active'),excluded.expires_at))
  else greatest(public.pro_pilot_access.expires_at,excluded.expires_at)end;
 insert into public.pro_module_access(organization_id,nutrition,training,updated_by)
 values(org,p_code in('nutrition','combined','trial'),p_code in('training','combined','trial'),p_user)
 on conflict(organization_id)do update set nutrition=excluded.nutrition,training=excluded.training,revision=public.pro_module_access.revision+1,updated_by=p_user;
 update public.pro_applications set offer=p_code,months=case when p_trial then 1 else p_months end,trial_claimed=trial_claimed or p_trial where user_id=p_user;
 return org;
end $$;
revoke all on function pro_private.self_workspace(uuid,text,integer,boolean)from public,anon,authenticated,service_role;

-- Narrow repair: exact legacy auto-grant signature, never an administrator's term.
-- Keep a system audit; do not attribute an automated repair to a user's action.
create table pro_private.workspace_term_repairs(
 organization_id uuid primary key references public.pro_organizations(id),before_data jsonb not null,after_data jsonb not null,reason text not null,created_at timestamptz not null default now());
alter table pro_private.workspace_term_repairs enable row level security;
revoke all on pro_private.workspace_term_repairs from public,anon,authenticated,service_role;
create trigger workspace_term_repairs_immutable before update or delete on pro_private.workspace_term_repairs for each row execute function pro_private.immutable_audit();
with candidates as (
 select l.organization_id,to_jsonb(l) before_data,o.created_at+interval '1 month' new_expiry
 from public.pro_workspace_licenses l join public.pro_applications a on a.organization_id=l.organization_id
 join public.pro_organizations o on o.id=l.organization_id
 where a.offer='trial' and a.trial_claimed and o.created_by=a.user_id and l.case_limit=3
 and l.expires_at=o.created_at+interval '10 years'
 and not exists(select 1 from public.pro_license_audit h where h.organization_id=l.organization_id)
),changed as (
 update public.pro_workspace_licenses l set expires_at=c.new_expiry,revision=l.revision+1,updated_at=now()
 from candidates c where c.organization_id=l.organization_id
 and l.expires_at=(c.before_data->>'expires_at')::timestamptz and l.revision=(c.before_data->>'revision')::integer
 returning l.organization_id,c.before_data,to_jsonb(l)after_data
)
insert into pro_private.workspace_term_repairs(organization_id,before_data,after_data,reason)
select organization_id,before_data,after_data,'055: legacy automatic free term -> one month from original registration' from changed;
update public.pro_applications set months=1 where offer='trial' and trial_claimed and months=0;
-- Align only pilot rows with the exact old automatic signature. Preserve other/manual grants.
update public.pro_pilot_access p set expires_at=coalesce((select max(l.expires_at)from public.pro_workspace_licenses l join public.pro_memberships m on m.organization_id=l.organization_id where m.user_id=p.user_id and m.status='active' and l.status='active'),p.expires_at)
from public.pro_applications a join public.pro_organizations o on o.id=a.organization_id
where p.user_id=a.user_id and o.created_by=a.user_id and p.expires_at=o.created_at+interval '10 years'
and not exists(select 1 from public.pro_memberships m where m.user_id=p.user_id and m.status='active' and not exists(select 1 from public.pro_workspace_licenses l where l.organization_id=m.organization_id))
and not exists(select 1 from public.pro_license_audit h where h.organization_id=a.organization_id);

create or replace function public.pro_workspace_status(p_org uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s jsonb;a public.pro_applications;label text;
begin
 s:=public.pro_workspace_status_before_modules(p_org);
 select * into a from public.pro_applications where organization_id=p_org;
 label:=case when exists(select 1 from public.pro_license_audit where organization_id=p_org)then 'اعتبار تنظیم‌شده توسط مدیر'
 when a.offer='trial'then 'آزمایشی رایگان · یک ماه · ۳ پرونده'
 when a.offer in('nutrition','training','combined')then coalesce((select title from public.pro_offers where code=a.offer),'اشتراک پرو')||' · '||a.months::text||' ماه'
 else 'اعتبار فضای کاری' end;
 return s||jsonb_build_object('plan_label',label,'modules',jsonb_build_object('nutrition',pro_private.module_enabled(p_org,'nutrition'),'training',pro_private.module_enabled(p_org,'training'),'body',true));
end $$;
revoke all on function public.pro_workspace_status(uuid)from public,anon,authenticated,service_role;
grant execute on function public.pro_workspace_status(uuid)to authenticated;

create or replace function public.pro_browse_case_directory(p_org uuid,p_search text default '',p_page integer default 0,p_archived boolean default false)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=btrim(translate(coalesce(p_search,''),'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'));phone_q text;total bigint;rows jsonb;
begin
 if not pro_private.has_role(p_org,array['owner','practitioner'])then raise exception 'PRO_ACCESS_DENIED'using errcode='42501';end if;
 if p_page is null or p_page<0 or p_page>100000 or length(q)>100 or p_archived is null then raise exception 'PRO_INVALID_REQUEST';end if;
 if q ~ '^[+0-9()[:space:]-]+$'then
  phone_q:=regexp_replace(q,'[^0-9]','','g');
  phone_q:=case when phone_q like '0098%'then substr(phone_q,3)when phone_q like '09%'then '98'||substr(phone_q,2)else phone_q end;
  if phone_q=''then phone_q:=null;end if;
 end if;
 select count(*)into total from public.pro_real_cases c where c.organization_id=p_org and pro_private.real_case_editor(p_org,c.id)and(c.archived_at is not null)=p_archived
 and(q=''or strpos(lower(translate(c.display_name,'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789')),lower(q))>0 or(case when phone_q is not null then strpos(pro_private.normalized_case_phone(c.phone),phone_q)>0 else strpos(c.phone,q)>0 end));
 select coalesce(jsonb_agg(x order by x.updated_at desc,x.id),'[]')into rows from(
 select c.id,c.display_name,c.phone,c.revision,c.updated_at,c.archived_at,c.archive_revision from public.pro_real_cases c
 where c.organization_id=p_org and pro_private.real_case_editor(p_org,c.id)and(c.archived_at is not null)=p_archived
 and(q=''or strpos(lower(translate(c.display_name,'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789')),lower(q))>0 or(case when phone_q is not null then strpos(pro_private.normalized_case_phone(c.phone),phone_q)>0 else strpos(c.phone,q)>0 end))
 order by c.updated_at desc,c.id limit 25 offset p_page*25)x;
 return jsonb_build_object('rows',rows,'total',total);
end $$;
revoke all on function public.pro_browse_case_directory(uuid,text,integer,boolean)from public,anon,authenticated,service_role;
grant execute on function public.pro_browse_case_directory(uuid,text,integer,boolean)to authenticated;

-- Optional date for new authored training; historical snapshots without it remain valid.
create or replace function pro_private.valid_authored_content(p jsonb,kind text) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb; m jsonb;l jsonb;f jsonb;t jsonb;k text;menus jsonb;groups text[];last_group text;gid text;dose numeric;
begin
 if kind not in('training','nutrition') then return false;end if;
 if p ? 'startDate' and(kind<>'training' or jsonb_typeof(p->'startDate') is distinct from 'string' or p->>'startDate' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or to_char((p->>'startDate')::date,'YYYY-MM-DD')<>p->>'startDate')then return false;end if;
 if jsonb_typeof(p->'sections') is distinct from 'array' then return false;end if;
 for s in select value from jsonb_array_elements(p->'sections') loop
  if s ? 'menuTitle' and (jsonb_typeof(s->'menuTitle') is distinct from 'string' or length(btrim(s->>'menuTitle')) not between 1 and 100) then return false;end if;
  if s ? 'alternatives' and (kind<>'nutrition' or jsonb_typeof(s->'alternatives') is distinct from 'array' or jsonb_array_length(s->'alternatives')>4) then return false;end if;
  menus:=jsonb_build_array(jsonb_build_object('id','primary','title',s->>'title','lines',s->'lines'))||coalesce(s->'alternatives','[]'::jsonb);
  if (select count(*) from jsonb_array_elements(menus))<>(select count(distinct value->>'id') from jsonb_array_elements(menus)) then return false;end if;
  for m in select value from jsonb_array_elements(menus) loop
   if jsonb_typeof(m->'id') is distinct from 'string' or length(m->>'id') not between 1 and 80 or jsonb_typeof(m->'title') is distinct from 'string' or length(btrim(m->>'title')) not between 1 and 100
    or jsonb_typeof(m->'lines') is distinct from 'array' or jsonb_array_length(m->'lines') not between 1 and 30 then return false;end if;
   groups:=array[]::text[];last_group:=null;
   for l in select value from jsonb_array_elements(m->'lines') loop
    if jsonb_typeof(l->'name') is distinct from 'string' or length(btrim(l->>'name')) not between 1 and 300 or jsonb_typeof(l->'details') is distinct from 'string' or length(l->>'details')>2000 then return false;end if;
    if l ? 'food' then
     f:=l->'food';if kind<>'nutrition' or jsonb_typeof(f) is distinct from 'object' or jsonb_typeof(f->'grams') is distinct from 'number' or (f->>'grams')::numeric<=0 or (f->>'grams')::numeric>5000 or jsonb_typeof(f->'gramsPerUnit') is distinct from 'number' or (f->>'gramsPerUnit')::numeric<=0 then return false;end if;
     foreach k in array array['kcal','protein','carbs','fat'] loop if jsonb_typeof(f->k) is distinct from 'number' or (f->>k)::numeric<0 then return false;end if;end loop;
    end if;
    if l ? 'training' then
     t:=l->'training';gid:=t->>'group';
     if kind<>'training' or jsonb_typeof(t) is distinct from 'object' or gid is null or length(gid) not between 1 and 80 then return false;end if;
     foreach k in array array['kind','sets','reps','rest'] loop if jsonb_typeof(t->k) is distinct from 'number' or (t->>k)::numeric<>trunc((t->>k)::numeric) then return false;end if;end loop;
     if (t->>'kind')::integer not between 1 and 3 or (t->>'sets')::integer not between 1 and 20 or (t->>'rest')::integer not between 0 and 1800 then return false;end if;
     if t ? 'seconds' then
      if jsonb_typeof(t->'seconds') is distinct from 'number' or (t->>'seconds')::numeric<>trunc((t->>'seconds')::numeric) or (t->>'seconds')::numeric not between 1 and 3600 or (t->>'reps')::integer<>0 then return false;end if;
     elsif (t->>'reps')::integer not between 1 and 300 then return false;end if;
     if last_group is distinct from gid then if gid=any(groups) then return false;end if;groups:=array_append(groups,gid);last_group:=gid;end if;
     if (select count(*) from jsonb_array_elements(m->'lines') x where x->'training'->>'group'=gid)<>(t->>'kind')::integer then return false;end if;
    else last_group:=null;end if;
   end loop;
  end loop;
 end loop;return true;
exception when others then return false;
end $$;
revoke all on function pro_private.valid_authored_content(jsonb,text)from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
