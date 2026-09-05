-- Behtan — Protein Engine v3 Phase 2B
-- Adds per-user protein budget preference plus runtime-editable interpolation
-- positions between the practical minimum and preferred protein endpoints.
-- Legacy users remain NULL and the app treats NULL as performance so their
-- existing protein target does not silently decrease after deployment.

begin;

-- ---------------------------------------------------------------------------
-- 1) Per-user preference
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists protein_budget_preference text;

alter table public.user_profiles
  drop constraint if exists user_profiles_protein_budget_preference_check,
  add constraint user_profiles_protein_budget_preference_check
    check (
      protein_budget_preference is null
      or protein_budget_preference in ('economic', 'balanced', 'performance')
    );

comment on column public.user_profiles.protein_budget_preference is
  'User-selected position inside Behtan protein target range: economic, balanced, or performance. NULL is preserved for legacy profiles and interpreted by the app as performance.';

-- ---------------------------------------------------------------------------
-- 2) Runtime-editable range positions
-- 0.0 = minimum endpoint, 1.0 = preferred endpoint.
-- ---------------------------------------------------------------------------
alter table public.nutrition_protein_policy
  add column if not exists budget_economic_position numeric(5,3) not null default 0.000,
  add column if not exists budget_balanced_position numeric(5,3) not null default 0.500,
  add column if not exists budget_performance_position numeric(5,3) not null default 1.000;

alter table public.nutrition_protein_policy
  drop constraint if exists nutrition_protein_policy_budget_economic_position_check,
  add constraint nutrition_protein_policy_budget_economic_position_check
    check (budget_economic_position between 0 and 1),
  drop constraint if exists nutrition_protein_policy_budget_balanced_position_check,
  add constraint nutrition_protein_policy_budget_balanced_position_check
    check (budget_balanced_position between 0 and 1),
  drop constraint if exists nutrition_protein_policy_budget_performance_position_check,
  add constraint nutrition_protein_policy_budget_performance_position_check
    check (budget_performance_position between 0 and 1),
  drop constraint if exists nutrition_protein_policy_budget_positions_order_check,
  add constraint nutrition_protein_policy_budget_positions_order_check
    check (
      budget_economic_position <= budget_balanced_position
      and budget_balanced_position <= budget_performance_position
    );

comment on column public.nutrition_protein_policy.budget_economic_position is
  'Interpolation position between minimum (0) and preferred (1) protein target for Economic mode.';
comment on column public.nutrition_protein_policy.budget_balanced_position is
  'Interpolation position between minimum (0) and preferred (1) protein target for Balanced mode.';
comment on column public.nutrition_protein_policy.budget_performance_position is
  'Interpolation position between minimum (0) and preferred (1) protein target for Performance mode.';

commit;
