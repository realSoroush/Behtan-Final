import type { ProteinEnginePolicy } from '@/types';

export const DEFAULT_PROTEIN_ENGINE_POLICY: ProteinEnginePolicy = {
  id: 'default',
  // Phase 2A practical floors. These are product targets for affordable,
  // nutritionally robust plans — not a statement of physiological minimum/RDA.
  maintenanceNoResistanceTrainingMinimum: 1.2,
  maintenanceResistanceTrainingMinimum: 1.4,
  weightLossNoResistanceTrainingMinimum: 1.3,
  weightLossResistanceTrainingMinimum: 1.6,
  weightGainNoResistanceTrainingMinimum: 1.4,
  weightGainResistanceTrainingMinimum: 1.6,
  // Existing Phase-1 factors become the preferred targets. Until Budget
  // Preference is implemented, production continues to prescribe these values.
  maintenanceNoResistanceTraining: 1.4,
  maintenanceResistanceTraining: 1.6,
  weightLossNoResistanceTraining: 1.6,
  weightLossResistanceTraining: 2.0,
  weightGainNoResistanceTraining: 1.6,
  weightGainResistanceTraining: 1.7,
  economicProteinRangePosition: 0.0,
  balancedProteinRangePosition: 0.5,
  performanceProteinRangePosition: 1.0,
  obesityBmiThreshold: 30,
  referenceBmi: 25,
  excessWeightFraction: 0.4,
  maxProteinGramsPerDay: 220,
  maxProteinCalorieFraction: 0.35,
  fatCalorieFraction: 0.25,
  updatedAt: null,
};

export interface ProteinEnginePolicyRow {
  id: string;
  maintenance_no_rt_min: number | string;
  maintenance_rt_min: number | string;
  weight_loss_no_rt_min: number | string;
  weight_loss_rt_min: number | string;
  weight_gain_no_rt_min: number | string;
  weight_gain_rt_min: number | string;
  maintenance_no_rt: number | string;
  maintenance_rt: number | string;
  weight_loss_no_rt: number | string;
  weight_loss_rt: number | string;
  weight_gain_no_rt: number | string;
  weight_gain_rt: number | string;
  budget_economic_position: number | string;
  budget_balanced_position: number | string;
  budget_performance_position: number | string;
  obesity_bmi_threshold: number | string;
  reference_bmi: number | string;
  excess_weight_fraction: number | string;
  max_protein_g_per_day: number | string;
  max_protein_calorie_fraction: number | string;
  fat_calorie_fraction: number | string;
  updated_at?: string | null;
}

function numeric(value: number | string, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[proteinPolicy] ${field} must be numeric.`);
  }
  return parsed;
}

function inRange(value: number, min: number, max: number, field: string): number {
  if (value < min || value > max) {
    throw new Error(`[proteinPolicy] ${field} must be between ${min} and ${max}.`);
  }
  return value;
}

/**
 * Converts the editable Supabase row into the camelCase runtime contract.
 * The database has CHECK constraints too; this second validation prevents a
 * malformed/mock row from silently changing nutrition output in the browser.
 */
export function buildProteinEnginePolicy(row: ProteinEnginePolicyRow): ProteinEnginePolicy {
  const policy: ProteinEnginePolicy = {
    id: row.id,
    maintenanceNoResistanceTrainingMinimum: inRange(numeric(row.maintenance_no_rt_min, 'maintenance_no_rt_min'), 0.8, 3.5, 'maintenance_no_rt_min'),
    maintenanceResistanceTrainingMinimum: inRange(numeric(row.maintenance_rt_min, 'maintenance_rt_min'), 0.8, 3.5, 'maintenance_rt_min'),
    weightLossNoResistanceTrainingMinimum: inRange(numeric(row.weight_loss_no_rt_min, 'weight_loss_no_rt_min'), 0.8, 3.5, 'weight_loss_no_rt_min'),
    weightLossResistanceTrainingMinimum: inRange(numeric(row.weight_loss_rt_min, 'weight_loss_rt_min'), 0.8, 3.5, 'weight_loss_rt_min'),
    weightGainNoResistanceTrainingMinimum: inRange(numeric(row.weight_gain_no_rt_min, 'weight_gain_no_rt_min'), 0.8, 3.5, 'weight_gain_no_rt_min'),
    weightGainResistanceTrainingMinimum: inRange(numeric(row.weight_gain_rt_min, 'weight_gain_rt_min'), 0.8, 3.5, 'weight_gain_rt_min'),
    maintenanceNoResistanceTraining: inRange(numeric(row.maintenance_no_rt, 'maintenance_no_rt'), 0.8, 3.5, 'maintenance_no_rt'),
    maintenanceResistanceTraining: inRange(numeric(row.maintenance_rt, 'maintenance_rt'), 0.8, 3.5, 'maintenance_rt'),
    weightLossNoResistanceTraining: inRange(numeric(row.weight_loss_no_rt, 'weight_loss_no_rt'), 0.8, 3.5, 'weight_loss_no_rt'),
    weightLossResistanceTraining: inRange(numeric(row.weight_loss_rt, 'weight_loss_rt'), 0.8, 3.5, 'weight_loss_rt'),
    weightGainNoResistanceTraining: inRange(numeric(row.weight_gain_no_rt, 'weight_gain_no_rt'), 0.8, 3.5, 'weight_gain_no_rt'),
    weightGainResistanceTraining: inRange(numeric(row.weight_gain_rt, 'weight_gain_rt'), 0.8, 3.5, 'weight_gain_rt'),
    economicProteinRangePosition: inRange(numeric(row.budget_economic_position, 'budget_economic_position'), 0, 1, 'budget_economic_position'),
    balancedProteinRangePosition: inRange(numeric(row.budget_balanced_position, 'budget_balanced_position'), 0, 1, 'budget_balanced_position'),
    performanceProteinRangePosition: inRange(numeric(row.budget_performance_position, 'budget_performance_position'), 0, 1, 'budget_performance_position'),
    obesityBmiThreshold: inRange(numeric(row.obesity_bmi_threshold, 'obesity_bmi_threshold'), 25, 60, 'obesity_bmi_threshold'),
    referenceBmi: inRange(numeric(row.reference_bmi, 'reference_bmi'), 18, 35, 'reference_bmi'),
    excessWeightFraction: inRange(numeric(row.excess_weight_fraction, 'excess_weight_fraction'), 0, 1, 'excess_weight_fraction'),
    maxProteinGramsPerDay: inRange(numeric(row.max_protein_g_per_day, 'max_protein_g_per_day'), 50, 400, 'max_protein_g_per_day'),
    maxProteinCalorieFraction: inRange(numeric(row.max_protein_calorie_fraction, 'max_protein_calorie_fraction'), 0.1, 0.6, 'max_protein_calorie_fraction'),
    fatCalorieFraction: inRange(numeric(row.fat_calorie_fraction, 'fat_calorie_fraction'), 0.15, 0.45, 'fat_calorie_fraction'),
    updatedAt: row.updated_at ?? null,
  };

  const minimumPreferredPairs: Array<[number, number, string]> = [
    [policy.maintenanceNoResistanceTrainingMinimum, policy.maintenanceNoResistanceTraining, 'maintenance_no_rt'],
    [policy.maintenanceResistanceTrainingMinimum, policy.maintenanceResistanceTraining, 'maintenance_rt'],
    [policy.weightLossNoResistanceTrainingMinimum, policy.weightLossNoResistanceTraining, 'weight_loss_no_rt'],
    [policy.weightLossResistanceTrainingMinimum, policy.weightLossResistanceTraining, 'weight_loss_rt'],
    [policy.weightGainNoResistanceTrainingMinimum, policy.weightGainNoResistanceTraining, 'weight_gain_no_rt'],
    [policy.weightGainResistanceTrainingMinimum, policy.weightGainResistanceTraining, 'weight_gain_rt'],
  ];
  for (const [minimum, preferred, label] of minimumPreferredPairs) {
    if (minimum > preferred) {
      throw new Error(`[proteinPolicy] ${label}_min cannot exceed its preferred factor.`);
    }
  }

  if (!(
    policy.economicProteinRangePosition <= policy.balancedProteinRangePosition
    && policy.balancedProteinRangePosition <= policy.performanceProteinRangePosition
  )) {
    throw new Error('[proteinPolicy] budget protein positions must be ordered economic <= balanced <= performance.');
  }

  if (policy.referenceBmi >= policy.obesityBmiThreshold) {
    throw new Error('[proteinPolicy] reference_bmi must be lower than obesity_bmi_threshold.');
  }
  if (policy.maxProteinCalorieFraction + policy.fatCalorieFraction > 0.85) {
    throw new Error('[proteinPolicy] protein + fat calorie fractions must leave at least 15% for carbohydrate.');
  }

  return policy;
}
