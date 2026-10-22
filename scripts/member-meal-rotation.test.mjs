import assert from 'node:assert/strict';
import {installTestNutritionCatalog} from './setup-test-nutrition-catalog.mjs';
import {generateDailyMealPlan,isPracticalMeal} from '../src/utils/mealPlanEngine.ts';
import {calculateMacros} from '../src/utils/nutritionHelpers.ts';
import {changeMemberMeal,memberMealAlternatives,memberMealSignature} from '../src/utils/changeMemberMeal.ts';
import {withSwapBaseline} from '../src/utils/mealPresentation.ts';
const catalog=installTestNutritionCatalog();const preferences={vegetarianStatus:'none',allergies:[]};
const initial=generateDailyMealPlan(calculateMacros(2100,85,'weight_loss',178),85,preferences,true,'2026-10-22-v0',{proteinBudgetPreference:'balanced'});
let count=0;
for(let index=0;index<initial.meals.length;index++){
 let plan=withSwapBaseline(initial,initial);const anchor=initial.meals[index];const options=memberMealAlternatives(plan,index,preferences);assert(options.length>=2,anchor.slot+' must have a genuine alternative');
 const originals=initial.meals.map(m=>JSON.stringify(m));const signatures=new Set();
 for(let click=0;click<40;click++){
  const before=plan.meals[index];plan=changeMemberMeal(plan,index,85,preferences,'balanced','ignored-random-'+click);
  assert.notEqual(memberMealSignature(plan.meals[index]),memberMealSignature(before),'Every click changes the actual foods');
  for(let i=0;i<plan.meals.length;i++)if(i!==index)assert.equal(JSON.stringify(plan.meals[i]),originals[i],'Other slots never move');
  const meal=plan.meals[index];assert(meal.totalKcal>=anchor.totalKcal*.85&&meal.totalKcal<=anchor.totalKcal*1.15);assert(isPracticalMeal(meal.slot,meal.components));
  assert.equal(meal.totalKcal,meal.components.reduce((s,c)=>s+c.kcal,0));
  assert.deepEqual(plan.mealRotationAnchors[index],anchor);signatures.add(memberMealSignature(meal));
  plan=JSON.parse(JSON.stringify(plan));count++;
 }
 assert.equal(signatures.size,options.length,'Wraps through the complete approved pool after repeated reloads');
}
const restrictive={vegetarianStatus:'vegan',allergies:['gluten']};
for(let i=0;i<initial.meals.length;i++){
 const options=memberMealAlternatives(initial,i,restrictive);
 for(const m of options)for(const c of m.components){assert(!c.foodItem.excludedForVegetarian.includes('vegan'));assert(!c.foodItem.allergyFlags.includes('gluten'));}
}
const locked={...initial,meals:initial.meals.map((m,i)=>i===0?{...m,consumed:true}:m)};assert.throws(()=>changeMemberMeal(locked,0,85,preferences,'balanced','x'),/ثبت‌شده/);
console.log(`✓ ${count} consecutive rotations across ${initial.meals.length} meal slots: distinct menus, wraparound, reload stability, no portion drift, unchanged other meals and dietary eligibility (${catalog.foods.length} foods)`);
