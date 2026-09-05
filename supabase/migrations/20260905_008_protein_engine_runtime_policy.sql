-- Behtan — Protein Engine v3 runtime policy
-- Makes the Phase-1 protein curve editable from Supabase Table Editor while
-- keeping browser clients read-only.

begin;

create table if not exists public.nutrition_protein_policy (
  id text primary key default 'default' check (id = 'default'),

  -- Goal × resistance-training matrix (g protein / kg reference weight)
  maintenance_no_rt numeric(4,2) not null default 1.40
    check (maintenance_no_rt between 0.80 and 3.50),
  maintenance_rt numeric(4,2) not null default 1.60
    check (maintenance_rt between 0.80 and 3.50),
  weight_loss_no_rt numeric(4,2) not null default 1.60
    check (weight_loss_no_rt between 0.80 and 3.50),
  weight_loss_rt numeric(4,2) not null default 2.00
    check (weight_loss_rt between 0.80 and 3.50),
  weight_gain_no_rt numeric(4,2) not null default 1.60
    check (weight_gain_no_rt between 0.80 and 3.50),
  weight_gain_rt numeric(4,2) not null default 1.70
    check (weight_gain_rt between 0.80 and 3.50),

  -- Protein reference-weight curve for higher BMI
  obesity_bmi_threshold numeric(4,1) not null default 30.0
    check (obesity_bmi_threshold between 25 and 60),
  reference_bmi numeric(4,1) not null default 25.0
    check (reference_bmi between 18 and 35),
  excess_weight_fraction numeric(5,3) not null default 0.400
    check (excess_weight_fraction between 0 and 1),

  -- Feasibility / macro redistribution guardrails
  max_protein_g_per_day numeric(6,1) not null default 220.0
    check (max_protein_g_per_day between 50 and 400),
  max_protein_calorie_fraction numeric(5,3) not null default 0.350
    check (max_protein_calorie_fraction between 0.100 and 0.600),
  fat_calorie_fraction numeric(5,3) not null default 0.250
    check (fat_calorie_fraction between 0.150 and 0.450),

  notes text not null default 'Protein Engine v3 Phase 1 default policy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_protein_policy_reference_lt_obesity_check
    check (reference_bmi < obesity_bmi_threshold),
  constraint nutrition_protein_policy_macro_room_check
    check (max_protein_calorie_fraction + fat_calorie_fraction <= 0.850)
);

insert into public.nutrition_protein_policy (
  id,
  maintenance_no_rt,
  maintenance_rt,
  weight_loss_no_rt,
  weight_loss_rt,
  weight_gain_no_rt,
  weight_gain_rt,
  obesity_bmi_threshold,
  reference_bmi,
  excess_weight_fraction,
  max_protein_g_per_day,
  max_protein_calorie_fraction,
  fat_calorie_fraction,
  notes
)
values (
  'default',
  1.40,
  1.60,
  1.60,
  2.00,
  1.60,
  1.70,
  30.0,
  25.0,
  0.400,
  220.0,
  0.350,
  0.250,
  'Protein Engine v3 Phase 1 default policy'
)
on conflict (id) do nothing;

-- Reuse/create the same timestamp helper used by the nutrition catalog.
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

drop trigger if exists trg_nutrition_protein_policy_updated_at
  on public.nutrition_protein_policy;
create trigger trg_nutrition_protein_policy_updated_at
before update on public.nutrition_protein_policy
for each row execute function public.set_updated_at();

-- Authenticated app users may read the policy, never edit it from the browser.
alter table public.nutrition_protein_policy enable row level security;

drop policy if exists "Authenticated users can read protein policy"
  on public.nutrition_protein_policy;
create policy "Authenticated users can read protein policy"
  on public.nutrition_protein_policy
  for select
  to authenticated
  using (id = 'default');

revoke all on public.nutrition_protein_policy from anon;
revoke insert, update, delete on public.nutrition_protein_policy from authenticated;
grant select on public.nutrition_protein_policy to authenticated;

comment on table public.nutrition_protein_policy is
  'Singleton runtime configuration for Behtan Protein Engine v3. Edit manually in Supabase Dashboard; app clients are read-only.';
comment on column public.nutrition_protein_policy.excess_weight_fraction is
  'Fraction of weight above reference-BMI weight retained in the protein reference-weight curve.';
comment on column public.nutrition_protein_policy.max_protein_calorie_fraction is
  'Maximum fraction of target calories that may be allocated to protein.';
comment on column public.nutrition_protein_policy.fat_calorie_fraction is
  'Base fraction of target calories reserved for fat before carbohydrate receives the remainder.';

commit;
