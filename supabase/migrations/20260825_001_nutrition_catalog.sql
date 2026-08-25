-- Behtan MVP — live nutrition catalog + onboarding completion contract
-- Safe to run in Supabase SQL Editor. This migration is additive and does not
-- drop the legacy food_exchanges table; production code stops reading it.

begin;

-- ---------------------------------------------------------------------------
-- 1) User-profile completion state
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists onboarding_completed boolean not null default false;

-- Mark only clearly completed legacy profiles as complete. A profile that has
-- merely reached Step 3 (goal) must not be routed to the dashboard.
update public.user_profiles
set onboarding_completed = true
where onboarding_completed = false
  and onboarding_draft_json is null
  and gender is not null
  and birth_date is not null
  and height is not null
  and weight is not null
  and goal is not null
  and activity_level is not null
  and dietary_preferences_json is not null
  and subscription_tier is not null;

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
-- 6) RLS: public read, no browser writes. Admin edits happen in Supabase
-- Dashboard / service-role tooling, never with the anon key.
-- ---------------------------------------------------------------------------
alter table public.food_items enable row level security;
alter table public.food_substitutes enable row level security;
alter table public.meal_templates enable row level security;
alter table public.meal_template_slots enable row level security;

drop policy if exists "Active food items are publicly readable" on public.food_items;
create policy "Active food items are publicly readable"
  on public.food_items for select
  using (is_active = true);

drop policy if exists "Active food substitutes are publicly readable" on public.food_substitutes;
create policy "Active food substitutes are publicly readable"
  on public.food_substitutes for select
  using (is_active = true);

drop policy if exists "Active meal templates are publicly readable" on public.meal_templates;
create policy "Active meal templates are publicly readable"
  on public.meal_templates for select
  using (is_active = true);

drop policy if exists "Meal template slots are publicly readable" on public.meal_template_slots;
create policy "Meal template slots are publicly readable"
  on public.meal_template_slots for select
  using (true);

revoke insert, update, delete on public.food_items from anon, authenticated;
revoke insert, update, delete on public.food_substitutes from anon, authenticated;
revoke insert, update, delete on public.meal_templates from anon, authenticated;
revoke insert, update, delete on public.meal_template_slots from anon, authenticated;

grant select on public.food_items to anon, authenticated;
grant select on public.food_substitutes to anon, authenticated;
grant select on public.meal_templates to anon, authenticated;
grant select on public.meal_template_slots to anon, authenticated;

comment on table public.food_items is
  'Behtan production atomic nutrition catalog. Source of truth for food macros and portion guardrails.';
comment on table public.food_substitutes is
  'Approved direct food-swap graph. Equivalence is solved by the client engine.';
comment on table public.meal_templates is
  'Behtan curated meal/menu definitions. Editable by admins in Supabase.';
comment on table public.meal_template_slots is
  'Ordered foods that compose each meal template.';

commit;
