-- Behtan MVP — verify security/RLS cleanup after 20260825_002

-- 1) Legacy table should be gone.
select to_regclass('public.food_exchanges') as legacy_food_exchanges_should_be_null;

-- 2) RLS should be enabled on every browser-facing table.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'user_profiles',
    'food_items',
    'food_substitutes',
    'meal_templates',
    'meal_template_slots'
  )
order by c.relname;

-- 3) Review final policies. User profile policies should be authenticated-only;
-- nutrition catalog policies should also be authenticated-only/select-only.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'user_profiles',
    'food_items',
    'food_substitutes',
    'meal_templates',
    'meal_template_slots'
  )
order by tablename, policyname;
