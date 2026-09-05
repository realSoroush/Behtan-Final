-- Behtan Protein Engine v3 — manual runtime-policy testing
-- Browser clients are read-only. Run UPDATE statements here / Table Editor.

select
  id,
  maintenance_no_rt_min, maintenance_no_rt,
  maintenance_rt_min, maintenance_rt,
  weight_loss_no_rt_min, weight_loss_no_rt,
  weight_loss_rt_min, weight_loss_rt,
  weight_gain_no_rt_min, weight_gain_no_rt,
  weight_gain_rt_min, weight_gain_rt,
  obesity_bmi_threshold, reference_bmi, excess_weight_fraction,
  max_protein_g_per_day, max_protein_calorie_fraction, fat_calorie_fraction,
  updated_at
from public.nutrition_protein_policy
where id = 'default';

-- Example: test a narrower Loss + RT range (uncomment deliberately).
-- update public.nutrition_protein_policy
-- set weight_loss_rt_min = 1.55,
--     weight_loss_rt = 1.90
-- where id = 'default';

-- Example: change the obesity reference-weight curve.
-- update public.nutrition_protein_policy
-- set obesity_bmi_threshold = 32,
--     reference_bmi = 24.5,
--     excess_weight_fraction = 0.30
-- where id = 'default';

-- Example: change feasibility guardrails.
-- update public.nutrition_protein_policy
-- set max_protein_g_per_day = 200,
--     max_protein_calorie_fraction = 0.33,
--     fat_calorie_fraction = 0.27
-- where id = 'default';
