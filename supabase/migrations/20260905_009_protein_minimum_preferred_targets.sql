-- Behtan — Protein Engine v3 Phase 2A
-- Adds an editable practical minimum + preferred target range for every
-- Goal × Resistance-Training branch. Existing Phase-1 factors remain the
-- preferred endpoint, so applying this migration does NOT change live targets.

begin;

alter table public.nutrition_protein_policy
  add column if not exists maintenance_no_rt_min numeric(4,2) not null default 1.20,
  add column if not exists maintenance_rt_min numeric(4,2) not null default 1.40,
  add column if not exists weight_loss_no_rt_min numeric(4,2) not null default 1.30,
  add column if not exists weight_loss_rt_min numeric(4,2) not null default 1.60,
  add column if not exists weight_gain_no_rt_min numeric(4,2) not null default 1.40,
  add column if not exists weight_gain_rt_min numeric(4,2) not null default 1.60;

-- Keep the same broad safety envelope used by the preferred factors.
alter table public.nutrition_protein_policy
  drop constraint if exists nutrition_protein_policy_maintenance_no_rt_min_check,
  add constraint nutrition_protein_policy_maintenance_no_rt_min_check
    check (maintenance_no_rt_min between 0.80 and 3.50),
  drop constraint if exists nutrition_protein_policy_maintenance_rt_min_check,
  add constraint nutrition_protein_policy_maintenance_rt_min_check
    check (maintenance_rt_min between 0.80 and 3.50),
  drop constraint if exists nutrition_protein_policy_weight_loss_no_rt_min_check,
  add constraint nutrition_protein_policy_weight_loss_no_rt_min_check
    check (weight_loss_no_rt_min between 0.80 and 3.50),
  drop constraint if exists nutrition_protein_policy_weight_loss_rt_min_check,
  add constraint nutrition_protein_policy_weight_loss_rt_min_check
    check (weight_loss_rt_min between 0.80 and 3.50),
  drop constraint if exists nutrition_protein_policy_weight_gain_no_rt_min_check,
  add constraint nutrition_protein_policy_weight_gain_no_rt_min_check
    check (weight_gain_no_rt_min between 0.80 and 3.50),
  drop constraint if exists nutrition_protein_policy_weight_gain_rt_min_check,
  add constraint nutrition_protein_policy_weight_gain_rt_min_check
    check (weight_gain_rt_min between 0.80 and 3.50);

-- A practical minimum can never be above its preferred target.
alter table public.nutrition_protein_policy
  drop constraint if exists nutrition_protein_policy_maintenance_no_rt_range_check,
  add constraint nutrition_protein_policy_maintenance_no_rt_range_check
    check (maintenance_no_rt_min <= maintenance_no_rt),
  drop constraint if exists nutrition_protein_policy_maintenance_rt_range_check,
  add constraint nutrition_protein_policy_maintenance_rt_range_check
    check (maintenance_rt_min <= maintenance_rt),
  drop constraint if exists nutrition_protein_policy_weight_loss_no_rt_range_check,
  add constraint nutrition_protein_policy_weight_loss_no_rt_range_check
    check (weight_loss_no_rt_min <= weight_loss_no_rt),
  drop constraint if exists nutrition_protein_policy_weight_loss_rt_range_check,
  add constraint nutrition_protein_policy_weight_loss_rt_range_check
    check (weight_loss_rt_min <= weight_loss_rt),
  drop constraint if exists nutrition_protein_policy_weight_gain_no_rt_range_check,
  add constraint nutrition_protein_policy_weight_gain_no_rt_range_check
    check (weight_gain_no_rt_min <= weight_gain_no_rt),
  drop constraint if exists nutrition_protein_policy_weight_gain_rt_range_check,
  add constraint nutrition_protein_policy_weight_gain_rt_range_check
    check (weight_gain_rt_min <= weight_gain_rt);

comment on column public.nutrition_protein_policy.maintenance_no_rt_min is
  'Behtan practical protein floor in g/kg reference weight; not physiological RDA/minimum.';
comment on column public.nutrition_protein_policy.maintenance_rt_min is
  'Behtan practical protein floor in g/kg reference weight for resistance/mixed training.';
comment on column public.nutrition_protein_policy.weight_loss_no_rt_min is
  'Behtan practical protein floor in g/kg reference weight during weight loss without resistance training.';
comment on column public.nutrition_protein_policy.weight_loss_rt_min is
  'Behtan practical protein floor in g/kg reference weight during weight loss with resistance/mixed training.';
comment on column public.nutrition_protein_policy.weight_gain_no_rt_min is
  'Behtan practical protein floor in g/kg reference weight during weight gain without resistance training.';
comment on column public.nutrition_protein_policy.weight_gain_rt_min is
  'Behtan practical protein floor in g/kg reference weight during weight gain with resistance/mixed training.';

commit;
