import assert from 'node:assert/strict';
import {CORRECTIVE_SEED}from'../src/professional/training/corrective/seed.ts';
import {publicationError}from'../src/professional/training/corrective/types.ts';
import{generatePrintedPlan,emptyRealIntake,menuCombinationsFeasible,ProMenuCountError,menuIdentity}from'../src/professional/menuPlan.ts';
import{installTestNutritionCatalog}from'./setup-test-nutrition-catalog.mjs';
import{DEFAULT_PROTEIN_ENGINE_POLICY as policy}from'../src/utils/proteinPolicy.ts';
import{fromPrintedPlan,sectionMenus,nutritionTotals,nutritionRange,validateAuthored,trainingLine}from'../src/professional/studioModel.ts';
import{authoredHtml}from'../src/professional/authoredPlan.ts';
installTestNutritionCatalog();
assert.equal(CORRECTIVE_SEED.length,117);assert.equal(new Set(CORRECTIVE_SEED.map(e=>e.id)).size,117);assert.equal(new Set(CORRECTIVE_SEED.flatMap(e=>e.categories)).size,10);
for(const row of CORRECTIVE_SEED){assert.equal(row.status,'draft');assert(publicationError(row));assert(!row.reviewer);}
assert.equal(CORRECTIVE_SEED.find(e=>e.nameEn==='Wall Slide').categories.length,2);
assert(CORRECTIVE_SEED.find(e=>e.nameEn==='Single Leg Balance').aliases.includes('Single Leg Stance'));
const intake={...emptyRealIntake(),display_name:'Synthetic',birth_date:'1992-04-23',weight_kg:85,height_cm:180,gender:'male',pregnancy_status:'not_applicable',activity_level:'moderate',safety_confirmed:true};
let last;
for(let count=1;count<=5;count++){
 const plan=generatePrintedPlan(intake,1,count,policy,'2026-10-21');
 assert.equal(plan.menu_contract,'exact-v2');
 for(const d of plan.days){assert(menuCombinationsFeasible(d.slots,d.targets));for(const slot of d.slots){assert.equal(slot.options.length,count);assert.equal(new Set(slot.options.map(menuIdentity)).size,count);}}
 const authored=fromPrintedPlan(plan);assert.equal(validateAuthored(authored,'nutrition'),'');
 assert(authored.sections.every(s=>sectionMenus(s).length===count));
 const copy=JSON.parse(JSON.stringify(authored));assert.deepEqual(copy,authored);const range=nutritionRange(copy.sections),first=nutritionTotals(copy.sections);assert(range.min.kcal<=first.kcal+1e-6&&first.kcal<=range.max.kcal+1e-6);
 const html=authoredHtml(copy,'Synthetic','nutrition','https://example.com');assert(html.includes('منو'));last=plan;
}
// Reject a real shortage rather than repeating one menu or delivering fewer.
const one={generateDailyMealPlan(){const d=last.days[0];return{meals:d.slots.map(s=>s.options[0])};},getProfessionalMealOptions(){return[];}};
assert.throws(()=>generatePrintedPlan(intake,1,5,policy,'2026-10-21','',one),ProMenuCountError);
const training={version:1,title:'Synthetic',notes:'',reviewed:true,sections:[{title:'Session',lines:[trainingLine('Hold')]}]};training.sections[0].lines[0].training={group:'test',kind:1,sets:2,reps:0,rest:30,seconds:20};assert.equal(validateAuthored(training,'training'),'');assert(authoredHtml(training,'Synthetic','training','https://example.com').includes('20 ثانیه'));
training.sections[0].lines[0].training.seconds=NaN;assert(validateAuthored(training,'training'));
console.log('PASS Pro UX: all 117 draft movements, taxonomy/dedup/review gate, exact 1–5 distinct menus with unchanged combination limits, shortage rejection, all alternatives persist/import/print, alternative ranges and timed exercise doses');
