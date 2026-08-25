-- Expected canonical MVP counts after migration + seed.
select 'food_items' as entity, count(*)::int as active_count
from public.food_items where is_active = true
union all
select 'food_substitutes', count(*)::int
from public.food_substitutes where is_active = true
union all
select 'meal_templates', count(*)::int
from public.meal_templates where is_active = true
union all
select 'meal_template_slots', count(*)::int
from public.meal_template_slots;

-- Expected values:
-- food_items          31
-- food_substitutes    46
-- meal_templates      43
-- meal_template_slots 130

-- Integrity checks: every active template slot must point to an active food.
select mts.template_id, mts.position, mts.primary_food_item_id
from public.meal_template_slots mts
join public.meal_templates mt on mt.id = mts.template_id
left join public.food_items fi on fi.id = mts.primary_food_item_id and fi.is_active = true
where mt.is_active = true and fi.id is null;
-- Expected: 0 rows
