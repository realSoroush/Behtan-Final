import assert from 'node:assert/strict';
import { mealStructureFor, parseMealSettings } from '../src/utils/mealSettings.ts';
import { smoothedWeightReview } from '../src/utils/weightReview.ts';
import { parseProteinPrices } from '../src/utils/proteinPrices.ts';
import { weeklyScheduleContext } from '../src/utils/weeklyScheduleContext.ts';
import { createMealPlanEngine } from '../src/utils/mealPlanEngine.ts';
import { TEST_NUTRITION_CATALOG } from './setup-test-nutrition-catalog.mjs';
import { generatePrintedPlan, emptyRealIntake } from '../src/professional/menuPlan.ts';
import { DEFAULT_PROTEIN_ENGINE_POLICY as policy } from '../src/utils/proteinPolicy.ts';
for (const value of [{}, [], false, {regularMeals:2,includePostWorkout:true}, {regularMeals:6,includePostWorkout:'true'}, {regularMeals:3,includePostWorkout:false,extra:1}]) assert.throws(()=>parseMealSettings(value));
assert.deepEqual(parseMealSettings(null),{regularMeals:6,includePostWorkout:true});
const engine=createMealPlanEngine(TEST_NUTRITION_CATALOG);
const intake={...emptyRealIntake(),display_name:'Synthetic',birth_date:'1992-04-23',weight_kg:85,height_cm:180,gender:'male',pregnancy_status:'not_applicable',activity_level:'moderate',workout_days:3,training_type:'resistance',safety_confirmed:true};
for (const regularMeals of [3,4,5,6]) for (const includePostWorkout of [false,true]) {
 const structure=mealStructureFor({regularMeals,includePostWorkout});
 assert.equal(structure.regularSlots.length,regularMeals);
 const plan=generatePrintedPlan(intake,1,1,policy,'2026-11-17','',engine,{mealStructure:structure});
 for(const day of plan.days){
  assert.equal(day.slots.length,regularMeals+(day.workout&&includePostWorkout?1:0));
  assert.equal(day.slots.some(s=>s.slot==='post_workout'),day.workout&&includePostWorkout);
 }
}
const entries=Array.from({length:14},(_,i)=>({entry_date:`2026-11-${String(i+1).padStart(2,'0')}`,weight_kg:i<7?81:80,adherence:'mostly',hunger:'comfortable',difficulty:'none'}));
let trend=smoothedWeightReview(entries,'2026-11-14');
assert.equal(trend.latest.median,80);assert.equal(trend.prior.median,81);assert.equal(trend.ready,true);assert.equal(trend.direction,'down');
assert.equal(smoothedWeightReview(entries.map((r,i)=>i===13?{...r,weight_kg:130}:r),'2026-11-14').latest.median,80,'Single spike does not move the reference median');
assert.equal(smoothedWeightReview([...entries,entries[13]],'2026-11-14'),null);
assert.equal(smoothedWeightReview(entries.map((r,i)=>i===13?{...r,weight_kg:NaN}:r),'2026-11-14'),null);
assert.equal(smoothedWeightReview(entries,'2026-02-30'),null);
assert.equal(smoothedWeightReview(entries,'2026-11-18'),null,'Stale current weights do not authorize a reference change');
assert.equal(smoothedWeightReview(entries.map(r=>({...r,hunger:'often'})),'2026-11-14').ready,false);
assert.equal(smoothedWeightReview(entries.slice(0,9),'2026-11-14'),null);
assert.deepEqual(smoothedWeightReview([...entries,{...entries[0],entry_date:'2026-11-15',weight_kg:20}],'2026-11-14'),trend,'Future rows excluded');
const prices={region:'IR',observedOn:'2026-11-17',validThrough:'2026-11-24',quotes:{test:{tomanPerKg:10000,preparationState:'cooked',source:'https://example.invalid/quote'}}};
assert.deepEqual(parseProteinPrices(prices),prices);
for(const bad of [{...prices,observedOn:'2026-02-30'},{...prices,validThrough:'2026-11-16'},{...prices,quotes:{test:{...prices.quotes.test,tomanPerKg:null}}},{...prices,quotes:{test:{...prices.quotes.test,source:'http://insecure.invalid'}}}])assert.throws(()=>parseProteinPrices(bad));
const m={templateId:'limited~variant',slot:'lunch',components:[]};
assert.equal(weeklyScheduleContext('2026-11-17',[{date:'2026-11-11',meals:[m]},{date:'2026-11-23',meals:[m]}]).templateUsesThisWeek.get('limited'),1,'Never sum opposite ends of a 13-day envelope');
assert.equal(weeklyScheduleContext('2026-11-17',[{date:'2026-11-16',meals:[m]},{date:'2026-11-18',meals:[m]}]).templateUsesThisWeek.get('limited'),2);
console.log('PASS settings validation, all 8 Pro layouts with rest/workout, robust descriptive trends, freshness/invalid/duplicate/feedback gates, sourced prices, rolling caps');
