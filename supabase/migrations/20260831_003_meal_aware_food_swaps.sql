-- Behtan MVP — meal-aware food swaps
-- Add contextual swap metadata without changing nutrition targets or templates.

begin;

alter table public.food_items
  add column if not exists swap_allowed_meals text[] not null
    default array['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack']::text[],
  add column if not exists swap_group text not null default '',
  add column if not exists swap_priority smallint not null default 100;

alter table public.food_items
  drop constraint if exists food_items_swap_allowed_meals_check;

alter table public.food_items
  add constraint food_items_swap_allowed_meals_check check (
    cardinality(swap_allowed_meals) > 0
    and swap_allowed_meals <@ array['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack']::text[]
  );

alter table public.food_items
  drop constraint if exists food_items_swap_priority_check;

alter table public.food_items
  add constraint food_items_swap_priority_check check (swap_priority >= 0);


-- Meal-aware food-swap metadata. This controls only what the swap UI may
-- OFFER in each meal; specialist meal templates can still use foods outside
-- these contexts when clinically/dietarily necessary.
update public.food_items as f
set
  swap_allowed_meals = v.allowed_meals,
  swap_group = v.swap_group,
  swap_priority = v.swap_priority
from (values
  ('egg_white', array['breakfast', 'dinner']::text[], 'egg', 20),
  ('egg_whole', array['breakfast', 'dinner']::text[], 'egg', 10),
  ('chicken_breast', array['lunch', 'afternoon_snack', 'dinner']::text[], 'main_protein', 10),
  ('grilled_fish', array['lunch', 'dinner']::text[], 'main_protein', 20),
  ('lean_beef', array['lunch', 'dinner']::text[], 'main_protein', 30),
  ('ground_beef_lean', array['lunch', 'dinner']::text[], 'main_protein', 35),
  ('whey_protein', array['morning_snack', 'afternoon_snack', 'night_snack']::text[], 'protein_supplement', 10),
  ('pea_protein', array['morning_snack', 'afternoon_snack', 'night_snack']::text[], 'protein_supplement', 20),
  ('soy_chunks', array['lunch', 'dinner']::text[], 'plant_protein', 20),
  ('lentils_cooked', array['breakfast', 'lunch', 'dinner']::text[], 'plant_protein', 10),
  ('brown_rice_cooked', array['lunch', 'dinner']::text[], 'grain_starch', 20),
  ('white_rice_cooked', array['lunch', 'dinner']::text[], 'grain_starch', 10),
  ('quinoa_cooked', array['lunch', 'dinner']::text[], 'grain_starch', 30),
  ('oats_dry', array['breakfast', 'morning_snack', 'afternoon_snack']::text[], 'breakfast_cereal', 10),
  ('whole_grain_toast', array['breakfast', 'morning_snack', 'afternoon_snack', 'dinner', 'night_snack']::text[], 'bread', 20),
  ('sangak_bread', array['breakfast', 'lunch', 'dinner']::text[], 'bread', 10),
  ('boiled_potato', array['lunch', 'afternoon_snack', 'dinner']::text[], 'potato_starch', 20),
  ('mixed_salad', array['lunch', 'dinner']::text[], 'vegetable', 20),
  ('fresh_cucumber_tomato', array['breakfast', 'lunch', 'dinner']::text[], 'vegetable', 10),
  ('steamed_vegetables', array['lunch', 'dinner']::text[], 'vegetable', 20),
  ('spinach_borani', array['lunch', 'dinner']::text[], 'vegetable', 30),
  ('olive_oil', array['lunch', 'dinner']::text[], 'oil', 10),
  ('walnut', array['breakfast', 'morning_snack', 'afternoon_snack', 'night_snack']::text[], 'nuts', 10),
  ('mixed_nuts', array['breakfast', 'morning_snack', 'afternoon_snack', 'night_snack']::text[], 'nuts', 20),
  ('avocado_half', array['breakfast', 'morning_snack', 'afternoon_snack', 'dinner']::text[], 'plant_fat', 20),
  ('low_fat_cheese', array['breakfast', 'morning_snack', 'dinner']::text[], 'dairy', 10),
  ('low_fat_milk', array['breakfast', 'morning_snack', 'afternoon_snack', 'night_snack']::text[], 'dairy', 20),
  ('low_fat_yogurt', array['lunch', 'afternoon_snack', 'dinner', 'night_snack']::text[], 'dairy', 15),
  ('apple', array['breakfast', 'morning_snack', 'afternoon_snack', 'night_snack']::text[], 'fruit', 10),
  ('banana', array['breakfast', 'morning_snack', 'afternoon_snack', 'night_snack']::text[], 'fruit', 20),
  ('medjool_date', array['breakfast', 'morning_snack', 'afternoon_snack', 'night_snack']::text[], 'fruit', 30)
) as v(id, allowed_meals, swap_group, swap_priority)
where f.id = v.id;


-- Every active food must be explicitly classified before the app consumes it.
do $$
begin
  if exists (
    select 1 from public.food_items
    where is_active and (swap_group = '' or cardinality(swap_allowed_meals) = 0)
  ) then
    raise exception 'Meal-aware swap metadata is incomplete for one or more active foods.';
  end if;
end $$;

commit;
