import assert from 'node:assert/strict';
import {installTestNutritionCatalog,TEST_NUTRITION_CATALOG} from './setup-test-nutrition-catalog.mjs';
import {generateDailyMealPlan,configureNutritionCatalog} from '../src/utils/mealPlanEngine.ts';
import {calculateMacros} from '../src/utils/nutritionHelpers.ts';
import {historyOfMeals,mealFingerprint,MEAL_SHARES} from '../src/utils/mealExperience.ts';
installTestNutritionCatalog();
assert.equal(Object.values(MEAL_SHARES).reduce((a,b)=>a+b,0),1);
let changed=0;
for(const kcal of [1400,1800,2200]) {
 const targets=calculateMacros(kcal,85,'weight_loss',170);
 const prefs={vegetarianStatus:'none',allergies:[]};
 const plan=generateDailyMealPlan(targets,85,prefs,false,'2026-09-21');
 assert.deepEqual(plan,generateDailyMealPlan(targets,85,prefs,false,'2026-09-21'),'Same input must reproduce plan');
 const ids=plan.meals.map(m=>mealFingerprint(m.components.map(c=>c.foodItem.id)));
 assert(!ids.some((id,i)=>i>0&&id===ids[i-1]),'Avoid repeated adjacent meal structures');
 for(const slot of ['morning_snack','afternoon_snack']) {
  const meal=plan.meals.find(m=>m.slot===slot);
  assert(meal.components.some(c=>c.foodItem.role==='fruit'&&c.grams>=60),`Missing fruit at ${kcal}/${slot}`);
  assert(meal.totalFiber>=2,`Missing snack fiber at ${kcal}/${slot}`);
 }
 assert.deepEqual(plan.targets,targets,'Daily targets are unchanged');
 for(const m of plan.meals)assert(m.totalKcal<=targets.targetCalories*MEAL_SHARES[m.slot]*1.36,`Slot too large: ${m.slot}`);
 const context={previousDay:historyOfMeals(plan.meals),avoidMeals:historyOfMeals(plan.meals)};
 const next=generateDailyMealPlan(targets,85,prefs,false,'2026-09-22',context);
 changed+=next.meals.filter((m,i)=>mealFingerprint(m.components.map(c=>c.foodItem.id))!==ids[i]).length;
}
assert(changed>=6,'History should materially change available menu selections');
// Consumed food/portions are facts: regenerating or changing targets cannot rewrite them.
const lockTargets=calculateMacros(1800,85,'weight_loss',170);
const lockPrefs={vegetarianStatus:'none',allergies:[]};
const original=generateDailyMealPlan(lockTargets,85,lockPrefs,false,'lock-baseline');
const locked=original.meals.slice(0,2).map(m=>({...m,consumed:true}));
const regenerated=generateDailyMealPlan(lockTargets,85,lockPrefs,false,'lock-next',{lockedMeals:locked,avoidMeals:historyOfMeals(original.meals)});
for(const meal of locked)assert.deepEqual(regenerated.meals.find(m=>m.slot===meal.slot),meal,'Consumed meal changed');
const allLocked=original.meals.map(m=>({...m,consumed:true}));
const changedTargets=calculateMacros(2200,85,'weight_loss',170);
const preserved=generateDailyMealPlan(changedTargets,85,lockPrefs,false,'lock-all',{lockedMeals:allLocked});
assert.deepEqual(preserved.meals,allLocked);
assert.equal(preserved.remainingTargetsUnmet,true,'Report a target mismatch instead of modifying consumed meals');
// A restricted catalogue must not invent a missing fruit, or override allergy gates.
const withoutFruit=structuredClone(TEST_NUTRITION_CATALOG);
withoutFruit.mealTemplates=withoutFruit.mealTemplates.filter(t=>t.slots.every(s=>withoutFruit.foods.find(f=>f.id===s.primaryFoodItemId).role!=='fruit'));
configureNutritionCatalog(withoutFruit);
try{const p=generateDailyMealPlan(calculateMacros(1800,85,'weight_loss',170),85,{vegetarianStatus:'none',allergies:[]},false,'2026-09-21');assert(p.meals.every(m=>m.components.every(c=>c.foodItem.role!=='fruit')));}catch(e){assert(['MealPlanGenerationError','MealPlanFeasibilityError'].includes(e.name));}
installTestNutritionCatalog();
console.log('✅ Meal allocation, deterministic variety, history, fruit/fiber snacks, unchanged targets and restricted-catalog fallback');
