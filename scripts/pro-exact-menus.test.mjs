import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {installTestNutritionCatalog} from './setup-test-nutrition-catalog.mjs';
import {emptyRealIntake,generatePrintedPlan,menuCombinationsFeasible,menuIdentity,ProMenuCountError} from '../src/professional/menuPlan.ts';
import {DEFAULT_PROTEIN_ENGINE_POLICY as policy} from '../src/utils/proteinPolicy.ts';
import {isMealSnapshot} from '../src/utils/mealValidation.ts';
import {isPracticalMeal} from '../src/utils/mealPlanEngine.ts';
import {fromPrintedPlan,sectionMenus,validateAuthored} from '../src/professional/studioModel.ts';
import {authoredHtml} from '../src/professional/authoredPlan.ts';
const catalog=installTestNutritionCatalog();
const base={...emptyRealIntake(),display_name:'Synthetic exact-menu case',birth_date:'1992-04-23',weight_kg:75,height_cm:165,safety_confirmed:true};
const profiles=[
 ['low-energy',{}],
 ['male',{gender:'male',pregnancy_status:'not_applicable',height_cm:180,weight_kg:85,activity_level:'moderate'}],
 ['training',{gender:'male',pregnancy_status:'not_applicable',weight_kg:125,height_cm:178,protein_budget:'performance',workout_days:3,training_type:'resistance'}],
 ['dairy-free',{allergies:['dairy']}],
 ['vegan',{vegetarian_status:'vegan'}],
 ['gluten-free',{allergies:['gluten']}],
 ['gain',{goal:'weight_gain',weight_kg:55,activity_level:'active'}],
];
let plans=0,menus=0,combinations=0,maxMs=0;let sample;
for(const [name,patch] of profiles)for(let count=1;count<=5;count++){
 const intake={...base,...patch},started=performance.now();
 const plan=generatePrintedPlan(intake,1,count,policy,'2026-11-10');maxMs=Math.max(maxMs,performance.now()-started);plans++;
 assert.equal(plan.requested_menus,count);assert.equal(plan.days.length,intake.workout_days?2:1);
 for(const day of plan.days){
  assert(menuCombinationsFeasible(day.slots,day.targets),name+' worst-case envelope');
  for(const slot of day.slots){
   assert.equal(slot.options.length,count,name+' exact count');assert.equal(new Set(slot.options.map(menuIdentity)).size,count,name+' distinct compositions');
   assert.equal(new Set(slot.options.map(m=>m.templateId)).size,count,name+' stable distinct IDs');
   for(const meal of slot.options){
    menus++;assert(isMealSnapshot(meal,slot.slot));assert(isPracticalMeal(slot.slot,meal.components));
    const original=catalog.mealTemplates.find(t=>t.id===meal.templateId.split('~')[0]);assert(original);
    for(const [index,c] of meal.components.entries()){
     assert(!c.foodItem.allergyFlags.some(a=>intake.allergies.includes(a)));assert(!c.foodItem.excludedForVegetarian.includes(intake.vegetarian_status));
     const rule=catalog.portionRules[c.foodItem.id];assert(c.units>=rule.minUnits-1e-6&&c.units<=rule.hardMaxUnits+1e-6,name+' hard serving bounds');
     const fixed=original.slots[index];if(fixed&&!fixed.dynamicUnits&&fixed.primaryFoodItemId===c.foodItem.id)assert.equal(c.units,fixed.fixedUnits??1,'Original fixed components remain fixed');
     // Gram prescriptions have a finer Pro grid; household/countable portions retain their original grid.
     const household=Math.abs((c.units-rule.minUnits)/rule.step-Math.round((c.units-rule.minUnits)/rule.step))<1e-5;
     const grams=c.foodItem.unitLabel.trim()==='گرم'&&c.grams%5===0;
     if(!fixed||fixed.dynamicUnits||fixed.primaryFoodItemId!==c.foodItem.id)assert(household||grams,name+' portion precision');
    }
   }
  }
  if(count===5&&(name==='low-energy'||name==='training')){
   const totals=[0,0,0,0],keys=['totalKcal','totalProtein','totalCarbs','totalFat'],t=[day.targets.targetCalories,day.targets.proteinGrams,day.targets.carbGrams,day.targets.fatGrams];
   const visit=index=>{if(index===day.slots.length){combinations++;const close=totals.slice(1).every((v,i)=>v>=t[i+1]*.97-1e-5&&v<=t[i+1]*1.03+1e-5);totals.forEach((v,i)=>assert(v>=t[i]*(i===0?(close?.94:.95):.9)-1e-5&&v<=t[i]*(i===0?1.03:1.1)+1e-5));return;}for(const m of day.slots[index].options){keys.forEach((k,i)=>totals[i]+=m[k]);visit(index+1);keys.forEach((k,i)=>totals[i]-=m[k]);}};
   visit(0);
  }
 }
 const authored=fromPrintedPlan(plan);assert.equal(validateAuthored(authored,'nutrition'),'');assert(authored.sections.every(s=>sectionMenus(s).length===count));
 assert(authoredHtml(authored,base.display_name,'nutrition','https://example.com').includes('منو'));
 if(name==='low-energy'&&count===5)sample=plan;
}
const sparse={generateDailyMealPlan(){return{meals:sample.days[0].slots.map(s=>s.options[0])};},getProfessionalMealOptions(){return[];}};
assert.throws(()=>generatePrintedPlan(base,1,5,policy,'2026-11-10','',sparse),ProMenuCountError,'A genuinely sparse engine cannot invent or repeat recipes');
assert.throws(()=>generatePrintedPlan({...base,allergies:['egg']},1,5,policy,'2026-11-10'),'Unassessed legacy allergen data must fail closed');
const repeat=generatePrintedPlan(base,1,5,policy,'2026-11-10');assert.deepEqual(repeat.days,sample.days,'Deterministic solve');
console.log(`PASS exact Pro menus: ${plans} profiles/counts, ${menus} menus, ${combinations} independent combinations; allergens/diets, fixed/min/max servings, 5 g precision, snapshots/IDs/arithmetic, authoring/PDF and sparse-catalog rejection; slowest ${Math.round(maxMs)} ms`);
