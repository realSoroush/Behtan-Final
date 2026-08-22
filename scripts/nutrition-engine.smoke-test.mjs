/*
 * Behtan nutrition engine smoke/stress test.
 * Run from project root with:
 *   npm run test:nutrition
 *
 * Requires Node 22+ because it imports the project's TypeScript files using
 * Node's type-stripping mode. It does not require Vitest or any extra package.
 */

import {
  calculateBMR,
  calculateFullNutritionPlan,
  calculateMacros,
} from '../src/utils/nutritionHelpers.ts';
import { generateDailyMealPlan } from '../src/utils/mealPlanEngine.ts';

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

// Body-fat estimate must NOT silently change BMR unless explicitly opted in.
const mifflinDefault = calculateBMR({
  weightKg: 100,
  heightCm: 180,
  age: 35,
  gender: 'male',
  bodyFatPercentage: 30,
});
const mifflinNoBodyFat = calculateBMR({
  weightKg: 100,
  heightCm: 180,
  age: 35,
  gender: 'male',
});
const katchOptIn = calculateBMR({
  weightKg: 100,
  heightCm: 180,
  age: 35,
  gender: 'male',
  bodyFatPercentage: 30,
  useBodyFatFormula: true,
});
assert(mifflinDefault === mifflinNoBodyFat, 'Unverified body fat changed default BMR');
assert(katchOptIn !== mifflinNoBodyFat, 'Explicit Katch-McArdle opt-in did not change BMR');

// ---------------------------------------------------------------------------
// 2) Meal engine matrix
// ---------------------------------------------------------------------------
const weights = [45, 80, 150, 200];
const heights = [160, 185];
const genders = ['male', 'female'];
const activities = ['sedentary', 'active'];
const goals = ['weight_loss', 'maintenance', 'weight_gain'];
const workoutFlags = [false, true];

const preferenceSets = [
  { name: 'normal', value: { vegetarianStatus: 'none', allergies: [] } },
  { name: 'vegan', value: { vegetarianStatus: 'vegan', allergies: [] } },
  { name: 'dairy-free', value: { vegetarianStatus: 'none', allergies: ['dairy'] } },
  { name: 'gluten-free', value: { vegetarianStatus: 'none', allergies: ['gluten'] } },
  {
    name: 'vegan-multi-allergy',
    value: {
      vegetarianStatus: 'vegan',
      allergies: ['dairy', 'gluten', 'peanut', 'soy', 'seafood'],
    },
  },
];

let testedPlans = 0;
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
              testedPlans += 1;
              const plan = generateDailyMealPlan(
                targets,
                weightKg,
                pref.value,
                isWorkoutDay,
                '2026-08-23'
              );
              const totals = sumPlan(plan);

              // Diet/allergy constraints must never be relaxed as a fallback.
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

              // Primary engine invariant: never reproduce the old +50% calorie overshoot.
              assert(
                kcalDev <= 0.03,
                `Calorie overshoot >3%: ${(kcalDev * 100).toFixed(1)}%, target=${targets.targetCalories}, actual=${totals.kcal}`
              );

              // Across this intentionally broad 45–200kg matrix, portion constraints
              // should still keep daily energy reasonably close to the target.
              assert(
                kcalDev >= -0.07,
                `Calorie undershoot >7%: ${(kcalDev * 100).toFixed(1)}%, target=${targets.targetCalories}, actual=${totals.kcal}`
              );


              assert(
                totals.protein <= targets.proteinGrams * 1.25,
                `Protein overshoot >25%: target=${targets.proteinGrams}, actual=${totals.protein}`
              );
              assert(
                totals.carbs <= targets.carbGrams * 1.25,
                `Carb overshoot >25%: target=${targets.carbGrams}, actual=${totals.carbs}`
              );
              assert(
                totals.fat <= targets.fatGrams * 1.25,
                `Fat overshoot >25%: target=${targets.fatGrams}, actual=${totals.fat}`
              );
            }
          }
        }
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
console.log(`   Plans tested: ${testedPlans}`);
console.log(`   Max calorie overshoot: ${(maxCalorieOvershoot * 100).toFixed(2)}%`);
console.log(`   Max calorie undershoot: ${(maxCalorieUndershoot * 100).toFixed(2)}%`);
console.log(`   Max |protein deviation|: ${(maxAbsProteinDeviation * 100).toFixed(2)}%`);
console.log(`   Max |carb deviation|: ${(maxAbsCarbDeviation * 100).toFixed(2)}%`);
console.log(`   Max |fat deviation|: ${(maxAbsFatDeviation * 100).toFixed(2)}%`);
console.log(`   1640 kcal regression output: ${regressionTotals.kcal} kcal`);
