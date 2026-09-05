-- Behtan Protein Engine v3 Phase 2A verification
select
  id,
  maintenance_no_rt_min, maintenance_no_rt,
  maintenance_rt_min, maintenance_rt,
  weight_loss_no_rt_min, weight_loss_no_rt,
  weight_loss_rt_min, weight_loss_rt,
  weight_gain_no_rt_min, weight_gain_no_rt,
  weight_gain_rt_min, weight_gain_rt,
  updated_at
from public.nutrition_protein_policy
where id = 'default';

-- Expected: 0 rows. A practical minimum must never exceed preferred.
select id
from public.nutrition_protein_policy
where maintenance_no_rt_min > maintenance_no_rt
   or maintenance_rt_min > maintenance_rt
   or weight_loss_no_rt_min > weight_loss_no_rt
   or weight_loss_rt_min > weight_loss_rt
   or weight_gain_no_rt_min > weight_gain_no_rt
   or weight_gain_rt_min > weight_gain_rt;
