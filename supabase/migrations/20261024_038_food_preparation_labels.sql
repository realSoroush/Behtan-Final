begin;
-- Metadata only. Nutrient values and portion bounds remain unchanged.
alter table public.food_items add column preparation_state text not null default 'ready' check(preparation_state in('ready','cooked','dry','raw'));
update public.food_items set preparation_state='cooked' where id in('chicken_breast','grilled_fish','lean_beef','ground_beef_lean','lentils_cooked','brown_rice_cooked','white_rice_cooked','quinoa_cooked','boiled_potato','steamed_vegetables');
update public.food_items set preparation_state='dry' where id in('soy_chunks','oats_dry','whey_protein','pea_protein');
comment on column public.food_items.preparation_state is 'The weight basis of existing nutrients; never a cooking conversion factor. Mixed menu components are weighed individually; no water-weight conversion is inferred.';
commit;
