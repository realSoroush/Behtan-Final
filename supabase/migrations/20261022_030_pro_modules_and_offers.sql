begin;
-- Additive: existing organizations retain both modules; history remains readable.
create table public.pro_module_access (
 organization_id uuid primary key references public.pro_organizations(id),
 nutrition boolean not null default true, training boolean not null default true,
 revision integer not null default 1, updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 check(nutrition or training)
);
insert into public.pro_module_access(organization_id) select id from public.pro_organizations;
create table public.pro_commercial_audit (
 id uuid primary key, actor_id uuid not null references auth.users(id), operation text not null,
 request jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create trigger pro_commercial_immutable before update or delete on public.pro_commercial_audit for each row execute function pro_private.immutable_audit();
create table public.pro_offers (
 code text primary key check(code in ('training','nutrition','combined')),
 title text not null check(char_length(btrim(title)) between 1 and 100),
 subtitle text not null check(char_length(subtitle)<=300),
 features jsonb not null, prices jsonb not null,
 active boolean not null default true, revision integer not null default 1,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
insert into public.pro_offers(code,title,subtitle,features,prices) values('training','برنامه‌سازی تمرینی','برای مربیانی که سیستم تمرین می‌خواهند','["پرونده و تاریخچه مراجعان", "ساخت و تدوین برنامه تمرینی", "آموزش تصویری حرکات موجود", "خروجی PDF فارسی", "تحلیل تصویری بدن و گزارش‌ها"]','{"1": 2490000, "3": 5990000, "6": 9490000, "12": 14990000}');
insert into public.pro_offers(code,title,subtitle,features,prices) values('nutrition','برنامه‌سازی تغذیه','با امکان تولید برنامه و تنظیم توسط متخصص','["پرونده و تاریخچه مراجعان", "موتور تغذیه مشترک به‌تن", "منوهای غذایی و مقادیر مواد", "تدوین برنامه اختصاصی و PDF فارسی", "تحلیل تصویری بدن و گزارش‌ها"]','{"1": 2790000, "3": 6490000, "6": 10490000, "12": 16490000}');
insert into public.pro_offers(code,title,subtitle,features,prices) values('combined','تمرین + تغذیه','دو ابزار مکمل، در یک فضای کاری','["تمام امکانات پنل تغذیه", "تمام امکانات پنل تمرین", "پرونده مشترک برای هر مراجع", "خروجی‌های مستقل تمرین و تغذیه", "تحلیل تصویری بدن و گزارش‌ها"]','{"1": 3990000, "3": 9490000, "6": 15490000, "12": 25990000}');

alter table public.pro_module_access enable row level security;
alter table public.pro_commercial_audit enable row level security;
alter table public.pro_offers enable row level security;
revoke all on public.pro_module_access,public.pro_commercial_audit,public.pro_offers from public,anon,authenticated,service_role;
create function pro_private.module_enabled(org uuid,kind text) returns boolean language sql stable security definer set search_path='' as $$
 select case when kind='nutrition' then coalesce((select nutrition from public.pro_module_access where organization_id=org),true)
 when kind='training' then coalesce((select training from public.pro_module_access where organization_id=org),true) else false end
$$;
revoke all on function pro_private.module_enabled(uuid,text) from public,anon,authenticated,service_role;
alter function public.pro_workspace_status(uuid) rename to pro_workspace_status_before_modules;
revoke all on function public.pro_workspace_status_before_modules(uuid) from public,anon,authenticated,service_role;
create function public.pro_workspace_status(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb;
begin
 s:=public.pro_workspace_status_before_modules(p_org);
 return s||jsonb_build_object('modules',jsonb_build_object('nutrition',pro_private.module_enabled(p_org,'nutrition'),'training',pro_private.module_enabled(p_org,'training'),'body',true));
end $$;
revoke all on function public.pro_workspace_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pro_workspace_status(uuid) to authenticated;
create function public.pro_offer_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'title',title,'subtitle',subtitle,'features',features,'prices',prices,'revision',revision) order by case code when 'training' then 1 when 'nutrition' then 2 else 3 end),'[]') from public.pro_offers where active
$$;
revoke all on function public.pro_offer_catalog() from public,anon,authenticated,service_role;
grant execute on function public.pro_offer_catalog() to anon,authenticated;
create function public.admin_pro_offers() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(o) order by code),'[]') from public.pro_offers o);
end $$;
create function public.admin_pro_save_offer(p_code text,p_expected integer,p_title text,p_subtitle text,p_features jsonb,p_prices jsonb,p_active boolean,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.pro_offers; fresh public.pro_offers; req jsonb; prior public.pro_commercial_audit; v jsonb; k text;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_key is null or p_code is null or p_expected is null or p_title is null or char_length(btrim(p_title)) not between 1 and 100 or p_subtitle is null or char_length(p_subtitle)>300 or p_active is null
 or jsonb_typeof(p_features) is distinct from 'array' or jsonb_array_length(p_features) not between 1 and 12 or jsonb_typeof(p_prices) is distinct from 'object' then raise exception 'PRO_INVALID_REQUEST';end if;
 if (select count(*) from jsonb_object_keys(p_prices))<>4 or not(p_prices ?& array['1','3','6','12']) then raise exception 'PRO_INVALID_REQUEST';end if;
 foreach k in array array['1','3','6','12'] loop
 if jsonb_typeof(p_prices->k) is distinct from 'number' or (p_prices->>k)::numeric<>trunc((p_prices->>k)::numeric) or (p_prices->>k)::numeric not between 0 and 1000000000 then raise exception 'PRO_INVALID_REQUEST';end if;
 end loop;
 for v in select value from jsonb_array_elements(p_features) loop
 if jsonb_typeof(v) is distinct from 'string' or char_length(btrim(v#>>'{}')) not between 1 and 180 then raise exception 'PRO_INVALID_REQUEST';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,30030));
 req:=jsonb_build_object('code',p_code,'expected',p_expected,'title',btrim(p_title),'subtitle',p_subtitle,'features',p_features,'prices',p_prices,'active',p_active);
 select * into old from public.pro_offers where code=p_code for update;
 if not found then raise exception 'PRO_INVALID_REQUEST';end if;
 select * into prior from public.pro_commercial_audit where id=p_key;
 if found then
 if prior.actor_id<>auth.uid() or prior.operation<>'offer' or prior.request<>req then raise exception 'PRO_REQUEST_CONFLICT';end if;
 return prior.result;end if;
 if old.revision<>p_expected then raise exception 'PRO_STALE_REVISION';end if;
 update public.pro_offers set title=btrim(p_title),subtitle=p_subtitle,features=p_features,prices=p_prices,active=p_active,revision=revision+1,updated_by=auth.uid(),updated_at=now() where code=p_code returning * into fresh;
 insert into public.pro_commercial_audit values(p_key,auth.uid(),'offer',req,to_jsonb(fresh),now());return to_jsonb(fresh);
end $$;
create function public.admin_pro_modules(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from public.pro_organizations where id=p_org) then raise exception 'PRO_ACCESS_DENIED';end if;
 return jsonb_build_object('nutrition',pro_private.module_enabled(p_org,'nutrition'),'training',pro_private.module_enabled(p_org,'training'),'revision',coalesce((select revision from public.pro_module_access where organization_id=p_org),0));
end $$;
create function public.admin_pro_set_modules(p_org uuid,p_expected integer,p_nutrition boolean,p_training boolean,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare req jsonb; prior public.pro_commercial_audit; rev integer; result jsonb;
begin
 if not public.admin_allowed() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_key is null or p_expected is null or p_nutrition is null or p_training is null or not(p_nutrition or p_training) then raise exception 'PRO_INVALID_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,30030));
 perform 1 from public.pro_organizations where id=p_org for update;
 if not found then raise exception 'PRO_ACCESS_DENIED';end if;
 req:=jsonb_build_object('org',p_org,'expected',p_expected,'nutrition',p_nutrition,'training',p_training);
 select * into prior from public.pro_commercial_audit where id=p_key;
 if found then
 if prior.actor_id<>auth.uid() or prior.operation<>'modules' or prior.request<>req then raise exception 'PRO_REQUEST_CONFLICT';end if;
 return prior.result;end if;
 select revision into rev from public.pro_module_access where organization_id=p_org;
 if coalesce(rev,0)<>p_expected then raise exception 'PRO_STALE_REVISION';end if;
 insert into public.pro_module_access(organization_id,nutrition,training,revision,updated_by) values(p_org,p_nutrition,p_training,p_expected+1,auth.uid())
 on conflict(organization_id) do update set nutrition=excluded.nutrition,training=excluded.training,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 result:=public.admin_pro_modules(p_org);
 insert into public.pro_commercial_audit values(p_key,auth.uid(),'modules',req,result,now());return result;
end $$;
-- Defense in depth at every write boundary; read-only history has no module gate.
create function pro_private.guard_module_write() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text:=tg_argv[0];
begin
 if not pro_private.module_enabled(new.organization_id,kind) then raise exception 'PRO_MODULE_DISABLED' using errcode='42501';end if;return new;
end $$;
revoke all on function pro_private.guard_module_write() from public,anon,authenticated,service_role;
create trigger pro_nutrition_module_draft before insert on public.pro_server_plan_drafts for each row execute function pro_private.guard_module_write('nutrition');
create trigger pro_nutrition_module_plan before insert on public.pro_real_plans for each row execute function pro_private.guard_module_write('nutrition');
create trigger pro_training_module_plan before insert on public.pro_training_plans for each row execute function pro_private.guard_module_write('training');
create trigger pro_training_module_approval before insert on public.pro_training_approvals for each row execute function pro_private.guard_module_write('training');
create or replace function public.pro_training_context(p_actor uuid,p_org uuid,p_record uuid,p_revision integer,p_key uuid,p_hash text) returns jsonb
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
 if not pro_private.module_enabled(p_org,'training') then raise exception 'PRO_MODULE_DISABLED';end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED';end if;
 if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED';end if;
 if c.revision<>p_revision then raise exception 'PRO_STALE_REVISION';end if;
 return jsonb_build_object('answers',c.answers);
end $$;

create function pro_private.valid_pro_intake(a jsonb) returns boolean
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
 if (a->>'height_cm')::numeric not between 30 and 300 or (a->>'weight_kg')::numeric not between 0.5 and 500
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
create or replace function pro_private.valid_real_intake(a jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 return coalesce(jsonb_typeof(a)='object' and jsonb_typeof(a->'display_name')='string'
 and char_length(btrim(a->>'display_name')) between 1 and 80
 and jsonb_typeof(a->'phone')='string' and char_length(a->>'phone')<=20
 and (a->>'phone'='' or a->>'phone' ~ '^\+?[0-9]{8,15}$')
 and pro_private.valid_pro_intake(a-'display_name'-'phone'),false);
exception when others then return false;
end $$;
revoke all on function pro_private.valid_pro_intake(jsonb) from public,anon,authenticated,service_role;
-- Specialist-authored programmes are separate from engine-generated snapshots.
create table public.pro_authored_plans (
 id uuid primary key, organization_id uuid not null references public.pro_organizations(id), record_id uuid not null,
 intake_revision integer not null, display_name text not null, kind text not null check(kind in ('nutrition','training')),
 content jsonb not null, recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 foreign key(organization_id,record_id,intake_revision) references public.pro_real_intake_versions(organization_id,record_id,revision),
 check(octet_length(content::text)<150000)
);
alter table public.pro_authored_plans enable row level security;
revoke all on public.pro_authored_plans from public,anon,authenticated,service_role;
grant select on public.pro_authored_plans to authenticated;
create policy pro_authored_read on public.pro_authored_plans for select to authenticated using(pro_private.real_case_editor(organization_id,record_id));
create trigger pro_authored_immutable before update or delete on public.pro_authored_plans for each row execute function pro_private.immutable_audit();
create function public.pro_save_authored_plan(p_org uuid,p_record uuid,p_revision integer,p_kind text,p_content jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.pro_real_cases; old public.pro_authored_plans; s jsonb; l jsonb;
begin
 if p_key is null then raise exception 'PRO_INVALID_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,30030));
 perform 1 from public.pro_organizations where id=p_org for update;
 if not pro_private.real_case_editor(p_org,p_record) then raise exception 'PRO_ACCESS_DENIED' using errcode='42501';end if;
 select * into old from public.pro_authored_plans where id=p_key;
 if found then
 if old.organization_id<>p_org or old.record_id<>p_record or old.intake_revision<>p_revision or old.kind<>p_kind or old.content<>p_content or old.recorded_by<>auth.uid() then raise exception 'PRO_REQUEST_CONFLICT';end if;return old.id;end if;
 if not pro_private.can_write_workspace(p_org) then raise exception 'PRO_SUBSCRIPTION_EXPIRED';end if;
 if not pro_private.module_enabled(p_org,p_kind) then raise exception 'PRO_MODULE_DISABLED';end if;
 select * into c from public.pro_real_cases where id=p_record and organization_id=p_org for update;
 if c.archived_at is not null then raise exception 'PRO_CASE_ARCHIVED';end if;
 if c.revision is distinct from p_revision then raise exception 'PRO_STALE_REVISION';end if;
 if p_key is null or p_content is null or jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>=150000
 or p_content->'version' is distinct from '1'::jsonb or p_content->'reviewed' is distinct from 'true'::jsonb
 or jsonb_typeof(p_content->'title') is distinct from 'string' or char_length(btrim(p_content->>'title')) not between 1 and 160
 or jsonb_typeof(p_content->'notes') is distinct from 'string' or char_length(p_content->>'notes')>4000
 or jsonb_typeof(p_content->'sections') is distinct from 'array' or jsonb_array_length(p_content->'sections') not between 1 and 28 then raise exception 'PRO_INVALID_PLAN';end if;
 for s in select value from jsonb_array_elements(p_content->'sections') loop
 if jsonb_typeof(s->'title') is distinct from 'string' or char_length(btrim(s->>'title')) not between 1 and 100
 or jsonb_typeof(s->'lines') is distinct from 'array' or jsonb_array_length(s->'lines') not between 1 and 30 then raise exception 'PRO_INVALID_PLAN';end if;
 for l in select value from jsonb_array_elements(s->'lines') loop
 if jsonb_typeof(l->'name') is distinct from 'string' or char_length(btrim(l->>'name')) not between 1 and 300
 or jsonb_typeof(l->'details') is distinct from 'string' or char_length(l->>'details')>2000 then raise exception 'PRO_INVALID_PLAN';end if;
 end loop;end loop;
 insert into public.pro_authored_plans values(p_key,p_org,p_record,p_revision,c.display_name,p_kind,p_content,auth.uid(),now());return p_key;
end $$;
revoke all on function public.admin_pro_offers(),public.admin_pro_save_offer(text,integer,text,text,jsonb,jsonb,boolean,uuid),public.admin_pro_modules(uuid),public.admin_pro_set_modules(uuid,integer,boolean,boolean,uuid),public.pro_save_authored_plan(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_pro_offers(),public.admin_pro_save_offer(text,integer,text,text,jsonb,jsonb,boolean,uuid),public.admin_pro_modules(uuid),public.admin_pro_set_modules(uuid,integer,boolean,boolean,uuid),public.pro_save_authored_plan(uuid,uuid,integer,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
