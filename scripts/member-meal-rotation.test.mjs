import assert from 'node:assert/strict';
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import {
  generateDailyMealPlan, getMemberSwapOptions, getSwapOptionsForMeal, isPracticalMeal, rebalanceMemberDay,
} from '../src/utils/mealPlanEngine.ts';
import { calculateMacros } from '../src/utils/nutritionHelpers.ts';
import { changeMemberMeal, memberMealAlternatives, memberMealSignature } from '../src/utils/changeMemberMeal.ts';
import { swapBaselineComponent, withSwapBaseline } from '../src/utils/mealPresentation.ts';

const catalog = installTestNutritionCatalog();
const preferences = { vegetarianStatus: 'none', allergies: [] };
const emptyIntake = { skippedSlots: [], extraMeals: [] };
const initial = generateDailyMealPlan(
  calculateMacros(2100, 85, 'weight_loss', 178), 85, preferences, true, '2026-10-22-v0',
  { proteinBudgetPreference: 'balanced' },
);

function assertFeasible(plan, intake = emptyIntake) {
  const meals = [...plan.meals.filter(m => m.consumed || !intake.skippedSlots.includes(m.slot)), ...intake.extraMeals];
  const { targets } = plan;
  const deviation = (field, target) => (meals.reduce((sum, meal) => sum + meal[field], 0) - target) / target;
  const macros = [
    Math.abs(deviation('totalProtein', targets.proteinGrams)),
    Math.abs(deviation('totalCarbs', targets.carbGrams)),
    Math.abs(deviation('totalFat', targets.fatGrams)),
  ];
  assert(macros.every(diff => diff <= .1));
  const kcal = deviation('totalKcal', targets.targetCalories);
  assert(kcal <= .03 && kcal >= (macros.every(diff => diff <= .03) ? -.06 : -.05));
  assert.equal(plan.remainingTargetsUnmet, false);
}

let count = 0;
for (const [index, anchor] of initial.meals.entries()) {
  let plan = withSwapBaseline(initial, initial);
  const signatures = new Set([memberMealSignature(anchor)]);
  for (let click = 0; click < 12; click++) {
    const before = plan.meals[index];
    plan = changeMemberMeal(plan, index, preferences, emptyIntake);
    const selected = plan.meals[index];
    assert.notEqual(memberMealSignature(selected), memberMealSignature(before));
    for (let i = 0; i < plan.meals.length; i++) {
      if (i !== index) assert.equal(memberMealSignature(plan.meals[i]), memberMealSignature(initial.meals[i]));
    }
    assert(isPracticalMeal(selected.slot, selected.components));
    assert.equal(selected.totalKcal, selected.components.reduce((sum, c) => sum + c.kcal, 0));
    assert.deepEqual(plan.mealRotationAnchors[index], anchor);
    assertFeasible(plan);
    signatures.add(memberMealSignature(selected));
    plan = JSON.parse(JSON.stringify(plan));
    count++;
  }
  assert(signatures.size >= 2);
}

const restrictive = { vegetarianStatus: 'vegan', allergies: ['gluten'] };
for (const [index] of initial.meals.entries()) {
  for (const meal of memberMealAlternatives(initial, index, restrictive)) {
    for (const component of meal.components) {
      assert(!component.foodItem.excludedForVegetarian.includes('vegan'));
      assert(!component.foodItem.allergyFlags.includes('gluten'));
    }
  }
}

const rest = generateDailyMealPlan(initial.targets, 85, preferences, false, '2026-10-22-v0');
const breakfast = rest.meals[0];
const knownComponent = (id, grams, kcal) => ({ foodItem: catalog.foods.find(f => f.id === id), grams, kcal, units: 1 });
assert.equal(isPracticalMeal('breakfast', [
  knownComponent('egg_whole', 50, 78),
  knownComponent('sangak_bread', 125, 323),
  knownComponent('fresh_cucumber_tomato', 75, 13),
]), false);
const heavy = generateDailyMealPlan(calculateMacros(2550, 124, 'weight_loss', 178), 124, preferences, true, 'reported-breakfast');
for (const plan of [initial, rest, heavy]) {
  for (const meal of plan.meals) {
    assert(isPracticalMeal(meal.slot, meal.components));
    const template = catalog.mealTemplates.find(t => t.id === meal.templateId);
    template.slots.forEach((ingredient, index) => {
      if (!ingredient.dynamicUnits) assert.equal(meal.components[index].units, ingredient.fixedUnits ?? 1);
    });
  }
}

// A swap the old per-ingredient equivalence check blocked is feasible with
// small portion changes in the rest of the day.
const egg = breakfast.components.findIndex(c => c.foodItem.id === 'egg_whole');
assert(egg >= 0);
assert.equal(getSwapOptionsForMeal(breakfast, egg, preferences).find(o => o.foodItem.id === 'egg_white')?.isEquivalent, false);
const swap = getMemberSwapOptions(rest, 0, egg, preferences, emptyIntake).find(o => o.foodItem.id === 'egg_white');
assert(swap);
assertFeasible(swap.plan);
assert(swap.plan.meals.slice(1).some((m, i) => m !== rest.meals[i + 1]));
assert.equal(swap.plan.meals[0].components[egg], swap.replacementComponent);
const savedSwap = JSON.parse(JSON.stringify(withSwapBaseline(swap.plan, rest)));
assert.equal(swapBaselineComponent(savedSwap, 'breakfast', egg).foodItem.id, 'egg_whole');
const restore = getMemberSwapOptions(savedSwap, 0, egg, preferences, emptyIntake,
  swapBaselineComponent(savedSwap, 'breakfast', egg)).find(o => o.foodItem.id === 'egg_whole');
assert(restore);
assertFeasible(restore.plan);

// Check-ins stay frozen, a skipped slot stays unchanged, and equivalent
// extra intake is counted in the day instead of being written as a new slot.
const recorded = { ...rest.meals[2], consumed: true };
const locked = { ...rest, meals: rest.meals.map((m, i) => i === 2 ? recorded : m) };
const skipped = rest.meals[3];
const intake = { skippedSlots: [skipped.slot], extraMeals: [skipped] };
const edited = rebalanceMemberDay(locked, 0, swap.plan.meals[0], preferences, intake);
assert(edited);
assert.equal(edited.meals[2], recorded);
assert.equal(edited.meals[3], skipped);
assert.equal(edited.meals.length, rest.meals.length);
assertFeasible(edited, intake);
assert.throws(() => changeMemberMeal(locked, 2, preferences, intake), /ثبت‌شده/);
assert.deepEqual(getMemberSwapOptions(locked, 2, 0, preferences, intake), []);
assert.deepEqual(getMemberSwapOptions(rest, 0, egg, preferences, { ...intake, extraMeals: [recorded, recorded, recorded] }), []);
assert.deepEqual(getMemberSwapOptions(rest, 0, egg, { ...preferences, allergies: ['gluten'] }, emptyIntake), []);

console.log(`✓ ${count} rotations with JSON reload, breakfast and fixed portions, feasible food swaps, locked intake and failure cases`);
