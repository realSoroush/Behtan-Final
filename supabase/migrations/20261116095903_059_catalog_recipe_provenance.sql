begin;

alter table public.food_items
  add column recipe_reference_version text,
  add column recipe_batch_yield_grams integer,
  add column recipe_batch_servings integer,
  add constraint food_items_recipe_reference_check check (
    (recipe_reference_version is null and recipe_batch_yield_grams is null and recipe_batch_servings is null)
    or (recipe_reference_version is not null
      and recipe_reference_version ~ '^[a-z0-9][a-z0-9.-]{0,63}$'
      and nullif(btrim(source_name), '') is not null
      and source_url is not null and source_url ~ '^https://[^[:space:]]+$'
      and ((recipe_batch_yield_grams is null and recipe_batch_servings is null)
        or (preparation_state = 'cooked'
          and recipe_batch_yield_grams is not null and recipe_batch_yield_grams > 0
          and recipe_batch_servings is not null and recipe_batch_servings > 0)))
  );

-- Finished batch mass reported by the USDA references, converted from
-- approximately 11 lb and 10 lb 8 oz to whole grams. Nutrients and serving
-- math are unchanged. Skip any rows that have been locally adapted.
update public.food_items f
set recipe_reference_version = v.version,
    recipe_batch_yield_grams = v.yield_grams,
    recipe_batch_servings = 25
from (values
  ('whole_wheat_beef_pasta_cooked','usda-cacfp-spaghetti-2019-v1',4990,200,270,21,26,9,5,
   'https://theicn.org/cnrb/pdfs/cacfp/Spaghetti_and_Meat_Sauce_25-50_%282%29_F.pdf'),
  ('chicken_curry_brown_rice_cooked','usda-cacfp-d55r-v1',4763,190,220.32,14.33,26.4,6.47,2.81,
   'https://theicn.org/cnrb/pdfs/cacfp/Chicken_Curry_Casserole_-_CACFP_Center_Recipe.pdf')
) as v(id,version,yield_grams,grams,kcal,protein,carbs,fat,fiber,url)
where f.id = v.id and f.preparation_state = 'cooked' and f.unit_label = 'گرم'
  and f.source_url = v.url and nullif(btrim(f.source_name), '') is not null
  and (f.grams_per_unit, f.kcal_per_unit, f.protein_per_unit, f.carbs_per_unit, f.fat_per_unit, f.fiber_g_per_unit)
    = (v.grams, v.kcal, v.protein, v.carbs, v.fat, v.fiber);

comment on column public.food_items.recipe_batch_yield_grams is
  'Approximate finished cooked mass for the reference batch, not a raw-to-cooked conversion factor.';
notify pgrst, 'reload schema';
commit;
