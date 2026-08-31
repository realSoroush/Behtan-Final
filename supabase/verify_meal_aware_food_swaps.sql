-- Expected: all checks return 0 bad rows.
select count(*) as bad_active_foods
from public.food_items
where is_active and (swap_group = '' or cardinality(swap_allowed_meals) = 0);

-- Breakfast bread candidates should include toast, but not rice/potato.
select id, name, swap_group, swap_priority, swap_allowed_meals
from public.food_items
where id in ('sangak_bread','whole_grain_toast','white_rice_cooked','boiled_potato')
order by id;
