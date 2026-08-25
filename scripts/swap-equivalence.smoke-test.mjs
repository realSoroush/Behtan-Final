/*
 * Regression tests for Behtan's direct food-swap equivalence layer.
 * The key invariant: swapping one component must not silently re-optimize
 * unrelated foods or destroy the defining macro of the replaced component.
 */
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import {
  getSubstitutesFor,
  getSwapOptionsForMeal,
  swapComponentInMeal,
} from '../src/utils/mealPlanEngine.ts';

installTestNutritionCatalog();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const component = (food, units) => ({
  foodItem: food,
  units,
  grams: Math.round(units * food.gramsPerUnit),
  kcal: Math.round(units * food.kcalPerUnit),
  protein: Math.round(units * food.proteinPerUnit * 10) / 10,
  carbs: Math.round(units * food.carbsPerUnit * 10) / 10,
  fat: Math.round(units * food.fatPerUnit * 10) / 10,
});

const mealFrom = (components, slot = 'breakfast') => {
  const totals = components.reduce((a, c) => ({
    kcal: a.kcal + c.kcal,
    protein: a.protein + c.protein,
    carbs: a.carbs + c.carbs,
    fat: a.fat + c.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    slot,
    label: 'تست',
    templateId: 'test',
    templateName: 'تست',
    components,
    totalKcal: Math.round(totals.kcal),
    totalProtein: Math.round(totals.protein * 10) / 10,
    totalCarbs: Math.round(totals.carbs * 10) / 10,
    totalFat: Math.round(totals.fat * 10) / 10,
    consumed: false,
  };
};

const prefs = { vegetarianStatus: 'none', allergies: [] };

// ---------------------------------------------------------------------------
// Regression: 9 egg whites must NEVER become 1 whole egg and be accepted.
// ---------------------------------------------------------------------------
const eggWhite = getSubstitutesFor('egg_whole').find((f) => f.id === 'egg_white');
const eggWhole = getSubstitutesFor('egg_white').find((f) => f.id === 'egg_whole');
assert(eggWhite && eggWhole, 'Egg substitution graph is incomplete');

const eggMeal = mealFrom([component(eggWhite, 9)]);
const eggOption = getSwapOptionsForMeal(eggMeal, 0, prefs).find((o) => o.foodItem.id === 'egg_whole');
assert(eggOption, 'Whole egg option disappeared from the swap UI');
assert(!eggOption.isEquivalent, '9 egg whites were incorrectly accepted as directly equivalent to whole eggs');
assert(eggOption.replacementComponent.units !== 1, 'Regression: 9 egg whites collapsed to 1 whole egg again');

const safeWrapperResult = swapComponentInMeal(
  eggMeal,
  0,
  eggWhole,
  { kcal: eggMeal.totalKcal, protein: eggMeal.totalProtein, carbs: eggMeal.totalCarbs, fat: eggMeal.totalFat }
);
assert(safeWrapperResult.components[0].foodItem.id === 'egg_white', 'Unsafe egg swap was applied despite failing equivalence');

// ---------------------------------------------------------------------------
// A normal starch swap should remain available and preserve carbs/calories.
// ---------------------------------------------------------------------------
const brownRice = getSubstitutesFor('white_rice_cooked').find((f) => f.id === 'brown_rice_cooked');
const whiteRice = getSubstitutesFor('brown_rice_cooked').find((f) => f.id === 'white_rice_cooked');
assert(brownRice && whiteRice, 'Rice substitution graph is incomplete');

const riceMeal = mealFrom([component(brownRice, 2)], 'lunch'); // 200 g cooked brown rice
const riceOption = getSwapOptionsForMeal(riceMeal, 0, prefs).find((o) => o.foodItem.id === 'white_rice_cooked');
assert(riceOption?.isEquivalent, 'Brown-rice -> white-rice swap should be macro-equivalent');
assert(Math.abs(riceOption.carbDeviationPct) <= 12.01, `Rice carb drift too large: ${riceOption.carbDeviationPct}%`);
assert(Math.abs(riceOption.kcalDeviationPct) <= 25.01, `Rice kcal drift too large: ${riceOption.kcalDeviationPct}%`);

console.log('✅ Behtan food-swap equivalence smoke test passed');
console.log(`   9 egg whites -> whole egg: safely blocked (${eggOption.replacementComponent.units} eggs was closest realistic option)`);
console.log(`   200g brown rice -> ${riceOption.replacementComponent.grams}g white rice: macro-equivalent`);
