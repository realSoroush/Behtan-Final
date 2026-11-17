import assert from 'node:assert/strict';
import { TEST_NUTRITION_CATALOG } from './setup-test-nutrition-catalog.mjs';
import { createMealPlanEngine, getSlotTargets, MealPlanGenerationError } from '../src/utils/mealPlanEngine.ts';
import { calculateMacros } from '../src/utils/nutritionHelpers.ts';
import { historyOfMeals, mealExperiencePenalty, pricedProteinCost } from '../src/utils/mealExperience.ts';

const catalog = TEST_NUTRITION_CATALOG;
const engine = createMealPlanEngine(catalog, 'test-catalog');
const preferences = { vegetarianStatus: 'none', allergies: [] };
const targets = calculateMacros(2050, 85, 'weight_loss', 178);
const date = '2026-11-17';
const regularSlots = ['breakfast', 'lunch', 'dinner'];
const standardSlots = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'night_snack'];

const defaultWorkout = engine.generateDailyMealPlan(targets, 85, preferences, true, date);
assert.deepEqual(defaultWorkout.meals.map(meal => meal.slot), [
  ...standardSlots.slice(0, 4), 'post_workout', ...standardSlots.slice(4),
]);
assert.deepEqual(engine.generateDailyMealPlan(targets, 85, preferences, false, date).meals.map(meal => meal.slot), standardSlots);
const scoped = { mealStructure: { regularSlots, includePostWorkout: false } };
const withoutPost = engine.generateDailyMealPlan(targets, 85, preferences, true, date, scoped);
assert.deepEqual(withoutPost.meals.map(meal => meal.slot), regularSlots);
assert.equal(withoutPost.isWorkoutDay, true);
assert.deepEqual(withoutPost.targets, targets);
assert.equal(withoutPost.remainingTargetsUnmet, false);
const lockedPost = { ...defaultWorkout.meals.find(meal => meal.slot === 'post_workout'), consumed: true };
const withLock = engine.generateDailyMealPlan(targets, 85, preferences, true, date, { ...scoped, lockedMeals: [lockedPost] });
assert.deepEqual(withLock.meals.find(meal => meal.slot === 'post_workout'), lockedPost);
assert.throws(() => engine.generateDailyMealPlan(targets, 85, preferences, true, date, {
  ...scoped, lockedMeals: [defaultWorkout.meals.find(meal => meal.slot === 'morning_snack')],
}), error => error instanceof MealPlanGenerationError && error.slot === 'morning_snack');
for (const slots of [['breakfast', 'dinner'], [...regularSlots, 'lunch'], [...regularSlots, 'post_workout']]) {
  assert.throws(() => engine.generateDailyMealPlan(targets, 85, preferences, true, date, {
    mealStructure: { regularSlots: slots, includePostWorkout: true },
  }), TypeError);
}

for (const slots of [regularSlots, ['breakfast', 'lunch', 'afternoon_snack', 'dinner'], standardSlots.slice(0, 5)]) {
  for (const isWorkout of [true, false]) {
    const plan = engine.generateDailyMealPlan(targets, 85, preferences, isWorkout, date, {
      mealStructure: { regularSlots: slots, includePostWorkout: true },
    });
    const expected = [...slots];
    if (isWorkout) expected.splice(expected.indexOf('dinner'), 0, 'post_workout');
    assert.deepEqual(plan.meals.map(meal => meal.slot), expected);
    assert.deepEqual(plan.targets, targets);
    assert.equal(plan.remainingTargetsUnmet, false);
    const sumShares = slots.reduce((sum, slot) => sum + getSlotTargets(slot, targets, slots).protein, 0);
    assert(Math.abs(sumShares - targets.proteinGrams) < 1e-8);
  }
}

const days = Array.from({ length: 7 }, (_, index) => ({ date: `2026-11-${17 + index}`, targets, isWorkoutDay: true }));
const wheyId = 'pw_whey_water';
const limited = createMealPlanEngine({
  ...catalog,
  mealTemplates: catalog.mealTemplates.map(template => template.id === wheyId ? { ...template, maxPerWeek: 1 } : template),
}, 'weekly-test');
const week = limited.generateWeeklyMealPlans(days, 85, preferences);
assert.equal(week.length, 7);
assert.equal(week.flatMap(plan => plan.meals).filter(meal => meal.templateId === wheyId).length, 1);
assert(week.every(plan => plan.remainingTargetsUnmet === false && plan.nutritionContext.revision === 'weekly-test'));
assert.deepEqual(limited.generateWeeklyMealPlans(days, 85, preferences), week);
const withFutureLock = limited.generateWeeklyMealPlans([days[0], { ...days[1], lockedMeals: [lockedPost] }], 85, preferences);
assert(!withFutureLock[0].meals.some(meal => meal.templateId === wheyId));
assert.deepEqual(withFutureLock[1].meals.find(meal => meal.slot === 'post_workout'), lockedPost);
assert.throws(() => limited.generateWeeklyMealPlans([days[0], days[2]], 85, preferences), RangeError);
assert.throws(() => limited.generateWeeklyMealPlans([{ ...days[0], date: '2026-02-30' }], 85, preferences), RangeError);

const cappedBreakfast = createMealPlanEngine({
  ...catalog,
  mealTemplates: catalog.mealTemplates.map(template => template.slot === 'breakfast' ? { ...template, maxPerWeek: 0 } : template),
});
assert.throws(() => cappedBreakfast.generateWeeklyMealPlans([days[0]], 85, preferences),
  error => error instanceof MealPlanGenerationError && error.slot === 'breakfast' && error.reason === 'weekly-limit');
assert.equal(mealExperiencePenalty(withoutPost.meals, { previousWeek: historyOfMeals(withoutPost.meals) }),
  mealExperiencePenalty(withoutPost.meals) + 2 * withoutPost.meals.length);

const quoteFoods = catalog.foods.map(food => ({ ...food, preparationState: food.preparationState ?? 'ready' }));
const priceEngine = createMealPlanEngine({ ...catalog, foods: quoteFoods });
const economic = { proteinBudgetPreference: 'economic' };
const base = priceEngine.generateDailyMealPlan(targets, 85, preferences, false, date, economic);
const expensiveIds = new Set(base.meals.find(meal => meal.slot === 'lunch').components.filter(c => c.foodItem.role === 'protein').map(c => c.foodItem.id));
const prices = {
  region: 'fixture-region', observedOn: date, validThrough: date,
  quotes: Object.fromEntries(quoteFoods.map(food => [food.id, {
    source: 'fixture', preparationState: food.preparationState, tomanPerKg: expensiveIds.has(food.id) ? 1_000_000 : 100_000,
  }])),
};
const priced = priceEngine.generateDailyMealPlan(targets, 85, preferences, false, date, { ...economic, proteinPrices: prices });
assert(pricedProteinCost(priced.meals, date, prices) < pricedProteinCost(base.meals, date, prices));
assert.equal(priced.remainingTargetsUnmet, false);
assert.deepEqual(priced.targets, targets);
for (const invalidPrices of [{ ...prices, observedOn: '2026-11-18' }, { ...prices, validThrough: '2026-11-16' }, { ...prices, quotes: {} }]) {
  assert.equal(pricedProteinCost(base.meals, date, invalidPrices), undefined);
  assert.deepEqual(priceEngine.generateDailyMealPlan(targets, 85, preferences, false, date,
    { ...economic, proteinPrices: invalidPrices }), base);
}
const incompatible = { ...prices, quotes: Object.fromEntries(quoteFoods.map(food => [food.id, {
  ...prices.quotes[food.id], preparationState: food.preparationState === 'raw' ? 'cooked' : 'raw',
}])) };
assert.equal(pricedProteinCost(base.meals, date, incompatible), undefined);

console.log('PASS flexible slots, optional workout recovery, locked intake, weekly caps, determinism and sourced-price ranking');
