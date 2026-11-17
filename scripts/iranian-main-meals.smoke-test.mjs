/* Main meals use the curated recipes, including the two sourced additions. */
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { generateDailyMealPlan, MealPlanFeasibilityError } from '../src/utils/mealPlanEngine.ts';
import { calculateMacros } from '../src/utils/nutritionHelpers.ts';

installTestNutritionCatalog();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const verifiedLunches = ['ln_whole_wheat_beef_pasta', 'ln_chicken_curry_brown_rice'];
const allowedTemplates = {
  breakfast: new Set(['bk_sangak_cheese_walnut', 'bk_eggs_sangak', 'bk_mixed_eggs_sangak', 'bk_adasi_sangak']),
  lunch: new Set(['ln_chicken_rice_yogurt', 'ln_fish_rice_salad', 'ln_beef_rice_salad', 'ln_adas_polo_beef', 'ln_adas_polo_vegan', ...verifiedLunches]),
  dinner: new Set(['dn_eggs_sangak', 'dn_chicken_sangak', 'dn_adasi_sangak', 'dn_fish_potato_salad']),
};

const normal = { vegetarianStatus: 'none', allergies: [] };
const targets = calculateMacros(2200, 90, 'weight_loss', 178);
let tested = 0;

for (let day = 1; day <= 28; day++) {
  const date = `2026-09-${String(day).padStart(2, '0')}`;
  let plan;
  try {
    plan = generateDailyMealPlan(targets, 90, normal, day % 2 === 0, date);
  } catch (error) {
    if (error instanceof MealPlanFeasibilityError) continue;
    throw error;
  }
  tested++;

  for (const slot of ['breakfast', 'lunch', 'dinner']) {
    const meal = plan.meals.find((m) => m.slot === slot);
    assert(meal, `Missing ${slot}`);
    assert(allowedTemplates[slot].has(meal.templateId), `Unreviewed/legacy ${slot} template leaked: ${meal.templateId}`);

    const ids = meal.components.map((c) => c.foodItem.id);
    assert(!ids.includes('avocado_half'), `${slot} contains avocado fallback in a curated main meal`);
    assert(!ids.includes('pea_protein'), `${slot} contains pea-protein powder in a curated main meal`);
    if (slot === 'breakfast') {
      const eggWhiteUnits = meal.components.filter(c => c.foodItem.id === 'egg_white').reduce((sum, c) => sum + c.units, 0);
      assert(eggWhiteUnits <= 3.001, `Unrealistic breakfast egg-white portion: ${eggWhiteUnits}`);
    }
  }
}

assert(tested >= 20, `Too many ordinary plans became infeasible after menu cleanup: only ${tested}/28 generated`);
console.log('✅ Behtan Iranian main-meal coherence smoke test passed');
console.log(`   Ordinary 2200-kcal days tested: ${tested}`);
console.log('   Breakfast/lunch/dinner: curated recipes and sourced additions');
console.log('   Breakfast egg whites: capped at 3 units');
