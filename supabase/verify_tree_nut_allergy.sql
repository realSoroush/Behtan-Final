-- Behtan — verification for peanut/tree-nut separation.

-- Expected:
-- walnut     -> {tree_nut}
-- mixed_nuts -> {tree_nut}
select id, name, allergy_flags
from public.food_items
where id in ('walnut', 'mixed_nuts')
order by id;

-- Expected constraint definition includes both peanut and tree_nut.
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.food_items'::regclass
  and conname = 'food_items_allergy_flags_check';

-- Expected 0: known tree-nut foods must no longer be mislabeled as peanut.
select count(*) as mislabeled_tree_nut_foods
from public.food_items
where id in ('walnut', 'mixed_nuts')
  and 'peanut' = any(allergy_flags);
