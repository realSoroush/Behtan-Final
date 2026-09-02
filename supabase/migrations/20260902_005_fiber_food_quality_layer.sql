-- Behtan Fiber Guardrail + Food Quality Layer
-- Adds transparent fiber/quality metadata without changing Nutrition v2 targets.

begin;

alter table public.food_items
  add column if not exists fiber_g_per_unit numeric(10,3) not null default 0,
  add column if not exists quality_tags text[] not null default '{}',
  add column if not exists fruit_veg_grams_per_unit numeric(10,3) not null default 0,
  add column if not exists fiber_source_name text,
  add column if not exists fiber_source_url text;

alter table public.food_items drop constraint if exists food_items_fiber_nonnegative_check;
alter table public.food_items add constraint food_items_fiber_nonnegative_check
  check (fiber_g_per_unit >= 0);

alter table public.food_items drop constraint if exists food_items_fruit_veg_contribution_check;
alter table public.food_items add constraint food_items_fruit_veg_contribution_check
  check (fruit_veg_grams_per_unit >= 0 and fruit_veg_grams_per_unit <= grams_per_unit);

alter table public.food_items drop constraint if exists food_items_quality_tags_check;
alter table public.food_items add constraint food_items_quality_tags_check check (
  quality_tags <@ array[
    'whole_grain','refined_grain','legume','whole_fruit','non_starchy_vegetable',
    'starchy_vegetable','nuts_seeds','unsaturated_fat','protein_supplement','whole_food'
  ]::text[]
);

update public.food_items as f
set
  fiber_g_per_unit = v.fiber_g_per_unit,
  quality_tags = v.quality_tags,
  fruit_veg_grams_per_unit = v.fruit_veg_grams_per_unit,
  fiber_source_name = v.fiber_source_name,
  fiber_source_url = v.fiber_source_url
from (values
  ('egg_white', 0, '{}'::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('egg_whole', 0, array['whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('chicken_breast', 0, array['whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('grilled_fish', 0, array['whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('lean_beef', 0, array['whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('ground_beef_lean', 0, array['whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('whey_protein', 0, array['protein_supplement']::text[], 0, 'USDA FoodData Central / generic product profile', 'https://fdc.nal.usda.gov/'),
  ('pea_protein', 0.5, array['protein_supplement']::text[], 0, 'USDA FoodData Central / generic product profile', 'https://fdc.nal.usda.gov/'),
  ('soy_chunks', 13, array['legume']::text[], 0, 'USDA FoodData Central / textured soy profile', 'https://fdc.nal.usda.gov/'),
  ('lentils_cooked', 7.9, array['legume','whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('brown_rice_cooked', 1.8, array['whole_grain','whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('white_rice_cooked', 0.4, array['refined_grain']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('quinoa_cooked', 2.8, array['whole_grain','whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('oats_dry', 5.3, array['whole_grain','whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('whole_grain_toast', 2.0, array['whole_grain']::text[], 0, 'USDA FoodData Central / whole-wheat bread profile', 'https://fdc.nal.usda.gov/'),
  ('sangak_bread', 2.05, array['whole_grain']::text[], 0, 'Iranian carbohydrate composition study', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7695225/'),
  ('boiled_potato', 1.8, array['starchy_vegetable','whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('mixed_salad', 3.0, array['non_starchy_vegetable','whole_food']::text[], 150, 'USDA FoodData Central / Behtan composite', 'https://fdc.nal.usda.gov/'),
  ('fresh_cucumber_tomato', 1.7, array['non_starchy_vegetable','whole_food']::text[], 150, 'USDA FoodData Central / Behtan composite', 'https://fdc.nal.usda.gov/'),
  ('steamed_vegetables', 3.0, array['non_starchy_vegetable','whole_food']::text[], 100, 'USDA FoodData Central / Behtan composite', 'https://fdc.nal.usda.gov/'),
  ('spinach_borani', 2.0, array['non_starchy_vegetable']::text[], 70, 'USDA FoodData Central / Behtan recipe estimate', 'https://fdc.nal.usda.gov/'),
  ('olive_oil', 0, array['unsaturated_fat']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('walnut', 0.4, array['nuts_seeds','unsaturated_fat','whole_food']::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('mixed_nuts', 2.2, array['nuts_seeds','unsaturated_fat','whole_food']::text[], 0, 'USDA FoodData Central / mixed nuts profile', 'https://fdc.nal.usda.gov/'),
  ('avocado_half', 5.0, array['whole_fruit','unsaturated_fat','whole_food']::text[], 75, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('low_fat_cheese', 0, '{}'::text[], 0, 'USDA FoodData Central / generic dairy profile', 'https://fdc.nal.usda.gov/'),
  ('low_fat_milk', 0, '{}'::text[], 0, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('low_fat_yogurt', 0, '{}'::text[], 0, 'USDA FoodData Central / generic dairy profile', 'https://fdc.nal.usda.gov/'),
  ('apple', 3.6, array['whole_fruit','whole_food']::text[], 150, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('banana', 3.1, array['whole_fruit','whole_food']::text[], 120, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/'),
  ('medjool_date', 1.6, array['whole_fruit','whole_food']::text[], 24, 'USDA FoodData Central', 'https://fdc.nal.usda.gov/')
) as v(id, fiber_g_per_unit, quality_tags, fruit_veg_grams_per_unit, fiber_source_name, fiber_source_url)
where f.id = v.id;

-- Fail closed: active foods must have an explicit fiber source, including foods with 0 g fiber.
do $$
begin
  if exists (
    select 1 from public.food_items
    where is_active = true
      and (fiber_source_name is null or btrim(fiber_source_name) = '')
  ) then
    raise exception 'Active food item missing fiber provenance';
  end if;
end $$;

commit;
