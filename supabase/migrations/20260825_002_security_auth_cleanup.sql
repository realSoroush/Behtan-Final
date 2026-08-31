-- Behtan MVP — security hardening, RLS tightening, legacy cleanup
-- Run AFTER 20260825_001_nutrition_catalog.sql and seed verification.
-- Safe to re-run where possible.

begin;

-- ---------------------------------------------------------------------------
-- 1) Remove the unused legacy exchange table.
-- The production engine reads food_items / food_substitutes / meal_templates.
-- ---------------------------------------------------------------------------
drop table if exists public.food_exchanges cascade;

-- ---------------------------------------------------------------------------
-- 2) Tighten user_profiles RLS.
-- Only authenticated users can access their own row.
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.user_profiles;
drop policy if exists "Users can insert their own profile" on public.user_profiles;
drop policy if exists "Users can update their own profile" on public.user_profiles;

create policy "Users can view their own profile"
  on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can insert their own profile"
  on public.user_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.user_profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.user_profiles from anon;
revoke delete on public.user_profiles from authenticated;
grant select, insert, update on public.user_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Catalog is read-only from the browser and only after authentication.
-- Inactive entities and relationships to inactive entities stay hidden.
-- ---------------------------------------------------------------------------
alter table public.food_items enable row level security;
alter table public.food_substitutes enable row level security;
alter table public.meal_templates enable row level security;
alter table public.meal_template_slots enable row level security;

-- Remove previous public policies.
drop policy if exists "Active food items are publicly readable" on public.food_items;
drop policy if exists "Active food substitutes are publicly readable" on public.food_substitutes;
drop policy if exists "Active meal templates are publicly readable" on public.meal_templates;
drop policy if exists "Meal template slots are publicly readable" on public.meal_template_slots;

-- Remove these names too if this migration has already been applied once.
drop policy if exists "Authenticated users can read active food items" on public.food_items;
drop policy if exists "Authenticated users can read active food substitutes" on public.food_substitutes;
drop policy if exists "Authenticated users can read active meal templates" on public.meal_templates;
drop policy if exists "Authenticated users can read active meal template slots" on public.meal_template_slots;

create policy "Authenticated users can read active food items"
  on public.food_items
  for select
  to authenticated
  using (is_active = true);

create policy "Authenticated users can read active food substitutes"
  on public.food_substitutes
  for select
  to authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.food_items source_food
      where source_food.id = food_substitutes.food_item_id
        and source_food.is_active = true
    )
    and exists (
      select 1
      from public.food_items target_food
      where target_food.id = food_substitutes.substitute_food_item_id
        and target_food.is_active = true
    )
  );

create policy "Authenticated users can read active meal templates"
  on public.meal_templates
  for select
  to authenticated
  using (is_active = true);

create policy "Authenticated users can read active meal template slots"
  on public.meal_template_slots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meal_templates mt
      where mt.id = meal_template_slots.template_id
        and mt.is_active = true
    )
    and exists (
      select 1
      from public.food_items fi
      where fi.id = meal_template_slots.primary_food_item_id
        and fi.is_active = true
    )
  );

revoke all on public.food_items from anon;
revoke all on public.food_substitutes from anon;
revoke all on public.meal_templates from anon;
revoke all on public.meal_template_slots from anon;

revoke insert, update, delete on public.food_items from authenticated;
revoke insert, update, delete on public.food_substitutes from authenticated;
revoke insert, update, delete on public.meal_templates from authenticated;
revoke insert, update, delete on public.meal_template_slots from authenticated;

grant select on public.food_items to authenticated;
grant select on public.food_substitutes to authenticated;
grant select on public.meal_templates to authenticated;
grant select on public.meal_template_slots to authenticated;

commit;
