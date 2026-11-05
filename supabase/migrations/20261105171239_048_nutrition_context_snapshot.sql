begin;

-- Preserve the subscription restrictions on the reference tables. The only
-- newly readable row is the revision, under the same subscription check.
grant select (id, revision) on public.member_catalog_version to authenticated;
create policy nutrition_context_revision_read on public.member_catalog_version
  for select to authenticated using (public.billing_has_access());

grant select on public.food_items, public.food_substitutes, public.meal_templates,
  public.meal_template_slots, public.nutrition_protein_policy to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['food_items','food_substitutes','meal_templates','meal_template_slots','nutrition_protein_policy']
  loop
    execute format('create trigger nutrition_catalog_truncated after truncate on public.%I
      for each statement execute function public.member_bump_catalog()', table_name);
  end loop;
end $$;

create function public.nutrition_context_snapshot(p_known_revision text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  current_revision text;
  snapshot jsonb;
begin
  select revision::text into current_revision from public.member_catalog_version where id;
  if current_revision is null then
    raise exception 'NUTRITION_CONTEXT_DENIED' using errcode = '42501';
  end if;

  if current_revision = p_known_revision then
    return jsonb_build_object('schema_version', 1, 'revision', current_revision);
  end if;

  -- STABLE functions read a single MVCC snapshot for the whole call. Return one
  -- JSON value so the Data API row cap cannot truncate individual arrays.
  with active_foods as materialized (
    select * from public.food_items where is_active
  ), active_templates as materialized (
    select t.* from public.meal_templates t
    where t.is_active and not exists (
      select 1 from public.meal_template_slots s
      where s.template_id = t.id and not exists (
        select 1 from active_foods f where f.id = s.primary_food_item_id
      )
    )
  )
  select jsonb_build_object(
    'schema_version', 1,
    'revision', current_revision,
    'food_rows', coalesce((select jsonb_agg(to_jsonb(f) order by f.sort_order, f.id)
      from (select * from active_foods order by sort_order, id limit 10001) f), '[]'::jsonb),
    'substitute_rows', coalesce((select jsonb_agg(to_jsonb(s) order by s.food_item_id, s.substitute_food_item_id)
      from (select e.* from public.food_substitutes e
        join active_foods f on f.id = e.food_item_id
        join active_foods r on r.id = e.substitute_food_item_id
        where e.is_active order by e.food_item_id, e.substitute_food_item_id limit 10001) s), '[]'::jsonb),
    'template_rows', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.id)
      from (select * from active_templates order by sort_order, id limit 10001) t), '[]'::jsonb),
    'slot_rows', coalesce((select jsonb_agg(to_jsonb(s) order by s.template_id, s.position)
      from (select s.* from public.meal_template_slots s join active_templates t on t.id = s.template_id
        order by s.template_id, s.position limit 10001) s), '[]'::jsonb),
    'policy_row', (select to_jsonb(p) from public.nutrition_protein_policy p where p.id = 'default')
  ) into snapshot;

  if jsonb_array_length(snapshot->'food_rows') > 10000
     or jsonb_array_length(snapshot->'substitute_rows') > 10000
     or jsonb_array_length(snapshot->'template_rows') > 10000
     or jsonb_array_length(snapshot->'slot_rows') > 10000
     or octet_length(snapshot::text) > 8000000 then
    raise exception 'NUTRITION_CONTEXT_LIMIT';
  end if;
  return snapshot;
end $$;

revoke all on function public.nutrition_context_snapshot(text) from public, anon;
grant execute on function public.nutrition_context_snapshot(text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
