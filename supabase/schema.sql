-- ============================================================================
-- Behtan — Supabase Schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

-- Enable UUID generation if not already enabled
create extension if not exists "uuid-ossp";

-- ============================================================================
-- TABLE: subscription_plans
-- Runtime-managed catalog used by onboarding and the payment backend.
-- ============================================================================

create or replace function public.subscription_features_valid(items text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    array_ndims(items) = 1
    and cardinality(items) between 1 and 20
    and not exists (
      select 1 from unnest(items) as feature(value)
      where value is null or char_length(btrim(value)) not between 1 and 180
    ), false
  );
$$;

create table if not exists public.subscription_plans (
  code text primary key,
  name text not null,
  emoji text not null default '',
  price_toman bigint not null check (price_toman between 0 and 100000000),
  price_note text not null default 'ماهانه',
  duration_days smallint not null default 30 check (duration_days between 1 and 3650),
  features text[] not null,
  badge text,
  theme text not null default 'silver' check (theme in ('silver', 'gold', 'green')),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_code_check check (code ~ '^[a-z][a-z0-9_-]{1,49}$'),
  constraint subscription_plans_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint subscription_plans_emoji_check check (char_length(emoji) <= 16),
  constraint subscription_plans_price_note_check check (char_length(btrim(price_note)) between 1 and 80),
  constraint subscription_plans_features_check check (
    public.subscription_features_valid(features)
  ),
  constraint subscription_plans_badge_check check (
    badge is null or char_length(btrim(badge)) between 1 and 80
  )
);

insert into public.subscription_plans (
  code, name, emoji, price_toman, price_note, duration_days,
  features, badge, theme, sort_order, is_active
)
values
  ('silver', 'نقره‌ای', '🥈', 149000, 'ماهانه', 30,
   array['برنامه تغذیه شخصی‌سازی‌شده','محاسبه دقیق کالری و ماکرو','۶ وعده غذایی روزانه','جایگزینی غذا (سواپ)','پشتیبانی ۷/۲۴'],
   null, 'silver', 10, true),
  ('gold', 'طلایی', '🥇', 249000, 'ماهانه', 30,
   array['همه مزایای نقره‌ای','✨ برنامه تمرینی اختصاصی','✨ تنظیم بر اساس ورزش روز','✨ مشاوره با متخصص تغذیه','✨ تحلیل پیشرفته ترکیب بدن'],
   'محبوب‌ترین', 'gold', 20, true)
on conflict (code) do nothing;

alter table public.subscription_plans enable row level security;
drop policy if exists "Authenticated users can read active subscription plans" on public.subscription_plans;
create policy "Authenticated users can read active subscription plans"
  on public.subscription_plans for select to authenticated
  using (is_active = true);
revoke all on public.subscription_plans from anon;
revoke insert, update, delete on public.subscription_plans from authenticated;
revoke truncate, references, trigger on public.subscription_plans from authenticated;
grant select on public.subscription_plans to authenticated;
grant select, insert, update, delete on public.subscription_plans to service_role;

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
  activity_profile_json jsonb,
  workout_location text check (workout_location in ('home', 'gym', 'none')),
  workout_days int2,
  motivation text,
  schedule_json jsonb,
  medical_conditions_json jsonb,
  dietary_preferences_json jsonb,
  protein_budget_preference text check (protein_budget_preference in ('economic', 'balanced', 'performance')),
  weight_loss_speed text check (weight_loss_speed in ('mild', 'standard', 'fast')),
  body_fat_pct numeric,
  body_fat_source text check (body_fat_source in ('ai_visual', 'measured')),
  body_scan_consent_json jsonb check (
    body_scan_consent_json is null
    or (
      jsonb_typeof(body_scan_consent_json) = 'object'
      and body_scan_consent_json ?& array[
        'version',
        'acceptedAt',
        'analysisRequestedAt',
        'processor',
        'rawImageStored'
      ]
      and body_scan_consent_json - array[
        'version',
        'acceptedAt',
        'analysisRequestedAt',
        'processor',
        'rawImageStored'
      ] = '{}'::jsonb
      and body_scan_consent_json->'version' = '1'::jsonb
      and jsonb_typeof(body_scan_consent_json->'acceptedAt') = 'string'
      and jsonb_typeof(body_scan_consent_json->'analysisRequestedAt') = 'string'
      and body_scan_consent_json->>'processor' = 'google_gemini'
      and body_scan_consent_json->'rawImageStored' = 'false'::jsonb
    )
  ),
  body_type text check (body_type in ('ectomorph', 'mesomorph', 'endomorph')),
  subscription_tier text references public.subscription_plans(code) on update cascade on delete restrict,
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
-- TABLE: daily_meal_checkins
-- ============================================================================
create table if not exists public.daily_meal_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack')),
  template_id text not null,
  meal_snapshot jsonb not null,
  consumed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date, meal_slot),
  constraint daily_meal_checkins_snapshot_object_check check (jsonb_typeof(meal_snapshot) = 'object')
);
create index if not exists idx_daily_meal_checkins_user_date on public.daily_meal_checkins (user_id, plan_date);
alter table public.daily_meal_checkins enable row level security;
drop policy if exists "Users can view their own meal checkins" on public.daily_meal_checkins;
drop policy if exists "Users can insert their own meal checkins" on public.daily_meal_checkins;
drop policy if exists "Users can update their own meal checkins" on public.daily_meal_checkins;
drop policy if exists "Users can delete their own meal checkins" on public.daily_meal_checkins;
create policy "Users can view their own meal checkins" on public.daily_meal_checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own meal checkins" on public.daily_meal_checkins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own meal checkins" on public.daily_meal_checkins for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own meal checkins" on public.daily_meal_checkins for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.daily_meal_checkins from anon;
grant select, insert, update, delete on public.daily_meal_checkins to authenticated;

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
  fiber_g_per_unit numeric(10,3) not null default 0 check (fiber_g_per_unit >= 0),
  quality_tags text[] not null default '{}',
  fruit_veg_grams_per_unit numeric(10,3) not null default 0 check (fruit_veg_grams_per_unit >= 0),
  fiber_source_name text,
  fiber_source_url text,
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
    allergy_flags <@ array['dairy','gluten','peanut','tree_nut','soy','seafood']::text[]
  ),
  constraint food_items_vegetarian_flags_check check (
    excluded_for_vegetarian <@ array['none','vegan','lacto_ovo','pescatarian','raw']::text[]
  ),
  constraint food_items_swap_allowed_meals_check check (
    cardinality(swap_allowed_meals) > 0
    and swap_allowed_meals <@ array['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack']::text[]
  ),
  constraint food_items_fruit_veg_contribution_check check (fruit_veg_grams_per_unit <= grams_per_unit),
  constraint food_items_quality_tags_check check (
    quality_tags <@ array['whole_grain','refined_grain','legume','whole_fruit','non_starchy_vegetable','starchy_vegetable','nuts_seeds','unsaturated_fat','protein_supplement','whole_food']::text[]
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

drop trigger if exists trg_subscription_plans_updated_at on public.subscription_plans;
create trigger trg_subscription_plans_updated_at
before update on public.subscription_plans
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


-- ============================================================================
-- TABLE: nutrition_protein_policy
-- Singleton runtime configuration for Protein Engine v3.
-- ============================================================================

create table if not exists public.nutrition_protein_policy (
  id text primary key default 'default' check (id = 'default'),
  maintenance_no_rt_min numeric(4,2) not null default 1.20 check (maintenance_no_rt_min between 0.80 and 3.50),
  maintenance_rt_min numeric(4,2) not null default 1.40 check (maintenance_rt_min between 0.80 and 3.50),
  weight_loss_no_rt_min numeric(4,2) not null default 1.30 check (weight_loss_no_rt_min between 0.80 and 3.50),
  weight_loss_rt_min numeric(4,2) not null default 1.60 check (weight_loss_rt_min between 0.80 and 3.50),
  weight_gain_no_rt_min numeric(4,2) not null default 1.40 check (weight_gain_no_rt_min between 0.80 and 3.50),
  weight_gain_rt_min numeric(4,2) not null default 1.60 check (weight_gain_rt_min between 0.80 and 3.50),
  maintenance_no_rt numeric(4,2) not null default 1.40 check (maintenance_no_rt between 0.80 and 3.50),
  maintenance_rt numeric(4,2) not null default 1.60 check (maintenance_rt between 0.80 and 3.50),
  weight_loss_no_rt numeric(4,2) not null default 1.60 check (weight_loss_no_rt between 0.80 and 3.50),
  weight_loss_rt numeric(4,2) not null default 2.00 check (weight_loss_rt between 0.80 and 3.50),
  weight_gain_no_rt numeric(4,2) not null default 1.60 check (weight_gain_no_rt between 0.80 and 3.50),
  weight_gain_rt numeric(4,2) not null default 1.70 check (weight_gain_rt between 0.80 and 3.50),
  obesity_bmi_threshold numeric(4,1) not null default 30.0 check (obesity_bmi_threshold between 25 and 60),
  reference_bmi numeric(4,1) not null default 25.0 check (reference_bmi between 18 and 35),
  excess_weight_fraction numeric(5,3) not null default 0.400 check (excess_weight_fraction between 0 and 1),
  max_protein_g_per_day numeric(6,1) not null default 220.0 check (max_protein_g_per_day between 50 and 400),
  max_protein_calorie_fraction numeric(5,3) not null default 0.350 check (max_protein_calorie_fraction between 0.100 and 0.600),
  fat_calorie_fraction numeric(5,3) not null default 0.250 check (fat_calorie_fraction between 0.150 and 0.450),
  notes text not null default 'Protein Engine v3 Phase 1 default policy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_protein_policy_maintenance_no_rt_range_check check (maintenance_no_rt_min <= maintenance_no_rt),
  constraint nutrition_protein_policy_maintenance_rt_range_check check (maintenance_rt_min <= maintenance_rt),
  constraint nutrition_protein_policy_weight_loss_no_rt_range_check check (weight_loss_no_rt_min <= weight_loss_no_rt),
  constraint nutrition_protein_policy_weight_loss_rt_range_check check (weight_loss_rt_min <= weight_loss_rt),
  constraint nutrition_protein_policy_weight_gain_no_rt_range_check check (weight_gain_no_rt_min <= weight_gain_no_rt),
  constraint nutrition_protein_policy_weight_gain_rt_range_check check (weight_gain_rt_min <= weight_gain_rt),
  constraint nutrition_protein_policy_reference_lt_obesity_check check (reference_bmi < obesity_bmi_threshold),
  constraint nutrition_protein_policy_macro_room_check check (max_protein_calorie_fraction + fat_calorie_fraction <= 0.850)
);

insert into public.nutrition_protein_policy (
  id,
  maintenance_no_rt_min, maintenance_rt_min,
  weight_loss_no_rt_min, weight_loss_rt_min,
  weight_gain_no_rt_min, weight_gain_rt_min,
  maintenance_no_rt, maintenance_rt, weight_loss_no_rt, weight_loss_rt,
  weight_gain_no_rt, weight_gain_rt, obesity_bmi_threshold, reference_bmi,
  excess_weight_fraction, max_protein_g_per_day,
  max_protein_calorie_fraction, fat_calorie_fraction, notes
)
values (
  'default',
  1.20, 1.40, 1.30, 1.60, 1.40, 1.60,
  1.40, 1.60, 1.60, 2.00, 1.60, 1.70, 30.0, 25.0,
  0.400, 220.0, 0.350, 0.250, 'Protein Engine v3 Phase 1 default policy'
)
on conflict (id) do nothing;

drop trigger if exists trg_nutrition_protein_policy_updated_at on public.nutrition_protein_policy;
create trigger trg_nutrition_protein_policy_updated_at
before update on public.nutrition_protein_policy
for each row execute function public.set_updated_at();

alter table public.nutrition_protein_policy enable row level security;

drop policy if exists "Authenticated users can read protein policy" on public.nutrition_protein_policy;
create policy "Authenticated users can read protein policy"
  on public.nutrition_protein_policy for select to authenticated
  using (id = 'default');

revoke all on public.nutrition_protein_policy from anon;
revoke insert, update, delete on public.nutrition_protein_policy from authenticated;
grant select on public.nutrition_protein_policy to authenticated;

comment on table public.nutrition_protein_policy is
  'Singleton runtime configuration for Behtan Protein Engine v3. Edit in Supabase Dashboard; browser clients are read-only.';

-- Billing: same definitions as migration 014. Fresh databases only.
begin;

-- Billing records are authoritative. user_profiles.subscription_tier is only a preference.
create table public.billing_settings (
  id boolean primary key default true check (id),
  mode text not null default 'sandbox' check (mode in ('sandbox','live')),
  checkout_enabled boolean not null default false
);
insert into public.billing_settings(id) values(true);

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  plan_code text not null references public.subscription_plans(code) on delete restrict,
  plan_name text not null,
  price_toman bigint not null check(price_toman between 0 and 100000000),
  amount_rial bigint generated always as (price_toman * 10) stored,
  duration_days integer not null check(duration_days between 1 and 3650),
  mode text not null check(mode in ('sandbox','live')),
  status text not null default 'creating' check(status in ('creating','pending','paid','failed')),
  authority text,
  callback_token uuid not null unique default gen_random_uuid(),
  ref_id text,
  last_code integer,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  checked_at timestamptz,
  verify_lease_until timestamptz,
  unique(mode, authority),
  unique(mode, ref_id),
  check (status <> 'paid' or verified_at is not null)
);
create index payment_orders_user_date on public.payment_orders(user_id, created_at desc);
create index payment_orders_pending on public.payment_orders(checked_at nulls first) where status='pending';

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  source_order_id uuid not null unique references public.payment_orders(id) on delete restrict,
  plan_code text not null,
  mode text not null check(mode in ('sandbox','live')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check(expires_at > starts_at)
);
create index user_subscriptions_access on public.user_subscriptions(user_id, mode, expires_at);

alter table public.billing_settings enable row level security;
alter table public.payment_orders enable row level security;
alter table public.user_subscriptions enable row level security;
revoke all on public.billing_settings, public.payment_orders, public.user_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.billing_settings, public.payment_orders, public.user_subscriptions to service_role;

create function public.billing_has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_subscriptions s
    join public.billing_settings b on b.id and b.mode=s.mode
    where s.user_id=auth.uid() and s.revoked_at is null
      and s.starts_at<=now() and s.expires_at>now());
$$;
revoke all on function public.billing_has_access() from public, anon;
grant execute on function public.billing_has_access() to authenticated, service_role;

create function public.billing_begin_order(p_user uuid, p_plan text, p_price bigint, p_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.billing_settings; p public.subscription_plans; o public.payment_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 14));
  select * into b from public.billing_settings where id for share;
  if not b.checkout_enabled then raise exception 'CHECKOUT_DISABLED'; end if;
  if exists(select 1 from public.user_subscriptions where user_id=p_user and mode=b.mode
    and revoked_at is null and starts_at<=now() and expires_at>now()) then
    raise exception 'ALREADY_ACTIVE';
  end if;
  select * into p from public.subscription_plans where code=p_plan and is_active for share;
  if not found then raise exception 'PLAN_UNAVAILABLE'; end if;
  if p.price_toman<>p_price or p.duration_days<>p_days then raise exception 'OFFER_CHANGED'; end if;
  -- An existing checkout is resumed, never duplicated by a double-click or network retry.
  select * into o from public.payment_orders where user_id=p_user and mode=b.mode
    and status in ('creating','pending') and created_at>now()-interval '20 minutes'
    order by created_at desc limit 1;
  if found then
    if o.status='pending' then
      if o.plan_code<>p.code or o.price_toman<>p.price_toman or o.duration_days<>p.duration_days then
        raise exception 'PENDING_ORDER_EXISTS';
      end if;
      return to_jsonb(o)||jsonb_build_object('is_new',false);
    end if;
    if o.created_at>now()-interval '60 seconds' then raise exception 'CHECKOUT_BUSY'; end if;
    update public.payment_orders set status='failed' where id=o.id;
  end if;
  if (select count(*) from public.payment_orders where user_id=p_user
    and created_at>now()-interval '5 minutes')>=5 then raise exception 'RATE_LIMITED'; end if;
  insert into public.payment_orders(user_id,plan_code,plan_name,price_toman,duration_days,mode)
    values(p_user,p.code,p.name,p.price_toman,p.duration_days,b.mode) returning * into o;
  return to_jsonb(o)||jsonb_build_object('is_new',true);
end $$;

-- This RPC is callable only by the backend after a genuine gateway verify response.
create function public.billing_settle(p_order uuid, p_ref text, p_code integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.payment_orders; v_user uuid; v_start timestamptz; s public.user_subscriptions;
begin
  select user_id into v_user from public.payment_orders where id=p_order;
  if v_user is null then raise exception 'ORDER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,14));
  select * into o from public.payment_orders where id=p_order for update;
  if o.status='paid' then
    select * into s from public.user_subscriptions where source_order_id=o.id;
    return to_jsonb(s);
  end if;
  if o.price_toman>0 and (o.authority is null or p_code is null or p_code not in (100,101)
    or p_ref is null or p_ref !~ '^[0-9]{1,30}$') then raise exception 'VERIFY_REQUIRED'; end if;
  if o.price_toman=0 and (p_ref is not null or p_code is distinct from 0) then raise exception 'INVALID_FREE_ORDER'; end if;
  select greatest(now(),coalesce(max(expires_at),now())) into v_start from public.user_subscriptions
    where user_id=o.user_id and mode=o.mode and revoked_at is null;
  insert into public.user_subscriptions(user_id,source_order_id,plan_code,mode,starts_at,expires_at)
    values(o.user_id,o.id,o.plan_code,o.mode,v_start,v_start+make_interval(days=>o.duration_days)) returning * into s;
  update public.payment_orders set status='paid', ref_id=p_ref, last_code=p_code,
    verified_at=now(),verify_lease_until=null where id=o.id;
  return to_jsonb(s);
end $$;

create function public.billing_claim_verify(p_order uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_orders set verify_lease_until=now()+interval '40 seconds', checked_at=now()
  where id=p_order and status='pending' and authority is not null
    and (verify_lease_until is null or verify_lease_until<now())
    and (checked_at is null or checked_at<now()-interval '10 seconds');
  return found;
end $$;

revoke all on function public.billing_begin_order(uuid,text,bigint,integer),
  public.billing_settle(uuid,text,integer),public.billing_claim_verify(uuid) from public, anon, authenticated;
grant execute on function public.billing_begin_order(uuid,text,bigint,integer),
  public.billing_settle(uuid,text,integer),public.billing_claim_verify(uuid) to service_role;

-- Existing row ownership/catalog policies still apply, together with subscription access.
do $$ declare t text; begin
  foreach t in array array['food_items','food_substitutes','meal_templates','meal_template_slots','nutrition_protein_policy'] loop
    execute format('create policy billing_read_access on public.%I as restrictive for select to authenticated using (public.billing_has_access())',t);
  end loop;
end $$;
create policy billing_checkin_insert on public.daily_meal_checkins as restrictive for insert to authenticated with check(public.billing_has_access());
create policy billing_checkin_update on public.daily_meal_checkins as restrictive for update to authenticated using(public.billing_has_access()) with check(public.billing_has_access());
create policy billing_checkin_delete on public.daily_meal_checkins as restrictive for delete to authenticated using(public.billing_has_access());

commit;

-- Production defaults added by migration 015. Keep checkout closed until all
-- external secrets/hooks and the live end-to-end purchase have been verified.
update public.billing_settings
set mode = 'live', checkout_enabled = false
where id = true;


drop trigger if exists trg_daily_meal_checkins_updated_at on public.daily_meal_checkins;
create trigger trg_daily_meal_checkins_updated_at before update on public.daily_meal_checkins for each row execute function public.set_updated_at();
