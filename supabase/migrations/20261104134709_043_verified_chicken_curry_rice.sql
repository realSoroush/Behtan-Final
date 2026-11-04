begin;

-- USDA FNS D-55r, 25-serving column: about 10 lb 8 oz cooked / 25 ≈ 190 g.
-- Scale the composite serving to preserve the ingredient ratios.
insert into public.food_items (
  id, name, role, emoji, unit_label, preparation_state,
  grams_per_unit, kcal_per_unit, protein_per_unit, carbs_per_unit, fat_per_unit, fiber_g_per_unit,
  allergy_flags, excluded_for_vegetarian, swap_allowed_meals, swap_group,
  portion_min_units, portion_typical_units, portion_soft_max_units, portion_hard_max_units, portion_step,
  source_name, source_url, fiber_source_name, fiber_source_url, sort_order
) values (
  'chicken_curry_brown_rice_cooked', 'مرغ کاری با برنج قهوه‌ای', 'protein', '🍛', 'گرم', 'cooked',
  190, 220.32, 14.33, 26.4, 6.47, 2.81,
  array['dairy'], array['vegan','lacto_ovo','pescatarian','raw'], array['lunch'], 'chicken_curry_brown_rice',
  1.5, 2, 2.25, 2.5, 0.25,
  'USDA FNS D-55r Chicken Curry Casserole, 25-serving batch',
  'https://theicn.org/cnrb/pdfs/cacfp/Chicken_Curry_Casserole_-_CACFP_Center_Recipe.pdf',
  'USDA FNS D-55r Chicken Curry Casserole, 25-serving batch',
  'https://theicn.org/cnrb/pdfs/cacfp/Chicken_Curry_Casserole_-_CACFP_Center_Recipe.pdf',
  241
) on conflict (id) do nothing;

insert into public.meal_templates (id, slot, display_name, sort_order)
values ('ln_chicken_curry_brown_rice', 'lunch', 'مرغ کاری با برنج قهوه‌ای', 241)
on conflict (id) do nothing;

insert into public.meal_template_slots (template_id, position, role, primary_food_item_id)
values ('ln_chicken_curry_brown_rice', 0, 'protein', 'chicken_curry_brown_rice_cooked')
on conflict (template_id, position) do nothing;

commit;
