import assert from 'node:assert/strict';
import { mealStructureFor, parseMealSettings } from '../src/utils/mealSettings.ts';
import { latestWeightReview } from '../src/utils/weightReview.ts';
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
const measurement=latestWeightReview(entries,'2026-11-14');
assert.equal(measurement.weight,80);
assert.equal(latestWeightReview([entries[13]],'2026-11-14').weight,80,'One measurement suffices');
assert.equal(latestWeightReview([{...entries[13],adherence:null,hunger:null,difficulty:null}],'2026-11-14').weight,80,'Feedback is optional');
assert.equal(latestWeightReview([{...entries[13],adherence:'little',hunger:'often',difficulty:'cost'}],'2026-11-14').weight,80,'Feedback never blocks preview');
assert.equal(latestWeightReview(entries.map((r,i)=>i===13?{...r,weight_kg:130}:r),'2026-11-14').weight,130,'Latest measurement is shown for confirmation');
assert.equal(latestWeightReview([...entries,entries[13]],'2026-11-14'),null);
assert.equal(latestWeightReview(entries.map((r,i)=>i===13?{...r,weight_kg:NaN}:r),'2026-11-14'),null);
assert.equal(latestWeightReview(entries,'2026-02-30'),null);
assert.equal(latestWeightReview([entries[0]],'2026-12-18').weight,81,'No hidden recency requirement');
assert.equal(latestWeightReview([],'2026-11-14'),null);
assert.deepEqual(latestWeightReview([...entries,{...entries[0],entry_date:'2026-11-15',weight_kg:20}],'2026-11-14'),measurement,'Future rows excluded');
const prices={region:'IR',observedOn:'2026-11-17',validThrough:'2026-11-24',quotes:{test:{tomanPerKg:10000,preparationState:'cooked',source:'https://example.invalid/quote'}}};
assert.deepEqual(parseProteinPrices(prices),prices);
for(const bad of [{...prices,observedOn:'2026-02-30'},{...prices,validThrough:'2026-11-16'},{...prices,quotes:{test:{...prices.quotes.test,tomanPerKg:null}}},{...prices,quotes:{test:{...prices.quotes.test,source:'http://insecure.invalid'}}}])assert.throws(()=>parseProteinPrices(bad));
const m={templateId:'limited~variant',slot:'lunch',components:[]};
assert.equal(weeklyScheduleContext('2026-11-17',[{date:'2026-11-11',meals:[m]},{date:'2026-11-23',meals:[m]}]).templateUsesThisWeek.get('limited'),1,'Never sum opposite ends of a 13-day envelope');
assert.equal(weeklyScheduleContext('2026-11-17',[{date:'2026-11-16',meals:[m]},{date:'2026-11-18',meals:[m]}]).templateUsesThisWeek.get('limited'),2);
console.log('PASS settings validation, all 8 Pro layouts with rest/workout, single-measurement confirmation without frequency or feedback gates, sourced prices, rolling caps');
