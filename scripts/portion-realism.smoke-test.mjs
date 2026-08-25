/*
 * Behtan food/portion realism smoke test.
 * Run from project root with:
 *   npm run test:portions
 *
 * This test intentionally focuses on practical serving bounds and a compact
 * regression matrix. Nutrition target formulas are not changed here.
 */

import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { calculateFullNutritionPlan } from '../src/utils/nutritionHelpers.ts';
import { generateDailyMealPlan, MealPlanFeasibilityError } from '../src/utils/mealPlanEngine.ts';

installTestNutritionCatalog();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const relativeDeviation = (actual, target) =>
  (actual - target) / Math.max(1, target);

const sumPlan = (plan) => plan.meals.reduce(
  (acc, meal) => ({
    kcal: acc.kcal + meal.totalKcal,
    protein: acc.protein + meal.totalProtein,
    carbs: acc.carbs + meal.totalCarbs,
    fat: acc.fat + meal.totalFat,
  }),
  { kcal: 0, protein: 0, carbs: 0, fat: 0 }
);

// Hard serving ceilings. These are product realism guardrails and mirror the
// absolute limits in mealPlanEngine.ts. Preparation state matters: rice/quinoa
// are cooked; oats and soy chunks use their dry nutrition profiles.
const HARD_GRAMS = {
  brown_rice_cooked: 300,
  white_rice_cooked: 300,
  quinoa_cooked: 300,
  boiled_potato: 350,
  oats_dry: 100,
  chicken_breast: 250,
  grilled_fish: 250,
  lean_beef: 225,
  ground_beef_lean: 225,
  soy_chunks: 100,
  lentils_cooked: 250,
  low_fat_milk: 300,
  low_fat_yogurt: 250,
  low_fat_cheese: 60,
  medjool_date: 72,
};

const SOFT_GRAMS = {
  brown_rice_cooked: 225,
  white_rice_cooked: 225,
  quinoa_cooked: 225,
  boiled_potato: 300,
  oats_dry: 75,
  chicken_breast: 200,
  grilled_fish: 200,
  lean_beef: 200,
  ground_beef_lean: 200,
  soy_chunks: 75,
  lentils_cooked: 200,
  low_fat_milk: 250,
  low_fat_yogurt: 200,
  low_fat_cheese: 45,
  medjool_date: 48,
};

const MEAL_MASS_BASE = {
  breakfast: 650,
  morning_snack: 425,
  lunch: 900,
  afternoon_snack: 500,
  dinner: 800,
  night_snack: 350,
};

const mealMassLimit = (slot, slotKcalTarget) => {
  const extra = Math.max(0, slotKcalTarget - 800) * 0.35;
  const absolute = slot === 'lunch'
    ? 1050
    : slot === 'dinner'
      ? 950
      : MEAL_MASS_BASE[slot] + 150;
  return Math.min(MEAL_MASS_BASE[slot] + extra, absolute);
};

const slotKcalShare = {
  breakfast: 0.20,
  morning_snack: 0.11,
  lunch: 0.34,
  afternoon_snack: 0.12,
  dinner: 0.18,
  night_snack: 0.05,
};

const weights = [60, 100, 150, 200];
const genders = ['male', 'female'];
const activities = ['sedentary', 'active'];
const goals = ['weight_loss', 'maintenance', 'weight_gain'];
const workoutFlags = [false, true];
const preferenceSets = [
  { name: 'normal', value: { vegetarianStatus: 'none', allergies: [] } },
  {
    name: 'vegan-multi-allergy',
    value: {
      vegetarianStatus: 'vegan',
      allergies: ['dairy', 'gluten', 'peanut', 'soy', 'seafood'],
    },
  },
];

let plansAttempted = 0;
let plansTested = 0;
let infeasiblePlans = 0;
let componentsTested = 0;
let softMaxCrossings = 0;
let maxRiceQuinoa = 0;
let maxMilk = 0;
let maxMealMass = 0;
let maxCalorieOvershoot = -Infinity;
let maxCalorieUndershoot = Infinity;
let maxAbsProteinDeviation = 0;
let maxAbsCarbDeviation = 0;
let maxAbsFatDeviation = 0;
let worstCalorieCase = null;

for (const weightKg of weights) {
  for (const gender of genders) {
    for (const activityLevel of activities) {
      for (const goal of goals) {
        for (const isWorkoutDay of workoutFlags) {
          const targets = calculateFullNutritionPlan({
            weightKg,
            heightCm: gender === 'male' ? 180 : 165,
            birthDateISO: '1990-05-15',
            gender,
            activityLevel,
            goal,
            weightLossSpeed: 'standard',
            isWorkoutDay,
          });

          for (const pref of preferenceSets) {
            plansAttempted += 1;
            let plan;
            try {
              plan = generateDailyMealPlan(
                targets,
                weightKg,
                pref.value,
                isWorkoutDay,
                '2026-08-25-realism'
              );
            } catch (error) {
              if (!(error instanceof MealPlanFeasibilityError)) throw error;
              infeasiblePlans += 1;
              assert(
                targets.targetCalories >= 3000,
                `A sub-3000 kcal plan was incorrectly marked infeasible: ${targets.targetCalories} kcal`
              );
              // For unrestricted users, the current realistic catalog must
              // cover the common range below 4000 kcal without resorting to
              // extreme portions.
              if (pref.name === 'normal') {
                assert(
                  targets.targetCalories >= 4000,
                  `Normal plan below 4000 kcal was marked infeasible: ${targets.targetCalories} kcal`
                );
              }
              continue;
            }
            plansTested += 1;

            for (const meal of plan.meals) {
              const mealMass = meal.components.reduce((sum, component) => sum + component.grams, 0);
              maxMealMass = Math.max(maxMealMass, mealMass);
              const hardMealMass = mealMassLimit(
                meal.slot,
                targets.targetCalories * slotKcalShare[meal.slot]
              );
              assert(
                mealMass <= hardMealMass + 1,
                `Meal mass limit exceeded: ${meal.slot}, ${mealMass}g > ${hardMealMass.toFixed(0)}g`
              );

              for (const component of meal.components) {
                componentsTested += 1;
                const id = component.foodItem.id;
                const hard = HARD_GRAMS[id];
                const soft = SOFT_GRAMS[id];

                if (hard != null) {
                  assert(
                    component.grams <= hard + 1,
                    `Hard portion exceeded: ${id}=${component.grams}g > ${hard}g`
                  );
                }
                if (soft != null && component.grams > soft + 1) softMaxCrossings += 1;

                if (['brown_rice_cooked', 'white_rice_cooked', 'quinoa_cooked'].includes(id)) {
                  maxRiceQuinoa = Math.max(maxRiceQuinoa, component.grams);
                }
                if (id === 'low_fat_milk') maxMilk = Math.max(maxMilk, component.grams);
              }
            }

            const totals = sumPlan(plan);
            const kcalDev = relativeDeviation(totals.kcal, targets.targetCalories);
            const proteinDev = relativeDeviation(totals.protein, targets.proteinGrams);
            const carbDev = relativeDeviation(totals.carbs, targets.carbGrams);
            const fatDev = relativeDeviation(totals.fat, targets.fatGrams);

            maxCalorieOvershoot = Math.max(maxCalorieOvershoot, kcalDev);
            maxCalorieUndershoot = Math.min(maxCalorieUndershoot, kcalDev);
            maxAbsProteinDeviation = Math.max(maxAbsProteinDeviation, Math.abs(proteinDev));
            maxAbsCarbDeviation = Math.max(maxAbsCarbDeviation, Math.abs(carbDev));
            maxAbsFatDeviation = Math.max(maxAbsFatDeviation, Math.abs(fatDev));

            if (!worstCalorieCase || Math.abs(kcalDev) > Math.abs(worstCalorieCase.kcalDev)) {
              worstCalorieCase = {
                weightKg,
                gender,
                activityLevel,
                goal,
                isWorkoutDay,
                pref: pref.name,
                target: targets.targetCalories,
                actual: totals.kcal,
                kcalDev,
              };
            }

            assert(kcalDev <= 0.03, `Calorie overshoot >3%: ${(kcalDev * 100).toFixed(2)}%`);
            const macrosVeryClose =
              Math.abs(proteinDev) <= 0.03 &&
              Math.abs(carbDev) <= 0.03 &&
              Math.abs(fatDev) <= 0.03;
            const allowedUndershoot = macrosVeryClose ? -0.06 : -0.05;
            assert(
              kcalDev >= allowedUndershoot,
              `Calorie undershoot too high: ${(kcalDev * 100).toFixed(2)}%, target=${targets.targetCalories}, actual=${totals.kcal}`
            );
            assert(Math.abs(proteinDev) <= 0.10, `Protein deviation >10%: ${(proteinDev * 100).toFixed(2)}%`);
            assert(Math.abs(carbDev) <= 0.10, `Carb deviation >10%: ${(carbDev * 100).toFixed(2)}%`);
            assert(Math.abs(fatDev) <= 0.10, `Fat deviation >10%: ${(fatDev * 100).toFixed(2)}%`);
          }
        }
      }
    }
  }
}

const softCrossingRate = componentsTested === 0 ? 0 : softMaxCrossings / componentsTested;
assert(
  softCrossingRate <= 0.25,
  `Too many components above Soft Max: ${(softCrossingRate * 100).toFixed(1)}%`
);

console.log('✅ Behtan portion realism smoke test passed');
console.log(`   Plans attempted: ${plansAttempted}`);
console.log(`   Feasible plans tested: ${plansTested}`);
console.log(`   Safely rejected as infeasible: ${infeasiblePlans}`);
console.log(`   Components tested: ${componentsTested}`);
console.log(`   Max cooked rice/quinoa: ${maxRiceQuinoa}g`);
console.log(`   Max milk: ${maxMilk}ml-equivalent`);
console.log(`   Max meal mass: ${maxMealMass}g`);
console.log(`   Components above Soft Max: ${(softCrossingRate * 100).toFixed(1)}%`);
console.log(`   Max calorie overshoot: ${(maxCalorieOvershoot * 100).toFixed(2)}%`);
console.log(`   Max calorie undershoot: ${(maxCalorieUndershoot * 100).toFixed(2)}%`);
console.log(`   Max |protein deviation|: ${(maxAbsProteinDeviation * 100).toFixed(2)}%`);
console.log(`   Max |carb deviation|: ${(maxAbsCarbDeviation * 100).toFixed(2)}%`);
console.log(`   Max |fat deviation|: ${(maxAbsFatDeviation * 100).toFixed(2)}%`);
console.log(`   Worst calorie case: ${JSON.stringify(worstCalorieCase)}`);
