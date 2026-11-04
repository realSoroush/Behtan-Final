-- Make the existing bread-free breakfast available to the general planner.
-- Ingredient-level allergy and dietary filters still apply.
update public.meal_templates
set restricted_diet_only = false
where id = 'bk_restricted_lentil_potato'
  and restricted_diet_only;
