begin;
-- Additive: legacy saved records remain readable. New exact-contract drafts require all requested menus.
create or replace function pro_private.valid_printed_plan(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare d jsonb; s jsonb; m jsonb; comp jsonb; key text; n integer; slots text[];
begin
 if (p ? 'menu_contract' and p->>'menu_contract' is distinct from 'exact-v2') or ((p->>'requested_menus')::numeric=5 and p->>'menu_contract' is distinct from 'exact-v2') or p is null or not (p ?& array['version','requested_menus','days','notes','display_name','intake_revision','date','created_at'])
 or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>500000
 or p->'version' is distinct from '1'::jsonb
 or jsonb_typeof(p->'requested_menus') is distinct from 'number'
 or (p->>'requested_menus')::numeric<>trunc((p->>'requested_menus')::numeric)
 or (p->>'requested_menus')::integer not between 1 and 5
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
   if p->>'menu_contract'='exact-v2' and jsonb_array_length(s->'options')<>(p->>'requested_menus')::integer then return false;end if;
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

create function pro_private.valid_authored_content(p jsonb,kind text) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb; m jsonb;l jsonb;f jsonb;t jsonb;k text;menus jsonb;groups text[];last_group text;gid text;dose numeric;
begin
 if kind not in('training','nutrition') then return false;end if;
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
revoke all on function pro_private.valid_authored_content(jsonb,text) from public,anon,authenticated,service_role;
create or replace function public.pro_save_authored_plan(p_org uuid,p_record uuid,p_revision integer,p_kind text,p_content jsonb,p_key uuid) returns uuid
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
 if not pro_private.valid_authored_content(p_content,p_kind) then raise exception 'PRO_INVALID_PLAN';end if;
 insert into public.pro_authored_plans values(p_key,p_org,p_record,p_revision,c.display_name,p_kind,p_content,auth.uid(),now());return p_key;
end $$;

notify pgrst,'reload schema';
commit;
