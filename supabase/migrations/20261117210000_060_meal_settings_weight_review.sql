begin;

alter table public.user_profiles add column meal_settings jsonb;
alter table public.user_profiles add constraint member_meal_settings_valid check (
 meal_settings is null or coalesce((jsonb_typeof(meal_settings) = 'object'
 and meal_settings ?& array['regularMeals','includePostWorkout']
 and meal_settings - array['regularMeals','includePostWorkout'] = '{}'::jsonb
 and jsonb_typeof(meal_settings->'regularMeals') = 'number'
 and meal_settings->>'regularMeals' in ('3','4','5','6')
 and jsonb_typeof(meal_settings->'includePostWorkout') = 'boolean'),false));

create function public.member_set_meal_settings(p_expected jsonb, p_settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p public.user_profiles%rowtype; slots text[];
begin
 select * into p from public.user_profiles where id=auth.uid() and onboarding_completed for update;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 if p.meal_settings is distinct from p_expected then raise exception 'STALE_CONTEXT'; end if;
 if p_settings is null then raise exception 'INVALID_MEAL_SETTINGS'; end if;
 slots := case p_settings->>'regularMeals'
 when '3' then array['breakfast','lunch','dinner'] when '4' then array['breakfast','lunch','afternoon_snack','dinner']
 when '5' then array['breakfast','morning_snack','lunch','afternoon_snack','dinner']
 when '6' then array['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack'] else array[]::text[] end;
 if p_settings->>'includePostWorkout' = 'true' then slots := slots || 'post_workout'::text; end if;
 if exists(select 1 from public.daily_meal_checkins where user_id=p.id
   and plan_date=(statement_timestamp() at time zone 'Asia/Tehran')::date and not meal_slot=any(slots))
 then raise exception 'MEAL_NOT_EDITABLE'; end if;
 update public.user_profiles set meal_settings=p_settings where id=p.id;
end $$;
revoke all on function public.member_set_meal_settings(jsonb,jsonb) from public,anon;
grant execute on function public.member_set_meal_settings(jsonb,jsonb) to authenticated;

-- Quotes are shared reference data, with no fabricated seed prices.
create table public.nutrition_protein_prices (
 id text primary key check(id='IR'), snapshot jsonb not null,
 check(coalesce((jsonb_typeof(snapshot)='object' and snapshot->>'region'='IR'
   and jsonb_typeof(snapshot->'quotes')='object' and snapshot ?& array['observedOn','validThrough']
   and octet_length(snapshot::text)<500000),false))
);
alter table public.nutrition_protein_prices enable row level security;
revoke all on public.nutrition_protein_prices from public,anon,authenticated;
grant select on public.nutrition_protein_prices to authenticated,service_role;
create policy nutrition_prices_read on public.nutrition_protein_prices for select to authenticated using(public.billing_has_access());
create trigger nutrition_prices_revision after insert or update or delete or truncate on public.nutrition_protein_prices
 for each statement execute function public.member_bump_catalog();

create table public.nutrition_recipe_reviews (
 food_id text primary key references public.food_items(id), fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 evidence jsonb not null check(jsonb_typeof(evidence)='object'), created_at timestamptz not null default now()
);
alter table public.nutrition_recipe_reviews enable row level security;
revoke all on public.nutrition_recipe_reviews from public,anon,authenticated;
grant select on public.nutrition_recipe_reviews to authenticated,service_role;
create policy nutrition_recipe_reviews_read on public.nutrition_recipe_reviews for select to authenticated using(public.billing_has_access());
create trigger nutrition_recipe_reviews_revision after insert or update or delete or truncate on public.nutrition_recipe_reviews
 for each statement execute function public.member_bump_catalog();

create or replace function public.nutrition_context_snapshot(p_known_revision text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  current_revision text;
  snapshot jsonb;
begin
  select revision::text into current_revision from public.member_catalog_version where id;
  if current_revision is null then
    raise exception 'NUTRITION_CONTEXT_DENIED' using errcode = '42501';
  end if;

  if current_revision = p_known_revision then
    return jsonb_build_object('schema_version', 1, 'revision', current_revision);
  end if;

  -- STABLE functions read a single MVCC snapshot for the whole call. Return one
  -- JSON value so the Data API row cap cannot truncate individual arrays.
  with active_foods as materialized (
    select f.*, r.evidence as recipe_review from public.food_items f left join public.nutrition_recipe_reviews r on r.food_id=f.id where f.is_active
  ), active_templates as materialized (
    select t.* from public.meal_templates t
    where t.is_active and not exists (
      select 1 from public.meal_template_slots s
      where s.template_id = t.id and not exists (
        select 1 from active_foods f where f.id = s.primary_food_item_id
      )
    )
  )
  select jsonb_build_object(
    'schema_version', 1,
    'revision', current_revision,
    'food_rows', coalesce((select jsonb_agg(to_jsonb(f) order by f.sort_order, f.id)
      from (select * from active_foods order by sort_order, id limit 10001) f), '[]'::jsonb),
    'substitute_rows', coalesce((select jsonb_agg(to_jsonb(s) order by s.food_item_id, s.substitute_food_item_id)
      from (select e.* from public.food_substitutes e
        join active_foods f on f.id = e.food_item_id
        join active_foods r on r.id = e.substitute_food_item_id
        where e.is_active order by e.food_item_id, e.substitute_food_item_id limit 10001) s), '[]'::jsonb),
    'template_rows', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.id)
      from (select * from active_templates order by sort_order, id limit 10001) t), '[]'::jsonb),
    'slot_rows', coalesce((select jsonb_agg(to_jsonb(s) order by s.template_id, s.position)
      from (select s.* from public.meal_template_slots s join active_templates t on t.id = s.template_id
        order by s.template_id, s.position limit 10001) s), '[]'::jsonb),
    'protein_prices', (select pp.snapshot from public.nutrition_protein_prices pp where pp.id='IR'),
    'policy_row', (select to_jsonb(p) from public.nutrition_protein_policy p where p.id = 'default')
  ) into snapshot;

  if jsonb_array_length(snapshot->'food_rows') > 10000
     or jsonb_array_length(snapshot->'substitute_rows') > 10000
     or jsonb_array_length(snapshot->'template_rows') > 10000
     or jsonb_array_length(snapshot->'slot_rows') > 10000
     or octet_length(snapshot::text) > 8000000 then
    raise exception 'NUTRITION_CONTEXT_LIMIT';
  end if;
  return snapshot;
end $$;


-- Lock the profile before any journal mutation, so evidence cannot change
-- between the server's comparison and applying its approved reference weight.
create function public.member_lock_progress_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.user_profiles where id=coalesce(new.user_id,old.user_id) for update;
 return coalesce(new,old);
end $$;
revoke all on function public.member_lock_progress_profile() from public,anon,authenticated;
create trigger member_progress_profile_lock before insert or update or delete on public.user_progress_entries
 for each row execute function public.member_lock_progress_profile();

create or replace function public.member_progress_logged() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.member_experiences(user_id,entry_date,weight_kg,adherence,hunger,difficulty)
 values(new.user_id,new.entry_date,new.weight_kg,new.adherence,new.hunger,new.difficulty);
 -- Recording a measurement no longer changes the plan's reference weight.
 return new;
end $$;

create table public.member_weight_review_history (
 user_id uuid not null references auth.users(id), review_key text not null,
 evidence jsonb not null, created_at timestamptz not null default now(), primary key(user_id,review_key)
);
alter table public.member_weight_review_history enable row level security;
revoke all on public.member_weight_review_history from public,anon,authenticated;
grant select on public.member_weight_review_history to authenticated;
create policy weight_review_history_own on public.member_weight_review_history for select to authenticated using(user_id=auth.uid());

create function public.member_weight_review_receipt(p_user uuid,p_key text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.member_weight_review_history where user_id=p_user and review_key=p_key);
$$;
revoke all on function public.member_weight_review_receipt(uuid,text) from public,anon,authenticated;
grant execute on function public.member_weight_review_receipt(uuid,text) to service_role;

create function public.member_weight_review_state(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('today',(statement_timestamp() at time zone 'Asia/Tehran')::date,
 'profile',to_jsonb(p),'entries',coalesce((select jsonb_agg(jsonb_build_object('entry_date',e.entry_date,
 'weight_kg',e.weight_kg,'adherence',e.adherence,'hunger',e.hunger,'difficulty',e.difficulty) order by e.entry_date)
 from public.user_progress_entries e where e.user_id=p_user and e.entry_date between
 (statement_timestamp() at time zone 'Asia/Tehran')::date-13 and (statement_timestamp() at time zone 'Asia/Tehran')::date),'[]'::jsonb))
 from public.user_profiles p where p.id=p_user and p.onboarding_completed;
$$;

create function public.member_apply_weight_review(p_user uuid,p_profile jsonb,p_entries jsonb,p_revision bigint,
 p_day date,p_weight numeric,p_key text,p_evidence jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare state jsonb; revision bigint;
begin
 perform 1 from public.user_profiles where id=p_user for update;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from public.member_weight_review_history where user_id=p_user and review_key=p_key) then return; end if;
 select public.member_weight_review_state(p_user) into state;
 select v.revision into revision from public.member_catalog_version v where id for share;
 if state->'profile' is distinct from p_profile or state->'entries' is distinct from p_entries
   or revision is distinct from p_revision or state->>'today' is distinct from p_day::text
 then raise exception 'STALE_CONTEXT'; end if;
 if p_weight is null or p_weight not between 25 and 350 or p_key is null or p_key !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_evidence) is distinct from 'object' then raise exception 'INVALID_REQUEST'; end if;
 insert into public.member_weight_review_history(user_id,review_key,evidence) values(p_user,p_key,p_evidence);
 update public.user_profiles set weight=p_weight where id=p_user;
end $$;
revoke all on function public.member_weight_review_state(uuid), public.member_apply_weight_review(uuid,jsonb,jsonb,bigint,date,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.member_weight_review_state(uuid), public.member_apply_weight_review(uuid,jsonb,jsonb,bigint,date,numeric,text,jsonb) to service_role;

-- Only the authenticated service uses this reference context; facts override proposals.
create function public.member_meal_week_context(p_user uuid,p_day date,p_context text) returns jsonb
language sql stable security definer set search_path='' as $$
 with proposals as (
 select s.plan_date as day,m from public.member_meal_schedule s cross join lateral jsonb_array_elements(s.plan->'meals') m
 where s.user_id=p_user and s.plan_date between p_day-6 and p_day+6 and s.context_key=p_context
 and not exists(select 1 from public.daily_meal_checkins c where c.user_id=p_user and c.plan_date=s.plan_date and c.meal_slot=m->>'slot')
 ), meals as (
 select * from proposals union all select c.plan_date,c.meal_snapshot from public.daily_meal_checkins c
 where c.user_id=p_user and c.plan_date between p_day-6 and p_day+6
 ), days as(select day,jsonb_agg(m) as meals from meals group by day)
 select coalesce(jsonb_agg(jsonb_build_object('date',day,'meals',meals) order by day),'[]'::jsonb) from days;
$$;
revoke all on function public.member_meal_week_context(uuid,date,text) from public,anon,authenticated;
grant execute on function public.member_meal_week_context(uuid,date,text) to service_role;

-- Serialize only the final weekly-cap check/write, preserving the existing
-- profile, catalog, intake, plan CAS and identical-request receipts.
create function public.member_check_weekly_caps() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.server_verified_at is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,60));
 if exists(
 with plans as (
 select s.plan_date as day,s.plan from public.member_meal_schedule s
 where s.user_id=new.user_id and s.plan_date between new.plan_date-6 and new.plan_date+6
 and s.plan_date<>new.plan_date and s.context_key=new.context_key
 union all select new.plan_date,new.plan
 ), proposals as (
 select day,m from plans cross join lateral jsonb_array_elements(plan->'meals') m
 where not exists(select 1 from public.daily_meal_checkins c where c.user_id=new.user_id and c.plan_date=day and c.meal_slot=m->>'slot')
 ), meals as (
 select * from proposals union all select c.plan_date,c.meal_snapshot from public.daily_meal_checkins c
 where c.user_id=new.user_id and c.plan_date between new.plan_date-6 and new.plan_date+6
 )
 select 1 from meals join public.meal_templates t on t.id=split_part(m->>'templateId','~',1)
 cross join generate_series(0,6) offset_days
 where day between new.plan_date-offset_days and new.plan_date-offset_days+6 and t.max_per_week is not null
 and exists(select 1 from jsonb_array_elements(new.plan->'meals') candidate
   where split_part(candidate->>'templateId','~',1)=t.id
   and not exists(select 1 from public.daily_meal_checkins c where c.user_id=new.user_id
     and c.plan_date=new.plan_date and c.meal_slot=candidate->>'slot'))
 group by offset_days,t.id,t.max_per_week having count(*)>t.max_per_week
 ) then raise exception 'WEEKLY_MEAL_LIMIT'; end if;
 return new;
end $$;
revoke all on function public.member_check_weekly_caps() from public,anon,authenticated;
create trigger member_weekly_caps before insert or update on public.member_meal_schedule
 for each row execute function public.member_check_weekly_caps();

create or replace function pro_private.valid_printed_plan(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare d jsonb; s jsonb; m jsonb; comp jsonb; key text; n integer; slots text[]; expected_slots text[]; settings jsonb;
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
 settings := p->'meal_settings';
 if settings is not null and not coalesce((jsonb_typeof(settings)='object'
   and settings ?& array['regularMeals','includePostWorkout']
   and settings-array['regularMeals','includePostWorkout']='{}'::jsonb
   and jsonb_typeof(settings->'regularMeals')='number' and settings->>'regularMeals' in ('3','4','5','6')
   and jsonb_typeof(settings->'includePostWorkout')='boolean'),false) then return false; end if;
 for d in select value from jsonb_array_elements(p->'days') loop
  if not (d ?& array['workout','slots','targets']) or not ((d->'targets') ?& array['targetCalories','proteinGrams','carbGrams','fatGrams']) or jsonb_typeof(d->'workout')<>'boolean' or jsonb_typeof(d->'slots')<>'array' then return false; end if;
  expected_slots:=case coalesce(settings->>'regularMeals','6')
   when '3' then array['breakfast','lunch','dinner'] when '4' then array['breakfast','lunch','afternoon_snack','dinner']
   when '5' then array['breakfast','morning_snack','lunch','afternoon_snack','dinner']
   else array['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack'] end;
  if (d->>'workout')::boolean and coalesce((settings->>'includePostWorkout')::boolean,true)
   then expected_slots:=expected_slots||'post_workout'::text; end if;
  n:=cardinality(expected_slots);
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
  if not (slots @> expected_slots and slots <@ expected_slots) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;


notify pgrst, 'reload schema';
commit;
