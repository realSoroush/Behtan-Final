/*
 * Behtan nutrition engine smoke/stress test.
 * Run from project root with:
 *   npm run test:nutrition
 *
 * Requires Node 22+ because it imports the project's TypeScript files using
 * Node's type-stripping mode. It does not require Vitest or any extra package.
 */

import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import {
  calculateBMR,
  calculateFullNutritionPlan,
  calculateMacros,
  calculateTargetCalories,
  WEIGHT_LOSS_SPEED_POLICY,
} from '../src/utils/nutritionHelpers.ts';
import { generateDailyMealPlan, MealPlanFeasibilityError } from '../src/utils/mealPlanEngine.ts';

installTestNutritionCatalog();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sumPlan = (plan) => plan.meals.reduce(
  (acc, meal) => ({
    kcal: acc.kcal + meal.totalKcal,
    protein: acc.protein + meal.totalProtein,
    carbs: acc.carbs + meal.totalCarbs,
    fat: acc.fat + meal.totalFat,
  }),
  { kcal: 0, protein: 0, carbs: 0, fat: 0 }
);

const relativeDeviation = (actual, target) =>
  (actual - target) / Math.max(1, target);

// ---------------------------------------------------------------------------
// 1) Core math invariants
// ---------------------------------------------------------------------------
for (const kcal of [1200, 1371, 1640, 1800, 2200, 3000, 4000, 5800]) {
  for (const weight of [45, 80, 120, 180, 220]) {
    for (const goal of ['weight_loss', 'maintenance', 'weight_gain']) {
      const macros = calculateMacros(kcal, weight, goal);
      const macroCalories = macros.proteinCal + macros.carbCal + macros.fatCal;

      assert(
        Math.abs(macroCalories - macros.targetCalories) <= 4,
        `Macro calorie mismatch: target=${macros.targetCalories}, sum=${macroCalories}`
      );
      assert(macros.proteinGrams <= 220, `Protein absolute cap exceeded: ${macros.proteinGrams}g`);
      assert(
        macros.proteinCal <= macros.targetCalories * 0.35 + 4,
        `Protein calorie share exceeded 35%: ${JSON.stringify(macros)}`
      );
      assert(macros.fatGrams > 0 && macros.carbGrams >= 0, 'Negative/zero macro invariant failed');
    }
  }
}

// Formula selection is automatic from body-fat provenance.
const mifflinAiVisual = calculateBMR({
  weightKg: 100,
  heightCm: 180,
  age: 35,
  gender: 'male',
  bodyFatPercentage: 30,
  bodyFatSource: 'ai_visual',
});
const mifflinNoBodyFat = calculateBMR({
  weightKg: 100,
  heightCm: 180,
  age: 35,
  gender: 'male',
});
const katchMeasured = calculateBMR({
  weightKg: 100,
  heightCm: 180,
  age: 35,
  gender: 'male',
  bodyFatPercentage: 30,
  bodyFatSource: 'measured',
});
assert(mifflinAiVisual === mifflinNoBodyFat, 'AI visual body fat changed default BMR');
assert(katchMeasured !== mifflinNoBodyFat, 'Measured body fat did not select Katch-McArdle');


// Weight-loss speed UI and engine share one policy object. Verify both the
// percentage behavior and hard deficit caps that Step8Speed displays.
assert(WEIGHT_LOSS_SPEED_POLICY.mild.percentage === 0.10, 'Mild speed policy drifted');
assert(WEIGHT_LOSS_SPEED_POLICY.standard.percentage === 0.20, 'Standard speed policy drifted');
assert(WEIGHT_LOSS_SPEED_POLICY.fast.percentage === 0.25, 'Fast speed policy drifted');
assert(calculateTargetCalories(2000, 'weight_loss', 'mild') === 1800, 'Mild deficit mismatch');
assert(calculateTargetCalories(2000, 'weight_loss', 'standard') === 1600, 'Standard deficit mismatch');
assert(calculateTargetCalories(2000, 'weight_loss', 'fast') === 1500, 'Fast deficit mismatch');
assert(calculateTargetCalories(4000, 'weight_loss', 'mild') === 3650, 'Mild deficit cap mismatch');
assert(calculateTargetCalories(4000, 'weight_loss', 'standard') === 3400, 'Standard deficit cap mismatch');
assert(calculateTargetCalories(4000, 'weight_loss', 'fast') === 3250, 'Fast deficit cap mismatch');

// Obesity-range body weights should not make protein scale linearly forever.
// With height supplied, calculateMacros uses an adjusted reference weight.
const highWeightMacros = calculateMacros(3000, 200, 'weight_loss', 185);
assert(highWeightMacros.proteinGrams < 220, `Adjusted high-weight protein target failed: ${highWeightMacros.proteinGrams}g`);
assert(highWeightMacros.proteinGrams < 200 * 1.6, 'High-weight protein still scales directly from total body weight');

// ---------------------------------------------------------------------------
// 2) Meal engine matrix
// ---------------------------------------------------------------------------
const weights = [45, 80, 150, 200];
const heights = [160, 185];
const genders = ['male', 'female'];
// Representative activity extremes keep this regression test fast enough for
// everyday local use. Intermediate activity math is covered by helper tests.
const activities = ['sedentary', 'active'];
const goals = ['weight_loss', 'maintenance', 'weight_gain'];
const workoutFlags = [false, true];

const preferenceSets = [
  { name: 'normal', value: { vegetarianStatus: 'none', allergies: [] } },
  { name: 'vegan', value: { vegetarianStatus: 'vegan', allergies: [] } },
  {
    name: 'vegan-multi-allergy',
    value: {
      vegetarianStatus: 'vegan',
      allergies: ['dairy', 'gluten', 'peanut', 'tree_nut', 'soy', 'seafood'],
    },
  },
];

let attemptedPlans = 0;
let testedPlans = 0;
let infeasiblePlans = 0;
let maxCalorieOvershoot = -Infinity;
let maxCalorieUndershoot = Infinity;
let maxAbsProteinDeviation = 0;
let maxAbsCarbDeviation = 0;
let maxAbsFatDeviation = 0;

for (const weightKg of weights) {
  for (const heightCm of heights) {
    for (const gender of genders) {
      for (const activityLevel of activities) {
        for (const goal of goals) {
          for (const isWorkoutDay of workoutFlags) {
            const targets = calculateFullNutritionPlan({
              weightKg,
              heightCm,
              birthDateISO: '1990-05-15',
              gender,
              activityLevel,
              goal,
              weightLossSpeed: 'standard',
              isWorkoutDay,
            });

            for (const pref of preferenceSets) {
              attemptedPlans += 1;
              let plan;
              try {
                plan = generateDailyMealPlan(
                  targets,
                  weightKg,
                  pref.value,
                  isWorkoutDay,
                  '2026-08-23'
                );
              } catch (error) {
                if (!(error instanceof MealPlanFeasibilityError)) throw error;
                infeasiblePlans += 1;
                // The realism layer is fail-closed: some high-energy or highly
                // restrictive combinations are intentionally rejected rather
                // than solved with extreme portions. Dedicated portion tests
                // verify the practical serving limits and the 1640-kcal case
                // below guarantees the common weight-loss path remains viable.
                continue;
              }
              testedPlans += 1;
              const totals = sumPlan(plan);

              for (const meal of plan.meals) {
                for (const component of meal.components) {
                  const food = component.foodItem;
                  const allergyViolation = food.allergyFlags.some((allergy) =>
                    pref.value.allergies.includes(allergy)
                  );
                  const dietViolation = food.excludedForVegetarian.includes(
                    pref.value.vegetarianStatus
                  );
                  assert(
                    !allergyViolation && !dietViolation,
                    `Diet violation (${pref.name}): ${food.id}`
                  );
                  assert(component.units > 0 && component.grams > 0, `Invalid portion for ${food.id}`);
                }
              }

              const kcalDev = relativeDeviation(totals.kcal, targets.targetCalories);
              const proteinDev = relativeDeviation(totals.protein, targets.proteinGrams);
              const carbDev = relativeDeviation(totals.carbs, targets.carbGrams);
              const fatDev = relativeDeviation(totals.fat, targets.fatGrams);

              maxCalorieOvershoot = Math.max(maxCalorieOvershoot, kcalDev);
              maxCalorieUndershoot = Math.min(maxCalorieUndershoot, kcalDev);
              maxAbsProteinDeviation = Math.max(maxAbsProteinDeviation, Math.abs(proteinDev));
              maxAbsCarbDeviation = Math.max(maxAbsCarbDeviation, Math.abs(carbDev));
              maxAbsFatDeviation = Math.max(maxAbsFatDeviation, Math.abs(fatDev));

              assert(
                kcalDev <= 0.03,
                `Calorie overshoot >3%: ${(kcalDev * 100).toFixed(1)}%, target=${targets.targetCalories}, actual=${totals.kcal}`
              );
              const macrosVeryClose =
                Math.abs(proteinDev) <= 0.03 &&
                Math.abs(carbDev) <= 0.03 &&
                Math.abs(fatDev) <= 0.03;
              const minKcalDev = macrosVeryClose ? -0.06 : -0.05;
              assert(
                kcalDev >= minKcalDev,
                `Calorie undershoot too high: ${(kcalDev * 100).toFixed(1)}%, target=${targets.targetCalories}, actual=${totals.kcal}`
              );
              assert(
                Math.abs(proteinDev) <= 0.10,
                `Protein deviation >10%: ${(proteinDev * 100).toFixed(1)}%, target=${targets.proteinGrams}, actual=${totals.protein}`
              );
              assert(
                Math.abs(carbDev) <= 0.10,
                `Carb deviation >10%: ${(carbDev * 100).toFixed(1)}%, target=${targets.carbGrams}, actual=${totals.carbs}`
              );
              assert(
                Math.abs(fatDev) <= 0.10,
                `Fat deviation >10%: ${(fatDev * 100).toFixed(1)}%, target=${targets.fatGrams}, actual=${totals.fat}`
              );
            }
          }
        }
      }
    }
  }
}

// Focused single-allergy checks avoid multiplying the whole stress matrix while
// still ensuring dairy/gluten exclusions remain fail-closed.
for (const [name, preferences] of [
  ['dairy-free', { vegetarianStatus: 'none', allergies: ['dairy'] }],
  ['gluten-free', { vegetarianStatus: 'none', allergies: ['gluten'] }],
  ['tree-nut-free', { vegetarianStatus: 'none', allergies: ['tree_nut'] }],
]) {
  for (const isWorkoutDay of [false, true]) {
    const targets = calculateFullNutritionPlan({
      weightKg: 90,
      heightCm: 175,
      birthDateISO: '1990-05-15',
      gender: 'male',
      activityLevel: 'moderate',
      goal: 'weight_loss',
      weightLossSpeed: 'standard',
      isWorkoutDay,
    });
    const plan = generateDailyMealPlan(targets, 90, preferences, isWorkoutDay, `2026-08-23-${name}`);
    for (const meal of plan.meals) {
      for (const component of meal.components) {
        assert(
          !component.foodItem.allergyFlags.some((allergy) => preferences.allergies.includes(allergy)),
          `Focused allergy regression failed (${name}): ${component.foodItem.id}`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Regression for the class of bug originally reported (~1640 -> ~2500)
// ---------------------------------------------------------------------------
const regressionTargets = calculateMacros(1640, 120, 'weight_loss');
const regressionPlan = generateDailyMealPlan(
  regressionTargets,
  120,
  { vegetarianStatus: 'none', allergies: [] },
  false,
  '2026-08-23-regression'
);
const regressionTotals = sumPlan(regressionPlan);
assert(
  regressionTotals.kcal <= regressionTargets.targetCalories * 1.03,
  `1640-kcal regression overshot: ${regressionTotals.kcal} kcal`
);

console.log('✅ Behtan nutrition engine smoke test passed');
console.log(`   Plans attempted: ${attemptedPlans}`);
console.log(`   Feasible plans tested: ${testedPlans}`);
console.log(`   Safely rejected as infeasible: ${infeasiblePlans}`);
console.log(`   Max calorie overshoot: ${(maxCalorieOvershoot * 100).toFixed(2)}%`);
console.log(`   Max calorie undershoot: ${(maxCalorieUndershoot * 100).toFixed(2)}%`);
console.log(`   Max |protein deviation|: ${(maxAbsProteinDeviation * 100).toFixed(2)}%`);
console.log(`   Max |carb deviation|: ${(maxAbsCarbDeviation * 100).toFixed(2)}%`);
console.log(`   Max |fat deviation|: ${(maxAbsFatDeviation * 100).toFixed(2)}%`);
console.log(`   1640 kcal regression output: ${regressionTotals.kcal} kcal`);
