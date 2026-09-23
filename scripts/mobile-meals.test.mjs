import assert from 'node:assert/strict';
import {installTestNutritionCatalog} from './setup-test-nutrition-catalog.mjs';
import {generateDailyMealPlan,getSwapOptionsForMeal,isPracticalMeal} from '../src/utils/mealPlanEngine.ts';
import {calculateMacros} from '../src/utils/nutritionHelpers.ts';
const catalog=installTestNutritionCatalog();
assert(!catalog.foods.some(f=>f.id==='medjool_date'));
assert(catalog.foods.find(f=>f.id==='dates_small').gramsPerUnit<10);
let total=0;
for(const kcal of [1400,1800,2399,2800])for(const budget of ['economic','balanced','performance'])for(const workout of [false,true]) {
 const targets=calculateMacros(kcal,85,'weight_loss',178);
 const plan=generateDailyMealPlan(targets,85,{vegetarianStatus:'none',allergies:[]},workout,'2026-09-23',{proteinBudgetPreference:budget});
 assert.equal(plan.meals.length,workout?7:6);assert.deepEqual(plan.targets,targets);
 const breakfast=plan.meals.find(m=>m.slot==='breakfast');assert(isPracticalMeal('breakfast',breakfast.components));
 for(let i=0;i<breakfast.components.length;i++)for(const option of getSwapOptionsForMeal(breakfast,i,{vegetarianStatus:'none',allergies:[]}))if(option.isEquivalent)assert(isPracticalMeal('breakfast',option.updatedMeal.components));
 if(workout){const post=plan.meals.find(m=>m.slot==='post_workout');assert(post.totalKcal<=300);assert(post.totalProtein>=20);assert.equal(post.templateId,budget==='performance'?'pw_whey_water':'pw_chicken_potato');assert.equal(post.components[0].units,budget==='performance'?1:.75);
  const frozen={...post,consumed:true};const next=generateDailyMealPlan(targets,85,{vegetarianStatus:'none',allergies:[]},false,'next',{proteinBudgetPreference:budget,lockedMeals:[frozen]});assert.deepEqual(next.meals.find(m=>m.slot==='post_workout'),frozen);
 }
 total++;
}
for(const prefs of [{vegetarianStatus:'vegan',allergies:[]},{vegetarianStatus:'none',allergies:['dairy']},{vegetarianStatus:'none',allergies:['dairy','soy','tree_nut','peanut','gluten']}]){
 const plan=generateDailyMealPlan(calculateMacros(1800,85,'weight_loss',178),85,prefs,true,'restricted',{proteinBudgetPreference:'performance'});
 for(const m of plan.meals)for(const c of m.components){assert(!c.foodItem.allergyFlags.some(a=>prefs.allergies.includes(a)));assert(!c.foodItem.excludedForVegetarian.includes(prefs.vegetarianStatus));}
}
console.log(`✅ ${total} rest/workout/budget plans; breakfast+swap caps, fixed small recovery meals, unchanged targets, consumed preservation, diet/allergy alternatives`);
