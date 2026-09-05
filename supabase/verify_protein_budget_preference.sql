-- Behtan — verify Protein Engine v3 Phase 2B

select
  id,
  budget_economic_position,
  budget_balanced_position,
  budget_performance_position,
  updated_at
from public.nutrition_protein_policy
where id = 'default';

select
  count(*) filter (where protein_budget_preference = 'economic') as economic_users,
  count(*) filter (where protein_budget_preference = 'balanced') as balanced_users,
  count(*) filter (where protein_budget_preference = 'performance') as performance_users,
  count(*) filter (where protein_budget_preference is null) as legacy_null_users
from public.user_profiles;
