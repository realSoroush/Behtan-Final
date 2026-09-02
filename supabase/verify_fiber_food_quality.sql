-- Expect one summary row and zero rows from the second query.
select
  count(*) filter (where is_active) as active_foods,
  count(*) filter (where is_active and fiber_source_name is not null) as foods_with_fiber_source,
  count(*) filter (where is_active and fiber_g_per_unit > 0) as foods_with_fiber,
  count(*) filter (where is_active and cardinality(quality_tags) > 0) as foods_with_quality_tags
from public.food_items;

select id, name, fiber_g_per_unit, quality_tags, fruit_veg_grams_per_unit, fiber_source_name
from public.food_items
where is_active = true
  and (
    fiber_g_per_unit < 0
    or fruit_veg_grams_per_unit < 0
    or fruit_veg_grams_per_unit > grams_per_unit
    or fiber_source_name is null
    or btrim(fiber_source_name) = ''
  );
