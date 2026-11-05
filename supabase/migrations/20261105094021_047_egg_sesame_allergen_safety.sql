-- Additive rollout: apply after 046, before deploying new allergen controls.
begin;
alter table public.food_items drop constraint if exists food_items_allergy_flags_check;
alter table public.food_items add constraint food_items_allergy_flags_check
  check (allergy_flags <@ array['dairy','gluten','peanut','tree_nut','soy','seafood','celery','egg','sesame']::text[]);
alter table public.food_items add column if not exists allergen_assessment jsonb not null default '{}'::jsonb;
alter table public.food_items add column if not exists allergen_assessment_source text;

-- Empty assessment means UNKNOWN, never an assertion of allergen absence.
create or replace function public.valid_food_allergen_assessment(a jsonb, source text) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
  if a is null or jsonb_typeof(a)<>'object' or octet_length(a::text)>4096 or coalesce(length(source),0)>2000 then return false; end if;
  for k,v in select key,value from jsonb_each(a) loop
    if k not in ('dairy','gluten','peanut','tree_nut','soy','seafood','celery','egg','sesame')
       or jsonb_typeof(v)<>'string' or v#>>'{}' not in ('contains','may_contain','unknown','assessed_absent') then return false; end if;
    if v#>>'{}'='assessed_absent' and nullif(btrim(source),'') is null then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function public.valid_food_allergen_assessment(jsonb,text) from public,anon;
grant execute on function public.valid_food_allergen_assessment(jsonb,text) to authenticated,service_role;
alter table public.food_items drop constraint if exists food_items_allergen_assessment_check;
alter table public.food_items add constraint food_items_allergen_assessment_check
  check (public.valid_food_allergen_assessment(allergen_assessment,allergen_assessment_source));

-- These identities are eggs themselves. Do not infer absence for composite
-- foods, breads, sauces or brands. No historical plan/checkin/PDF is rewritten.
update public.food_items set allergy_flags=array_append(allergy_flags,'egg')
 where id in ('egg_whole','egg_white') and not ('egg'=any(allergy_flags));
update public.food_items set allergen_assessment=allergen_assessment || '{"egg":"contains"}'::jsonb
 where id in ('egg_whole','egg_white') and allergen_assessment->>'egg' is distinct from 'contains';

create or replace function pro_private.valid_pro_intake(a jsonb) returns boolean
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
   if k='allergies' and v#>>'{}' not in ('dairy','gluten','peanut','tree_nut','soy','seafood','celery','egg','sesame') then return false; end if;
   if k='medical_conditions' and v#>>'{}' not in ('diabetes','kidney_disease','heart_disease','advanced_liver_disease','fatty_liver','pcos','thyroid') then return false; end if;
   if a->>'gender'='male' and v#>>'{}'='pcos' then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;


notify pgrst, 'reload schema';
commit;
