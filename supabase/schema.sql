-- ============================================================================
-- Behtan — Supabase Schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

-- Enable UUID generation if not already enabled
create extension if not exists "uuid-ossp";

-- ============================================================================
-- TABLE: user_profiles
-- One row per authenticated user (id = auth.users.id).
-- ============================================================================

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  gender text check (gender in ('male', 'female')),
  province text,
  city text,
  birth_date date,
  height numeric,
  weight numeric,
  goal text check (goal in ('weight_loss', 'weight_gain', 'maintenance')),
  activity_level text check (activity_level in ('sedentary', 'lightly_active', 'moderate', 'active')),
  workout_location text check (workout_location in ('home', 'gym', 'none')),
  workout_days int2,
  motivation text,
  schedule_json jsonb,
  medical_conditions_json jsonb,
  dietary_preferences_json jsonb,
  weight_loss_speed text check (weight_loss_speed in ('mild', 'standard', 'fast')),
  body_fat_pct numeric,
  body_type text check (body_type in ('ectomorph', 'mesomorph', 'endomorph')),
  subscription_tier text check (subscription_tier in ('silver', 'gold')),
  onboarding_step int2 not null default 1 check (onboarding_step between 1 and 11),
  onboarding_draft_json jsonb,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.user_profiles is
  'Onboarding + profile data. Nutrition numbers are computed client-side via nutritionHelpers.ts, never stored as AI output.';

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

-- ============================================================================
-- Helpful index for lookups
-- ============================================================================

create index if not exists idx_user_profiles_phone
  on public.user_profiles (phone);


-- ============================================================================
-- LIVE NUTRITION CATALOG (production source of truth)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2) Atomic food catalog
-- ---------------------------------------------------------------------------
create table if not exists public.food_items (
  id text primary key,
  name text not null,
  role text not null check (role in ('protein','starch','vegetable','fat','dairy','fruit')),
  emoji text not null default '',
  unit_label text not null,
  grams_per_unit numeric(10,3) not null check (grams_per_unit > 0),
  kcal_per_unit numeric(10,3) not null check (kcal_per_unit >= 0),
  protein_per_unit numeric(10,3) not null check (protein_per_unit >= 0),
  carbs_per_unit numeric(10,3) not null check (carbs_per_unit >= 0),
  fat_per_unit numeric(10,3) not null check (fat_per_unit >= 0),
  allergy_flags text[] not null default '{}',
  excluded_for_vegetarian text[] not null default '{}',
  swap_allowed_meals text[] not null default array['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack']::text[],
  swap_group text not null default '',
  swap_priority smallint not null default 100 check (swap_priority >= 0),
  portion_min_units numeric(10,3) not null check (portion_min_units > 0),
  portion_typical_units numeric(10,3) not null,
  portion_soft_max_units numeric(10,3) not null,
  portion_hard_max_units numeric(10,3) not null,
  portion_step numeric(10,3) not null check (portion_step > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  source_name text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_items_allergy_flags_check check (
    allergy_flags <@ array['dairy','gluten','peanut','soy','seafood']::text[]
  ),
  constraint food_items_vegetarian_flags_check check (
    excluded_for_vegetarian <@ array['none','vegan','lacto_ovo','pescatarian','raw']::text[]
  ),
  constraint food_items_swap_allowed_meals_check check (
    cardinality(swap_allowed_meals) > 0
    and swap_allowed_meals <@ array['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack']::text[]
  ),
  constraint food_items_portion_order_check check (
    portion_min_units <= portion_typical_units
    and portion_typical_units <= portion_soft_max_units
    and portion_soft_max_units <= portion_hard_max_units
  )
);

create index if not exists idx_food_items_role_active
  on public.food_items (role, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- 3) Approved substitution graph
-- ---------------------------------------------------------------------------
create table if not exists public.food_substitutes (
  food_item_id text not null references public.food_items(id) on delete cascade,
  substitute_food_item_id text not null references public.food_items(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (food_item_id, substitute_food_item_id),
  constraint food_substitutes_no_self_check check (food_item_id <> substitute_food_item_id)
);

create index if not exists idx_food_substitutes_source_active
  on public.food_substitutes (food_item_id, is_active);

-- ---------------------------------------------------------------------------
-- 4) Meal templates + ordered slots
-- ---------------------------------------------------------------------------
create table if not exists public.meal_templates (
  id text primary key,
  slot text not null check (slot in (
    'breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack'
  )),
  display_name text not null,
  is_workout_day_only boolean not null default false,
  is_rest_day_only boolean not null default false,
  max_per_week smallint,
  restricted_diet_only boolean not null default false,
  vegetarian_statuses_only text[] not null default '{}',
  goal_tags text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_templates_day_gate_check check (
    not (is_workout_day_only and is_rest_day_only)
  ),
  constraint meal_templates_vegetarian_statuses_check check (
    vegetarian_statuses_only <@ array['none','vegan','lacto_ovo','pescatarian','raw']::text[]
  ),
  constraint meal_templates_goal_tags_check check (
    goal_tags <@ array['weight_loss','weight_gain','maintenance']::text[]
  )
);

create index if not exists idx_meal_templates_slot_active
  on public.meal_templates (slot, is_active, sort_order);

create table if not exists public.meal_template_slots (
  id bigint generated by default as identity primary key,
  template_id text not null references public.meal_templates(id) on delete cascade,
  position smallint not null check (position >= 0),
  role text not null check (role in ('protein','starch','vegetable','fat','dairy','fruit')),
  primary_food_item_id text not null references public.food_items(id) on delete restrict,
  dynamic_units boolean not null default true,
  fixed_units numeric(10,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, position),
  constraint meal_template_slots_fixed_units_check check (fixed_units is null or fixed_units > 0)
);

create index if not exists idx_meal_template_slots_template_position
  on public.meal_template_slots (template_id, position);

-- ---------------------------------------------------------------------------
-- 5) updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop/recreate only our trigger names so the migration is re-runnable.
drop trigger if exists trg_food_items_updated_at on public.food_items;
create trigger trg_food_items_updated_at
before update on public.food_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_food_substitutes_updated_at on public.food_substitutes;
create trigger trg_food_substitutes_updated_at
before update on public.food_substitutes
for each row execute function public.set_updated_at();

drop trigger if exists trg_meal_templates_updated_at on public.meal_templates;
create trigger trg_meal_templates_updated_at
before update on public.meal_templates
for each row execute function public.set_updated_at();

drop trigger if exists trg_meal_template_slots_updated_at on public.meal_template_slots;
create trigger trg_meal_template_slots_updated_at
before update on public.meal_template_slots
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6) RLS: authenticated read-only catalog; admin writes only.
-- ---------------------------------------------------------------------------
alter table public.food_items enable row level security;
alter table public.food_substitutes enable row level security;
alter table public.meal_templates enable row level security;
alter table public.meal_template_slots enable row level security;

drop policy if exists "Authenticated users can read active food items" on public.food_items;
create policy "Authenticated users can read active food items"
  on public.food_items for select to authenticated
  using (is_active = true);

drop policy if exists "Authenticated users can read active food substitutes" on public.food_substitutes;
create policy "Authenticated users can read active food substitutes"
  on public.food_substitutes for select to authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.food_items source_food
      where source_food.id = food_substitutes.food_item_id and source_food.is_active = true
    )
    and exists (
      select 1 from public.food_items target_food
      where target_food.id = food_substitutes.substitute_food_item_id and target_food.is_active = true
    )
  );

drop policy if exists "Authenticated users can read active meal templates" on public.meal_templates;
create policy "Authenticated users can read active meal templates"
  on public.meal_templates for select to authenticated
  using (is_active = true);

drop policy if exists "Authenticated users can read active meal template slots" on public.meal_template_slots;
create policy "Authenticated users can read active meal template slots"
  on public.meal_template_slots for select to authenticated
  using (
    exists (
      select 1 from public.meal_templates mt
      where mt.id = meal_template_slots.template_id and mt.is_active = true
    )
    and exists (
      select 1 from public.food_items fi
      where fi.id = meal_template_slots.primary_food_item_id and fi.is_active = true
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

comment on table public.food_items is
  'Behtan production atomic nutrition catalog. Source of truth for food macros and portion guardrails.';
comment on table public.food_substitutes is
  'Approved direct food-swap graph. Equivalence is solved by the client engine.';
comment on table public.meal_templates is
  'Behtan curated meal/menu definitions. Editable by admins in Supabase.';
comment on table public.meal_template_slots is
  'Ordered foods that compose each meal template.';

