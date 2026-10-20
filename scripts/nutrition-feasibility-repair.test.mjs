import assert from "node:assert/strict";
import { installTestNutritionCatalog } from "./setup-test-nutrition-catalog.mjs";
import { calculateFullNutritionPlanWithTrace } from "../src/utils/nutritionHelpers.ts";
import {
  generateDailyMealPlan,
  isPracticalMeal,
  MealPlanFeasibilityError,
} from "../src/utils/mealPlanEngine.ts";
const catalog = installTestNutritionCatalog();
const targets = calculateFullNutritionPlanWithTrace({
  weightKg: 125,
  heightCm: 178,
  birthDateISO: "1995-05-15",
  gender: "male",
  activityLevel: "moderate",
  goal: "weight_gain",
  trainingType: "resistance",
  isWorkoutDay: false,
  referenceDate: new Date("2026-09-04T12:00:00Z"),
}).targets;
assert.equal(targets.targetCalories, 4288, "Repair cannot change the target");
const prefs = { vegetarianStatus: "lacto_ovo", allergies: [] };
const seed = "protein-v3-125-weight_gain-false-lacto_ovo";
const plan = generateDailyMealPlan(targets, 125, prefs, false, seed);
assert.deepEqual(
  generateDailyMealPlan(targets, 125, prefs, false, seed),
  plan,
  "Repair deterministic",
);
const sums = plan.meals.reduce(
  (s, m) => ({
    kcal: s.kcal + m.totalKcal,
    protein: s.protein + m.totalProtein,
    carbs: s.carbs + m.totalCarbs,
    fat: s.fat + m.totalFat,
  }),
  { kcal: 0, protein: 0, carbs: 0, fat: 0 },
);
assert(
  sums.kcal >= targets.targetCalories * 0.95 &&
    sums.kcal <= targets.targetCalories * 1.03,
);
for (const [actual, target] of [
  [sums.protein, targets.proteinGrams],
  [sums.carbs, targets.carbGrams],
  [sums.fat, targets.fatGrams],
])
  assert(Math.abs(actual - target) / target <= 0.1);
for (const meal of plan.meals) {
  assert(isPracticalMeal(meal.slot, meal.components));
  for (const c of meal.components) {
    const rule = catalog.portionRules[c.foodItem.id];
    assert(rule, `Missing portion rule: ${c.foodItem.id}`);
    assert(c.units <= rule.hardMaxUnits + 1e-9);
    assert(c.units >= rule.minUnits - 1e-9);
    assert(!c.foodItem.excludedForVegetarian.includes("lacto_ovo"));
  }
}
const impossible = { ...targets, targetCalories: 20000, carbGrams: 4000 };
assert.throws(
  () => generateDailyMealPlan(impossible, 125, prefs, false, seed),
  MealPlanFeasibilityError,
  "Infeasible targets must still fail closed",
);
console.log(
  "PASS: regression repaired with unchanged targets, deterministic output, practical portions, dietary constraints and fail-closed envelope",
);
console.log(JSON.stringify(sums));
