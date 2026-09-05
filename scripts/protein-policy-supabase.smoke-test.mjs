import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildProteinEnginePolicy,
  DEFAULT_PROTEIN_ENGINE_POLICY,
} from '../src/utils/proteinPolicy.ts';
import {
  calculateMacros,
  calculateProteinReferenceWeightKg,
  resolveProteinFactorGPerKg,
  resolveProteinFactorRangeGPerKg,
} from '../src/utils/nutritionHelpers.ts';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const custom = buildProteinEnginePolicy({
  id: 'default',
  maintenance_no_rt_min: 1.15,
  maintenance_rt_min: 1.35,
  weight_loss_no_rt_min: 1.25,
  weight_loss_rt_min: 1.55,
  weight_gain_no_rt_min: 1.30,
  weight_gain_rt_min: 1.55,
  maintenance_no_rt: 1.35,
  maintenance_rt: 1.55,
  weight_loss_no_rt: 1.50,
  weight_loss_rt: 1.85,
  weight_gain_no_rt: 1.50,
  weight_gain_rt: 1.65,
  budget_economic_position: 0.10,
  budget_balanced_position: 0.60,
  budget_performance_position: 0.95,
  obesity_bmi_threshold: 32,
  reference_bmi: 24.5,
  excess_weight_fraction: 0.30,
  max_protein_g_per_day: 180,
  max_protein_calorie_fraction: 0.30,
  fat_calorie_fraction: 0.28,
  updated_at: '2026-09-05T00:00:00Z',
});

assert(Math.abs(resolveProteinFactorGPerKg('weight_loss', 'resistance', custom) - 1.835) < 0.001, 'Runtime RT factor/budget position not applied');
assert(Math.abs(resolveProteinFactorGPerKg('maintenance', 'cardio', custom) - 1.34) < 0.001, 'Runtime no-RT factor/budget position not applied');
const customLossRtRange = resolveProteinFactorRangeGPerKg('weight_loss', 'resistance', custom);
assert(customLossRtRange.minimum === 1.55, 'Runtime Loss+RT minimum factor not applied');
assert(customLossRtRange.preferred === 1.85, 'Runtime Loss+RT preferred factor not applied');

const defaultRef = calculateProteinReferenceWeightKg(125, 178, DEFAULT_PROTEIN_ENGINE_POLICY);
const customRef = calculateProteinReferenceWeightKg(125, 178, custom);
assert(customRef < defaultRef, 'Custom reference-weight curve did not affect output');

const customMacros = calculateMacros(2600, 125, 'weight_loss', 178, 'resistance', custom);
assert(customMacros.proteinGrams <= 180, 'Runtime absolute protein cap not applied');
assert(customMacros.proteinCal <= 2600 * 0.30 + 4, 'Runtime calorie-share cap not applied');
const expectedFat = Math.round((2600 * 0.28) / 9);
assert(Math.abs(customMacros.fatGrams - expectedFat) <= 1, 'Runtime fat fraction not applied');

let invalidRejected = false;
try {
  buildProteinEnginePolicy({
    id: 'default',
    maintenance_no_rt_min: 1.2,
    maintenance_rt_min: 1.4,
    weight_loss_no_rt_min: 1.3,
    weight_loss_rt_min: 1.6,
    weight_gain_no_rt_min: 1.4,
    weight_gain_rt_min: 1.6,
    maintenance_no_rt: 1.4,
    maintenance_rt: 1.6,
    weight_loss_no_rt: 1.6,
    weight_loss_rt: 2.0,
    weight_gain_no_rt: 1.6,
    weight_gain_rt: 1.7,
    budget_economic_position: 0.0,
    budget_balanced_position: 0.5,
    budget_performance_position: 1.0,
    obesity_bmi_threshold: 25,
    reference_bmi: 25,
    excess_weight_fraction: 0.4,
    max_protein_g_per_day: 220,
    max_protein_calorie_fraction: 0.35,
    fat_calorie_fraction: 0.25,
  });
} catch {
  invalidRejected = true;
}
assert(invalidRejected, 'Invalid runtime policy must fail validation');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260905_008_protein_engine_runtime_policy.sql'),
  'utf8'
);
const phase2Migration = readFileSync(
  resolve(root, 'supabase/migrations/20260905_009_protein_minimum_preferred_targets.sql'),
  'utf8'
);
const phase2bMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260905_010_protein_budget_preference.sql'),
  'utf8'
);
const hook = readFileSync(resolve(root, 'src/hooks/useProteinEnginePolicy.ts'), 'utf8');
const dashboard = readFileSync(resolve(root, 'src/components/dashboard/DashboardPage.tsx'), 'utf8');

assert(migration.includes('public.nutrition_protein_policy'), 'Protein policy table migration missing');
assert(migration.includes('weight_loss_rt'), 'Editable weight-loss RT factor missing');
assert(migration.includes('max_protein_calorie_fraction'), 'Editable calorie cap missing');
assert(migration.includes('revoke insert, update, delete'), 'Browser writes must be revoked');
assert(phase2Migration.includes('weight_loss_rt_min'), 'Editable Loss+RT minimum factor missing');
assert(phase2Migration.includes('weight_loss_rt_min <= weight_loss_rt'), 'Minimum/preferred DB range constraint missing');
assert(phase2bMigration.includes('budget_balanced_position'), 'Budget interpolation policy migration missing');
assert(phase2bMigration.includes('protein_budget_preference'), 'Per-user budget preference column missing');
assert(hook.includes(".from('nutrition_protein_policy')"), 'Runtime hook does not read Supabase policy');
assert(dashboard.includes('proteinPolicy,'), 'Dashboard does not inject runtime policy into nutrition calculation');

console.log('✅ Behtan Supabase Protein Policy smoke test passed');
console.log(`   Default 125kg reference weight: ${defaultRef.toFixed(1)} kg`);
console.log(`   Custom 125kg reference weight: ${customRef.toFixed(1)} kg`);
console.log(`   Custom loss+RT protein: ${customMacros.proteinGrams} g`);
