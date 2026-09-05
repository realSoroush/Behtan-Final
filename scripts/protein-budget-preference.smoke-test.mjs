import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateFullNutritionPlanWithTrace,
  resolveProteinBudgetPosition,
  resolveProteinFactorGPerKg,
} from '../src/utils/nutritionHelpers.ts';
import {
  buildProteinEnginePolicy,
  DEFAULT_PROTEIN_ENGINE_POLICY,
} from '../src/utils/proteinPolicy.ts';
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { generateDailyMealPlan, MealPlanFeasibilityError } from '../src/utils/mealPlanEngine.ts';

installTestNutritionCatalog();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const approx = (a, b, tolerance = 0.6) => Math.abs(a - b) <= tolerance;

// Default positions: Economic=min, Balanced=midpoint, Performance=preferred.
assert(resolveProteinBudgetPosition('economic') === 0, 'Economic position drifted');
assert(resolveProteinBudgetPosition('balanced') === 0.5, 'Balanced position drifted');
assert(resolveProteinBudgetPosition('performance') === 1, 'Performance position drifted');

assert(resolveProteinFactorGPerKg('weight_loss', 'resistance', DEFAULT_PROTEIN_ENGINE_POLICY, 'economic') === 1.6, 'Economic Loss+RT must use minimum endpoint');
assert(resolveProteinFactorGPerKg('weight_loss', 'resistance', DEFAULT_PROTEIN_ENGINE_POLICY, 'balanced') === 1.8, 'Balanced Loss+RT must use midpoint');
assert(resolveProteinFactorGPerKg('weight_loss', 'resistance', DEFAULT_PROTEIN_ENGINE_POLICY, 'performance') === 2.0, 'Performance Loss+RT must use preferred endpoint');

const base = {
  weightKg: 125,
  heightCm: 178,
  birthDateISO: '2002-01-15',
  gender: 'male',
  activityLevel: 'moderate',
  goal: 'weight_loss',
  weightLossSpeed: 'standard',
  trainingType: 'resistance',
  isWorkoutDay: false,
  referenceDate: new Date('2026-09-05T12:00:00Z'),
};

const economic = calculateFullNutritionPlanWithTrace({ ...base, proteinBudgetPreference: 'economic' });
const balanced = calculateFullNutritionPlanWithTrace({ ...base, proteinBudgetPreference: 'balanced' });
const performance = calculateFullNutritionPlanWithTrace({ ...base, proteinBudgetPreference: 'performance' });
const legacy = calculateFullNutritionPlanWithTrace(base);

assert(approx(economic.targets.proteinGrams, 156, 1), `Economic target unexpected: ${economic.targets.proteinGrams}`);
assert(approx(balanced.targets.proteinGrams, 176, 1), `Balanced target unexpected: ${balanced.targets.proteinGrams}`);
assert(approx(performance.targets.proteinGrams, 195, 1), `Performance target unexpected: ${performance.targets.proteinGrams}`);
assert(legacy.targets.proteinGrams === performance.targets.proteinGrams, 'Legacy/null preference must preserve prior performance target');
assert(economic.targets.carbGrams > balanced.targets.carbGrams, 'Economic mode should leave more calories for carbohydrate than balanced');
assert(balanced.targets.carbGrams > performance.targets.carbGrams, 'Balanced mode should leave more calories for carbohydrate than performance');
assert(economic.targets.fatGrams === performance.targets.fatGrams, 'Budget preference must not move the fat anchor');
assert(balanced.trace.proteinBudgetPreference === 'balanced', 'Trace lost budget preference');
assert(balanced.trace.proteinBudgetPosition === 0.5, 'Trace lost budget interpolation position');
assert(approx(balanced.trace.proteinFactorGPerKg, 1.8, 0.001), 'Trace active factor mismatch');

// Supabase runtime positions must be able to tune interpolation without code changes.
const customPolicy = buildProteinEnginePolicy({
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
  budget_economic_position: 0.15,
  budget_balanced_position: 0.65,
  budget_performance_position: 0.95,
  obesity_bmi_threshold: 30,
  reference_bmi: 25,
  excess_weight_fraction: 0.4,
  max_protein_g_per_day: 220,
  max_protein_calorie_fraction: 0.35,
  fat_calorie_fraction: 0.25,
});
assert(approx(resolveProteinFactorGPerKg('weight_loss', 'resistance', customPolicy, 'balanced'), 1.86, 0.001), 'Custom Supabase balanced position did not affect factor');

let orderingRejected = false;
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
    budget_economic_position: 0.7,
    budget_balanced_position: 0.4,
    budget_performance_position: 1.0,
    obesity_bmi_threshold: 30,
    reference_bmi: 25,
    excess_weight_fraction: 0.4,
    max_protein_g_per_day: 220,
    max_protein_calorie_fraction: 0.35,
    fat_calorie_fraction: 0.25,
  });
} catch {
  orderingRejected = true;
}
assert(orderingRejected, 'Invalid budget position ordering must fail runtime validation');


// Meal realization audit across all budget modes. The budget selector must not
// create a macro target that the existing human/portion-realistic templates
// cannot realize for normal weight-loss RT profiles.
const auditModes = ['economic', 'balanced', 'performance'];
const auditWeights = [58, 80, 100, 125];
let mealAuditFeasible = 0;
let maxProteinDeviation = 0;
for (const weightKg of auditWeights) {
  for (const mode of auditModes) {
    const heightCm = weightKg === 58 ? 158 : 178;
    const result = calculateFullNutritionPlanWithTrace({
      weightKg,
      heightCm,
      birthDateISO: '1995-05-15',
      gender: 'male',
      activityLevel: 'moderate',
      goal: 'weight_loss',
      weightLossSpeed: 'standard',
      trainingType: 'resistance',
      proteinBudgetPreference: mode,
      isWorkoutDay: false,
      referenceDate: new Date('2026-09-05T12:00:00Z'),
    });
    try {
      const plan = generateDailyMealPlan(
        result.targets,
        weightKg,
        { vegetarianStatus: 'none', allergies: [] },
        false,
        `protein-budget-${weightKg}-${mode}`
      );
      const protein = plan.meals.reduce((sum, meal) => sum + meal.totalProtein, 0);
      const deviation = Math.abs(protein - result.targets.proteinGrams) / Math.max(1, result.targets.proteinGrams);
      maxProteinDeviation = Math.max(maxProteinDeviation, deviation);
      assert(deviation <= 0.10, `Budget meal plan protein deviation >10% for ${weightKg}kg/${mode}: ${(deviation * 100).toFixed(1)}%`);
      mealAuditFeasible += 1;
    } catch (error) {
      if (error instanceof MealPlanFeasibilityError) {
        throw new Error(`Unexpected budget-mode infeasibility for ${weightKg}kg/${mode}: ${error.message}`);
      }
      throw error;
    }
  }
}
assert(mealAuditFeasible === auditWeights.length * auditModes.length, 'Budget mode meal audit incomplete');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const step7 = readFileSync(resolve(root, 'src/components/onboarding/Step7Dietary.tsx'), 'utf8');
const dashboard = readFileSync(resolve(root, 'src/components/dashboard/DashboardPage.tsx'), 'utf8');
const wizard = readFileSync(resolve(root, 'src/components/onboarding/OnboardingWizard.tsx'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260905_010_protein_budget_preference.sql'), 'utf8');

assert(step7.includes("value: 'economic'"), 'Economic onboarding option missing');
assert(step7.includes("value: 'balanced'"), 'Balanced onboarding option missing');
assert(step7.includes("value: 'performance'"), 'Performance onboarding option missing');
assert(step7.includes('disabled={!data.proteinBudgetPreference}'), 'Budget choice is not required for new onboarding');
assert(wizard.includes('protein_budget_preference: data.proteinBudgetPreference'), 'Final onboarding save does not persist budget preference');
assert(dashboard.includes("profile.protein_budget_preference ?? 'performance'"), 'Legacy profile compatibility fallback missing');
assert(migration.includes("in ('economic', 'balanced', 'performance')"), 'User preference DB constraint missing');
assert(migration.includes('budget_positions_order_check'), 'Budget policy ordering DB constraint missing');

console.log('✅ Behtan Protein Budget Preference Phase 2B smoke test passed');
console.log(`   Loss+RT @125kg/178cm: Economic=${economic.targets.proteinGrams}g, Balanced=${balanced.targets.proteinGrams}g, Performance=${performance.targets.proteinGrams}g`);
console.log('   Legacy profile fallback: performance (prior output preserved)');
console.log('   Runtime budget positions: Supabase-editable');
console.log(`   Meal realization audit: ${mealAuditFeasible}/${auditWeights.length * auditModes.length} feasible; max protein deviation ${(maxProteinDeviation * 100).toFixed(2)}%`);
