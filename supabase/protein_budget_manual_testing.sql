-- Behtan — Protein Budget Preference manual testing helpers
-- Run individual statements in Supabase SQL Editor as needed.

-- Current runtime interpolation positions:
select
  id,
  budget_economic_position,
  budget_balanced_position,
  budget_performance_position,
  updated_at
from public.nutrition_protein_policy
where id = 'default';

-- Example: make Balanced slightly more protein-forward (60% of min→preferred range).
-- update public.nutrition_protein_policy
-- set budget_balanced_position = 0.600
-- where id = 'default';

-- Restore approved defaults:
-- update public.nutrition_protein_policy
-- set
--   budget_economic_position = 0.000,
--   budget_balanced_position = 0.500,
--   budget_performance_position = 1.000
-- where id = 'default';

-- Manual per-user testing (replace UUID):
-- update public.user_profiles
-- set protein_budget_preference = 'economic'
-- where id = '00000000-0000-0000-0000-000000000000';

-- Valid values: economic | balanced | performance
