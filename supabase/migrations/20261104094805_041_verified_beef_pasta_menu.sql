begin;

-- USDA FNS CACFP, Spaghetti and Meat Sauce (2019), 25-serving column.
-- Approximately 11 lb cooked / 25 servings = 200 g per reference unit.
-- Keep the dish together so scaling does not change the recipe's proportions.
insert into public.food_items (
  id, name, role, emoji, unit_label, preparation_state,
  grams_per_unit, kcal_per_unit, protein_per_unit, carbs_per_unit, fat_per_unit, fiber_g_per_unit,
  allergy_flags, excluded_for_vegetarian, swap_allowed_meals, swap_group,
  portion_min_units, portion_typical_units, portion_soft_max_units, portion_hard_max_units, portion_step,
  source_name, source_url, fiber_source_name, fiber_source_url, sort_order
) values (
  'whole_wheat_beef_pasta_cooked', 'ماکارونی سبوس‌دار با گوشت چرخ‌کرده', 'protein', '🍝', 'گرم', 'cooked',
  200, 270, 21, 26, 9, 5,
  array['gluten'], array['vegan','lacto_ovo','pescatarian','raw'], array['lunch'], 'whole_wheat_beef_pasta',
  1, 1.5, 1.75, 2, 0.25,
  'USDA FNS CACFP Standardized Recipe, 2019, 25-serving batch',
  'https://theicn.org/cnrb/pdfs/cacfp/Spaghetti_and_Meat_Sauce_25-50_%282%29_F.pdf',
  'USDA FNS CACFP Standardized Recipe, 2019, 25-serving batch',
  'https://theicn.org/cnrb/pdfs/cacfp/Spaghetti_and_Meat_Sauce_25-50_%282%29_F.pdf',
  240
) on conflict (id) do nothing;

insert into public.meal_templates (id, slot, display_name, sort_order)
values ('ln_whole_wheat_beef_pasta', 'lunch', 'ماکارونی سبوس‌دار با گوشت چرخ‌کرده', 240)
on conflict (id) do nothing;

insert into public.meal_template_slots (template_id, position, role, primary_food_item_id)
values ('ln_whole_wheat_beef_pasta', 0, 'protein', 'whole_wheat_beef_pasta_cooked')
on conflict (template_id, position) do nothing;

commit;
