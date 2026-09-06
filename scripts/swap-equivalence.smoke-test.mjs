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
  fiber: Math.round(units * (food.fiberPerUnit ?? 0) * 10) / 10,
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
// Regression: a leaner whole-food protein must not be blocked merely because
// it reduces fat. 225 g ground beef -> 175 g chicken keeps protein close while
// lowering fat/calories. The reverse direction still fails the fat-increase
// guardrail, so this does not open a path to silent calorie/fat bombs.
// ---------------------------------------------------------------------------
const groundBeef = getSubstitutesFor('chicken_breast').find((f) => f.id === 'ground_beef_lean');
const chickenBreast = getSubstitutesFor('ground_beef_lean').find((f) => f.id === 'chicken_breast');
assert(groundBeef && chickenBreast, 'Ground-beef/chicken substitution graph is incomplete');

const beefMeal = mealFrom([component(groundBeef, 2.25)], 'lunch');
const chickenOption = getSwapOptionsForMeal(beefMeal, 0, prefs).find((o) => o.foodItem.id === 'chicken_breast');
assert(chickenOption?.isEquivalent, '225g ground beef -> chicken breast should be selectable');
assert(chickenOption.replacementComponent.grams === 175, `Expected 175g chicken, got ${chickenOption.replacementComponent.grams}g`);
assert(Math.abs(chickenOption.proteinDeviationPct) <= 12.01, `Chicken protein drift too large: ${chickenOption.proteinDeviationPct}%`);
assert(chickenOption.fatDeviationPct < 0, 'Chicken replacement should be identified as the leaner option');

const chickenMeal = mealFrom([component(chickenBreast, 1.75)], 'lunch');
const beefOption = getSwapOptionsForMeal(chickenMeal, 0, prefs).find((o) => o.foodItem.id === 'ground_beef_lean');
assert(beefOption && !beefOption.isEquivalent, 'Chicken -> much fattier ground beef must remain guarded');

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
console.log('   225g ground beef -> 175g chicken breast: selectable leaner protein swap');
console.log('   175g chicken breast -> high-fat ground beef amount: safely blocked');
console.log(`   9 egg whites -> whole egg: safely blocked (${eggOption.replacementComponent.units} eggs was closest realistic option)`);
console.log(`   200g brown rice -> ${riceOption.replacementComponent.grams}g white rice: macro-equivalent`);


// ---------------------------------------------------------------------------
// Meal-aware swap regression: breakfast Sangak should offer toast, NOT rice
// or potato. Two toast slices are acceptable for 50 g Sangak because bread
// swaps prioritize kcal + carbs and discrete slices cannot hit an exact gram.
// ---------------------------------------------------------------------------
const sangak = getSubstitutesFor('whole_grain_toast').find((f) => f.id === 'sangak_bread');
assert(sangak, 'Sangak is missing from the bread swap graph');

const breakfastBreadMeal = mealFrom([component(sangak, 1)], 'breakfast'); // 50 g Sangak
const breakfastBreadOptions = getSwapOptionsForMeal(breakfastBreadMeal, 0, prefs);
const breakfastIds = breakfastBreadOptions.map((o) => o.foodItem.id);

assert(breakfastIds.includes('whole_grain_toast'), 'Whole-grain toast should be offered for Sangak at breakfast');
assert(!breakfastIds.includes('white_rice_cooked'), 'White rice must not be offered as a breakfast bread swap');
assert(!breakfastIds.includes('boiled_potato'), 'Boiled potato must not be offered as a normal breakfast bread swap');

const toastOption = breakfastBreadOptions.find((o) => o.foodItem.id === 'whole_grain_toast');
assert(toastOption?.isEquivalent, '50 g Sangak -> whole-grain toast should be accepted as a practical bread-equivalent swap');
assert(toastOption.replacementComponent.units === 2, `Expected 2 toast slices, got ${toastOption.replacementComponent.units}`);
assert(Math.abs(toastOption.kcalDeviationPct) <= 15.01, `Toast kcal drift too large: ${toastOption.kcalDeviationPct}%`);
assert(Math.abs(toastOption.carbDeviationPct) <= 20.01, `Toast carb drift too large: ${toastOption.carbDeviationPct}%`);

// At lunch, rice-family foods remain available and same-group grain swaps rank
// ahead of culturally weaker cross-group starch alternatives.
const lunchBrownRiceOptions = getSwapOptionsForMeal(riceMeal, 0, prefs);
assert(lunchBrownRiceOptions.some((o) => o.foodItem.id === 'white_rice_cooked'), 'White rice disappeared from lunch swaps');
assert(!lunchBrownRiceOptions.some((o) => o.foodItem.id === 'whole_grain_toast'), 'Toast is not connected as a brown-rice substitute and should not be invented');

console.log('✅ Behtan meal-aware swap context passed');
console.log('   Breakfast 50g Sangak -> 2 whole-grain toast slices: allowed');
console.log('   Breakfast rice/potato suggestions: filtered out');


// ---------------------------------------------------------------------------
// Stable repeated-swap regression: after A -> B, the original A must remain
// available and restore the exact original portion. Candidate equivalence must
// continue to use A as the baseline instead of drifting from B.
// ---------------------------------------------------------------------------
const originalRiceComponent = riceMeal.components[0];
const whiteRiceAppliedMeal = riceOption.updatedMeal;
const secondPassOptions = getSwapOptionsForMeal(
  whiteRiceAppliedMeal,
  0,
  prefs,
  originalRiceComponent
);
const restoreBrownRice = secondPassOptions.find((o) => o.foodItem.id === 'brown_rice_cooked');
assert(restoreBrownRice, 'Original brown rice disappeared after swapping to white rice');
assert(restoreBrownRice.isEquivalent, 'Restoring the original food must always be allowed');
assert(restoreBrownRice.isOriginal === true, 'Original food should be explicitly marked as the restore option');
assert(
  restoreBrownRice.replacementComponent.grams === originalRiceComponent.grams,
  'Restore option must use the exact original portion instead of re-solving it'
);
assert(restoreBrownRice.kcalDeviationPct === 0, 'Original restore should have zero calorie deviation');
assert(restoreBrownRice.carbDeviationPct === 0, 'Original restore should have zero carb deviation');

const secondPassQuinoa = secondPassOptions.find((o) => o.foodItem.id === 'quinoa_cooked');
assert(secondPassQuinoa, 'Equivalent-set candidate disappeared after the first swap');
assert(
  Math.abs(secondPassQuinoa.carbDeviationPct) <= 12.01,
  `Repeated-swap quinoa was not evaluated against the original baseline: ${secondPassQuinoa.carbDeviationPct}%`
);

// ---------------------------------------------------------------------------
// Catalog-gap regression: foods in the same explicit swap group should still
// discover each other even when no pairwise food_substitutes rows exist.
// Vegetables intentionally exercise this case in the current catalog.
// ---------------------------------------------------------------------------
const saladNeighborIds = getSubstitutesFor('mixed_salad').map((food) => food.id);
assert(
  saladNeighborIds.includes('steamed_vegetables'),
  'Same-group vegetable fallback failed: steamed vegetables are missing for salad'
);
assert(
  saladNeighborIds.includes('fresh_cucumber_tomato'),
  'Same-group vegetable fallback failed: cucumber/tomato are missing for salad'
);

console.log('✅ Behtan swap stability regression passed');
console.log('   Repeated swaps preserve the original food and original macro baseline');
console.log('   Same-group foods fill safe gaps in the explicit substitute graph');
