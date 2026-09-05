import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import {
  calculateFullNutritionPlanWithTrace,
  calculateMacros,
  calculateProteinReferenceWeightKg,
  PROTEIN_G_PER_KG_POLICY,
  resolveProteinFactorGPerKg,
  resolveProteinFactorRangeGPerKg,
} from '../src/utils/nutritionHelpers.ts';
import { generateDailyMealPlan, MealPlanFeasibilityError } from '../src/utils/mealPlanEngine.ts';

installTestNutritionCatalog();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const approx = (a, b, tolerance = 0.6) => Math.abs(a - b) <= tolerance;

// ---------------------------------------------------------------------------
// 1) Frozen goal × training policy
// ---------------------------------------------------------------------------
assert(PROTEIN_G_PER_KG_POLICY.maintenance.noResistanceTraining === 1.4, 'Maintenance no-RT factor drifted');
assert(PROTEIN_G_PER_KG_POLICY.maintenance.resistanceTraining === 1.6, 'Maintenance RT factor drifted');
assert(PROTEIN_G_PER_KG_POLICY.weight_loss.noResistanceTraining === 1.6, 'Loss no-RT factor drifted');
assert(PROTEIN_G_PER_KG_POLICY.weight_loss.resistanceTraining === 2.0, 'Loss RT factor drifted');
assert(PROTEIN_G_PER_KG_POLICY.weight_gain.noResistanceTraining === 1.6, 'Gain no-RT factor drifted');
assert(PROTEIN_G_PER_KG_POLICY.weight_gain.resistanceTraining === 1.7, 'Gain RT factor drifted');
assert(resolveProteinFactorGPerKg('weight_loss', 'cardio') === 1.6, 'Cardio must not enter RT protein branch');
assert(resolveProteinFactorGPerKg('weight_loss', 'resistance') === 2.0, 'Resistance branch mismatch');
assert(resolveProteinFactorGPerKg('weight_loss', 'mixed') === 2.0, 'Mixed training must enter RT branch');
const lossRtRange = resolveProteinFactorRangeGPerKg('weight_loss', 'resistance');
assert(lossRtRange.minimum === 1.6, 'Loss+RT practical minimum drifted');
assert(lossRtRange.preferred === 2.0, 'Loss+RT preferred target drifted');
const maintenanceNoRtRange = resolveProteinFactorRangeGPerKg('maintenance', 'cardio');
assert(maintenanceNoRtRange.minimum === 1.2, 'Maintenance no-RT practical minimum drifted');
assert(maintenanceNoRtRange.preferred === 1.4, 'Maintenance no-RT preferred target drifted');

// ---------------------------------------------------------------------------
// 2) Protein reference-weight curve audit
// ---------------------------------------------------------------------------
assert(calculateProteinReferenceWeightKg(80, 178) === 80, 'BMI<30 should use actual body weight');
const ref100 = calculateProteinReferenceWeightKg(100, 178);
const ref125 = calculateProteinReferenceWeightKg(125, 178);
const ref150 = calculateProteinReferenceWeightKg(150, 178);
assert(ref100 < 100 && ref100 > 79, `100kg reference weight unexpected: ${ref100}`);
assert(ref125 < 125 && ref125 > ref100, `125kg reference weight unexpected: ${ref125}`);
const ref200 = calculateProteinReferenceWeightKg(200, 178);
assert(ref150 < 150 && ref150 > ref125, `150kg reference weight unexpected: ${ref150}`);
assert(ref200 < 200 && ref200 > ref150, `200kg reference weight unexpected: ${ref200}`);
assert(approx(ref125, 97.5, 0.2), `125kg/178cm reference curve drifted: ${ref125}`);

// ---------------------------------------------------------------------------
// 3) Protein target examples + calorie feasibility guardrail
// ---------------------------------------------------------------------------
const lossRt125 = calculateMacros(2600, 125, 'weight_loss', 178, 'resistance');
assert(Math.abs(lossRt125.proteinGrams - 195) <= 1, `125kg loss+RT should be ~195g, got ${lossRt125.proteinGrams}`);
const lossNoRt125 = calculateMacros(2600, 125, 'weight_loss', 178, 'cardio');
assert(Math.abs(lossNoRt125.proteinGrams - 156) <= 1, `125kg loss no-RT should be ~156g, got ${lossNoRt125.proteinGrams}`);

const lowCalHighProtein = calculateMacros(1500, 100, 'weight_loss', 175, 'resistance');
assert(lowCalHighProtein.proteinCal <= 1500 * 0.35 + 4, '35% protein calorie cap failed');
assert(lowCalHighProtein.proteinGrams <= 220, '220g absolute protein cap failed');
assert(lowCalHighProtein.carbGrams >= 0 && lowCalHighProtein.fatGrams > 0, 'Macro redistribution produced invalid carbs/fat');

const sameCaloriesNoRt = calculateMacros(2400, 80, 'weight_loss', 178, 'cardio');
const sameCaloriesRt = calculateMacros(2400, 80, 'weight_loss', 178, 'resistance');
assert(sameCaloriesRt.proteinGrams > sameCaloriesNoRt.proteinGrams, 'RT branch did not raise protein');
assert(sameCaloriesRt.carbGrams < sameCaloriesNoRt.carbGrams, 'Higher protein did not come primarily from carbohydrate remainder');
assert(Math.abs(sameCaloriesRt.fatGrams - sameCaloriesNoRt.fatGrams) <= 1, 'Protein redistribution unexpectedly changed the 25% fat anchor');

// ---------------------------------------------------------------------------
// 4) Full trace must explain the protein prescription
// ---------------------------------------------------------------------------
const traced = calculateFullNutritionPlanWithTrace({
  weightKg: 125,
  heightCm: 178,
  birthDateISO: '2002-01-15',
  gender: 'male',
  activityLevel: 'moderate',
  goal: 'weight_loss',
  weightLossSpeed: 'standard',
  trainingType: 'resistance',
  isWorkoutDay: false,
  referenceDate: new Date('2026-09-04T12:00:00Z'),
});
assert(traced.trace.resistanceTrainingUsedForProtein === true, 'Trace lost RT flag');
assert(traced.trace.proteinMinimumFactorGPerKg === 1.6, 'Trace minimum protein factor mismatch');
assert(traced.trace.proteinPreferredFactorGPerKg === 2.0, 'Trace preferred protein factor mismatch');
assert(traced.trace.proteinFactorGPerKg === 2.0, 'Active protein factor must remain preferred in Phase 2A');
assert(Math.abs(traced.trace.proteinMinimumTargetGrams - 156) <= 1, 'Trace minimum protein target mismatch');
assert(Math.abs(traced.trace.proteinPreferredTargetGrams - 195) <= 1, 'Trace preferred protein target mismatch');
assert(Math.abs(traced.trace.proteinReferenceWeightKg - 97.5) <= 0.2, 'Trace reference weight mismatch');
assert(traced.trace.finalProteinTargetGrams === traced.targets.proteinGrams, 'Trace final protein mismatch');

// ---------------------------------------------------------------------------
// 5) Meal-template protein audit under the higher RT targets
// ---------------------------------------------------------------------------
const auditWeights = [58, 80, 100, 125, 150];
const auditGoals = ['weight_loss', 'maintenance', 'weight_gain'];
const auditWorkoutDays = [false, true];
const auditPreferences = [
  { name: 'normal', value: { vegetarianStatus: 'none', allergies: [] } },
  { name: 'lacto_ovo', value: { vegetarianStatus: 'lacto_ovo', allergies: [] } },
];

let attempted = 0;
let feasible = 0;
let rejected = 0;
let maxProteinDeviation = 0;
for (const weightKg of auditWeights) {
  for (const goal of auditGoals) {
    for (const isWorkoutDay of auditWorkoutDays) {
      for (const pref of auditPreferences) {
        attempted += 1;
        const heightCm = weightKg === 58 ? 158 : 178;
        const result = calculateFullNutritionPlanWithTrace({
          weightKg,
          heightCm,
          birthDateISO: '1995-05-15',
          gender: 'male',
          activityLevel: 'moderate',
          goal,
          weightLossSpeed: 'standard',
          trainingType: 'resistance',
          isWorkoutDay,
          referenceDate: new Date('2026-09-04T12:00:00Z'),
        });

        try {
          const plan = generateDailyMealPlan(
            result.targets,
            weightKg,
            pref.value,
            isWorkoutDay,
            `protein-v3-${weightKg}-${goal}-${isWorkoutDay}-${pref.name}`
          );
          const protein = plan.meals.reduce((sum, meal) => sum + meal.totalProtein, 0);
          const dev = Math.abs(protein - result.targets.proteinGrams) / Math.max(1, result.targets.proteinGrams);
          maxProteinDeviation = Math.max(maxProteinDeviation, dev);
          assert(dev <= 0.10, `Protein v3 meal-plan deviation >10%: ${(dev * 100).toFixed(1)}%`);
          feasible += 1;
        } catch (error) {
          if (!(error instanceof MealPlanFeasibilityError)) throw error;
          // Extreme high-calorie weight-gain profiles can still fail closed on
          // portion realism. This is acceptable; the audit ensures common and
          // weight-loss RT cases remain feasible rather than forcing huge meals.
          rejected += 1;
          assert(
            weightKg === 150 && goal === 'weight_gain',
            `Unexpected Protein v3 infeasible case: ${weightKg}kg ${goal} ${pref.name}`
          );
        }
      }
    }
  }
}
assert(feasible >= 56, `Protein v3 template audit regressed: feasible=${feasible}/${attempted}`);

console.log('✅ Behtan Protein Engine v3 Phase 2A range smoke test passed');
console.log(`   Reference weight @125kg/178cm: ${ref125.toFixed(1)} kg`);
console.log(`   Loss + RT range @125kg/178cm: ~156–195 g; active=${lossRt125.proteinGrams} g`);
console.log(`   Loss + cardio/no-RT @125kg/178cm: ${lossNoRt125.proteinGrams} g protein`);
console.log(`   RT meal-template audit: ${feasible}/${attempted} feasible; ${rejected} safely rejected`);
console.log(`   Max feasible protein deviation: ${(maxProteinDeviation * 100).toFixed(2)}%`);
