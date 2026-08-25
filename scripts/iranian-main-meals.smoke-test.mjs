/* Main-meal cultural-coherence regression test. */
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { generateDailyMealPlan, MealPlanFeasibilityError } from '../src/utils/mealPlanEngine.ts';
import { calculateMacros } from '../src/utils/nutritionHelpers.ts';

installTestNutritionCatalog();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const allowedTemplates = {
  breakfast: new Set(['bk_sangak_cheese_walnut', 'bk_eggs_sangak', 'bk_mixed_eggs_sangak', 'bk_adasi_sangak']),
  lunch: new Set(['ln_chicken_rice_yogurt', 'ln_fish_rice_salad', 'ln_beef_rice_salad', 'ln_adas_polo_beef', 'ln_adas_polo_vegan']),
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
    assert(allowedTemplates[slot].has(meal.templateId), `Non-Iranian/legacy ${slot} template leaked: ${meal.templateId}`);

    const ids = meal.components.map((c) => c.foodItem.id);
    assert(!ids.includes('avocado_half'), `${slot} contains avocado fallback in a default Iranian main meal`);
    assert(!ids.includes('pea_protein'), `${slot} contains pea-protein powder in a default Iranian main meal`);
    const eggWhites = meal.components.find((c) => c.foodItem.id === 'egg_white');
    assert(!eggWhites || eggWhites.units <= 6, `Unrealistic egg-white portion returned: ${eggWhites?.units}`);
  }
}

assert(tested >= 20, `Too many ordinary plans became infeasible after menu cleanup: only ${tested}/28 generated`);
console.log('✅ Behtan Iranian main-meal coherence smoke test passed');
console.log(`   Ordinary 2200-kcal days tested: ${tested}`);
console.log('   Breakfast/lunch/dinner: only curated Iranian templates');
console.log('   Egg whites: hard-capped at 6 per meal');
