import assert from 'node:assert/strict';
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { foodAllowedByAllergens } from '../src/utils/allergens.ts';
import { assertValidNutritionCatalog } from '../src/utils/nutritionCatalog.ts';
import { MealPlanGenerationError, generateDailyMealPlan, createMealPlanEngine, getSwapOptionsForMeal, getProfessionalMealOptions } from '../src/utils/mealPlanEngine.ts';
import { isPrescriptionPlan } from '../src/utils/mealValidation.ts';
import { calculateMacros } from '../src/utils/nutritionHelpers.ts';
const catalog = installTestNutritionCatalog();
const egg = catalog.foods.find(f=>f.id==='egg_whole');
assert(egg.allergyFlags.includes('egg'));
assert(catalog.foods.find(f=>f.id==='egg_white').allergyFlags.includes('egg'));
const bread = catalog.foods.find(f=>f.id==='sangak_bread');
for (const allergy of ['egg','sesame']) {
  assert.equal(foodAllowedByAllergens(bread,[allergy]), false, 'Missing metadata is not safe');
  for (const status of ['contains','may_contain','unknown']) assert.equal(foodAllowedByAllergens({...bread,allergenAssessment:{[allergy]:status}},[allergy]),false);
  assert.equal(foodAllowedByAllergens({...bread,allergenAssessment:{[allergy]:'assessed_absent'}},[allergy]),false);
  assert.equal(foodAllowedByAllergens({...bread,allergenAssessment:{[allergy]:'assessed_absent'},allergenAssessmentSource:'synthetic-reviewed-source'},[allergy]),true);
}
assert.equal(foodAllowedByAllergens({...egg,allergenAssessment:{egg:'assessed_absent'},allergenAssessmentSource:'synthetic'},['egg']),false, 'Declared presence wins');
assert.equal(foodAllowedByAllergens(bread,['unsupported']),false);
const targets=calculateMacros(2100,80,'weight_loss',178), prefs={vegetarianStatus:'none',allergies:[]};
const plan=generateDailyMealPlan(targets,80,prefs,false,'2026-11-04',{proteinBudgetPreference:'balanced'});
for(const allergy of ['egg','sesame']) {
  assert.throws(()=>generateDailyMealPlan(targets,80,{...prefs,allergies:[allergy]},false,'2026-11-04'), /هیچ ترکیب غذایی امنی/);
  for(const meal of plan.meals) {
    assert.throws(()=>getProfessionalMealOptions(meal,{...prefs,allergies:[allergy]},false), MealPlanGenerationError);
    for(let i=0;i<meal.components.length;i++) assert.equal(getSwapOptionsForMeal(meal,i,{...prefs,allergies:[allergy]}).length,0);
  }
}
// E04b candidate batch. These assessments are synthetic coverage fixtures.
const reviewCandidates = new Set([
  'lentils_cooked', 'boiled_potato', 'fresh_cucumber_tomato', 'olive_oil', 'low_fat_milk',
  'oats_dry', 'banana', 'ground_beef_lean', 'white_rice_cooked', 'mixed_salad',
  'apple', 'grilled_fish', 'chicken_breast', 'low_fat_yogurt', 'dates_small',
]);
const reviewed = structuredClone(catalog);
for (const food of reviewed.foods) {
  if (!reviewCandidates.has(food.id)) continue;
  food.allergenAssessment = { egg: 'assessed_absent', sesame: 'assessed_absent' };
  food.allergenAssessmentSource = 'synthetic-test-review';
}
assertValidNutritionCatalog(reviewed);
const engine = createMealPlanEngine(reviewed);
for (const allergies of [['egg'], ['sesame'], ['egg', 'sesame']]) {
  const preferences = { ...prefs, allergies };
  for (const workout of [false, true]) {
    const safe = engine.generateDailyMealPlan(targets, 80, preferences, workout, '2026-11-05', { proteinBudgetPreference: 'balanced' });
    const reopened = JSON.parse(JSON.stringify(safe));
    assert(isPrescriptionPlan(reopened));
    const assertAllowed = meal => assert(meal.components.every(c => foodAllowedByAllergens(c.foodItem, allergies)));
    let swaps = 0;
    for (const [mealIndex, meal] of reopened.meals.entries()) {
      assertAllowed(meal);
      for (const option of engine.getProfessionalMealOptions(meal, preferences, workout)) assertAllowed(option);
      for (const [componentIndex] of meal.components.entries()) {
        const options = engine.getMemberSwapOptions(reopened, mealIndex, componentIndex, preferences, { extraMeals: [], skippedSlots: [] });
        for (const option of options) {
          assert(isPrescriptionPlan(option.plan));
          option.plan.meals.forEach(assertAllowed);
          swaps++;
        }
      }
    }
    assert(swaps > 0, 'Each scenario needs an actionable member swap');
  }
}
for(const assessment of [{egg:'safe'},{unexpected:'contains'}]) {
 const bad=structuredClone(reviewed);bad.foods[0].allergenAssessment=assessment;
 assert.throws(()=>assertValidNutritionCatalog(bad),/allergen assessment/);
}
console.log('PASS egg/sesame flags, all assessment states, fail-closed legacy, generation/Pro options/swaps, declared-presence precedence and E04b synthetic coverage for all three allergy combinations on rest/workout days');
