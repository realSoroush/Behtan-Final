-- Behtan — verify Protein Engine runtime policy

select
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
  notes,
  updated_at
from public.nutrition_protein_policy
where id = 'default';

-- Must return exactly one row.
select count(*) as default_policy_rows
from public.nutrition_protein_policy
where id = 'default';
