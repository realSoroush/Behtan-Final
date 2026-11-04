begin;

alter table public.food_items drop constraint food_items_allergy_flags_check;
alter table public.food_items add constraint food_items_allergy_flags_check
  check (allergy_flags <@ array['dairy','gluten','peanut','tree_nut','soy','seafood','celery']::text[]);

-- The verified recipe includes celery. Preserve any other declared allergens.
update public.food_items
set allergy_flags = array_append(allergy_flags, 'celery')
where id = 'chicken_curry_brown_rice_cooked'
  and not ('celery' = any(allergy_flags));

commit;
