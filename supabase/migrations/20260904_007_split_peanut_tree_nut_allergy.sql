-- Behtan — split peanut and tree-nut allergy semantics.
-- Peanuts and tree nuts are distinct allergen categories. Existing user
-- preferences are intentionally NOT rewritten because a saved peanut allergy
-- must not be assumed to mean a tree-nut allergy (or vice versa).

begin;

alter table public.food_items
  drop constraint if exists food_items_allergy_flags_check;

alter table public.food_items
  add constraint food_items_allergy_flags_check check (
    allergy_flags <@ array['dairy','gluten','peanut','tree_nut','soy','seafood']::text[]
  );

-- These two catalog foods represent tree nuts, not peanuts.
update public.food_items
set
  allergy_flags = case
    when 'peanut' = any(allergy_flags)
      then array_replace(allergy_flags, 'peanut', 'tree_nut')
    when not ('tree_nut' = any(allergy_flags))
      then array_append(allergy_flags, 'tree_nut')
    else allergy_flags
  end,
  name = case
    when id = 'mixed_nuts' then 'آجیل خام بدون بادام‌زمینی'
    else name
  end,
  updated_at = now()
where id in ('walnut', 'mixed_nuts');

commit;
