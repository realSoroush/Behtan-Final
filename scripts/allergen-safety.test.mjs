import assert from 'node:assert/strict';
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { foodAllowedByAllergens } from '../src/utils/allergens.ts';
import { assertValidNutritionCatalog } from '../src/utils/nutritionCatalog.ts';
import { MealPlanGenerationError, generateDailyMealPlan, configureNutritionCatalog, getSwapOptionsForMeal, getProfessionalMealOptions } from '../src/utils/mealPlanEngine.ts';
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
// Synthetic assessments exercise generation without claiming production review.
const reviewed=structuredClone(catalog);
for(const food of reviewed.foods) {
  food.allergenAssessment={egg:food.allergyFlags.includes('egg')?'contains':'assessed_absent',sesame:food.id==='sangak_bread'?'may_contain':'assessed_absent'};
  food.allergenAssessmentSource='synthetic-test-review';
}
assertValidNutritionCatalog(reviewed);configureNutritionCatalog(reviewed);
let generated=0;
for(const workout of [false,true]) {
  try {
    const safe=generateDailyMealPlan(targets,80,{...prefs,allergies:['egg','sesame']},workout,'2026-11-04',{proteinBudgetPreference:'balanced'});
    generated++;
    assert(safe.meals.every(m=>m.components.every(c=>foodAllowedByAllergens(c.foodItem,['egg','sesame']))));
  } catch(error) { if(!(error instanceof MealPlanGenerationError)) throw error; console.log('SAFE_SEARCH_REJECTION',workout,error.slot); }
}
assert(generated > 0, 'At least one reviewed-catalog plan must be exercised');
for(const assessment of [{egg:'safe'},{unexpected:'contains'}]) {
 const bad=structuredClone(reviewed);bad.foods[0].allergenAssessment=assessment;
 assert.throws(()=>assertValidNutritionCatalog(bad),/allergen assessment/);
}
console.log('PASS egg/sesame flags, all assessment states, fail-closed legacy, generation/Pro options/swaps, declared-presence precedence and synthetic reviewed catalog');
