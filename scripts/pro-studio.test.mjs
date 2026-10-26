import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foodLine, foodTotals, fromPrintedPlan, lineDescription, moveItem, nutritionTotals, prepareContent, trainingGroups, trainingLine, validateAuthored } from '../src/professional/studioModel.ts';
import { authoredHtml } from '../src/professional/authoredPlan.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/nutrition-catalog.fixture.json',import.meta.url),'utf8'));
let assertions=0;
for(const food of fixture.FOOD_ITEMS){for(const grams of [0.5,50,100,125,250,4999]){
 const l=foodLine(food,grams),t=foodTotals(l.food);
 for(const [key,source] of [['kcal','kcalPerUnit'],['protein','proteinPerUnit'],['carbs','carbsPerUnit'],['fat','fatPerUnit']]){assert.ok(Math.abs(t[key]-food[source]*grams/food.gramsPerUnit)<1e-8);assertions++;}
}}
const group='linked',a=trainingLine('نشر جانب',2,group),b=trainingLine('نشر خم',2,group);
a.training.sets=4;b.training.rest=75;
const training={version:1,title:'برنامه',notes:'<script>alert(1)</script>',reviewed:true,sections:[{title:'جلسه اول',lines:[a,b]}]};
assert.equal(validateAuthored(training,'training'),'');
assert.equal(trainingGroups(training.sections[0]).length,1);
const incomplete=structuredClone(training);incomplete.sections[0].lines.pop();assert.match(validateAuthored(incomplete,'training'),/ناقص/);
const invalid=structuredClone(training);invalid.sections[0].lines[0].training.sets=0;assert.match(validateAuthored(invalid,'training'),/نامعتبر/);
invalid.sections[0].lines[0].training.sets=NaN;assert.match(validateAuthored(invalid,'training'),/نامعتبر/);
assert.deepEqual(prepareContent(JSON.parse(JSON.stringify(training)),'training'),training);
const legacy={version:1,title:'قدیمی',notes:'',reviewed:false,sections:[{title:'جلسه',lines:[{name:'قدیمی',details:'حرکت آرام با زمان دلخواه'}]}]};
assert.equal(prepareContent(legacy,'training').sections[0].lines[0].details,legacy.sections[0].lines[0].details);
assert.equal(lineDescription(legacy.sections[0].lines[0]),legacy.sections[0].lines[0].details);
const food=fixture.FOOD_ITEMS[0],line=foodLine(food,125);
const diet={version:1,title:'تغذیه',notes:'',reviewed:true,sections:[{title:'صبحانه',nutritionDay:'rest',lines:[line]},{title:'صبحانه تمرین',nutritionDay:'workout',lines:[foodLine(food,250)]}]};
assert.equal(validateAuthored(diet,'nutrition'),'');
const totals=nutritionTotals([diet.sections[0]]);assert.deepEqual(totals,foodTotals(line.food));
const saved=JSON.parse(JSON.stringify(diet));food.kcalPerUnit+=1000;assert.deepEqual(nutritionTotals([saved.sections[0]]),totals,'catalog updates cannot change a saved snapshot');
const badFood=structuredClone(diet);badFood.sections[0].lines[0].food.grams=-1;assert.match(validateAuthored(badFood,'nutrition'),/نامعتبر/);
const plan={notes:'موتور',days:[{workout:false,targets:{targetCalories:2100,proteinGrams:150,carbGrams:240,fatGrams:60},slots:[{label:'صبحانه',options:[{components:[{foodItem:food,grams:100}]},{components:[{foodItem:food,grams:500}]}]}]},{workout:true,targets:{targetCalories:2300,proteinGrams:155,carbGrams:270,fatGrams:65},slots:[{label:'ناهار',options:[{components:[{foodItem:food,grams:200}]}]}]}]};
const imported=fromPrintedPlan(plan);assert.equal(imported.sections.length,2);assert.equal(imported.sections[0].lines.length,1);assert.equal(imported.sections[0].lines[0].food.grams,100);assert.equal(imported.nutritionTargets.workout.kcal,2300);assert.equal(imported.sections[1].nutritionDay,'workout');
const order=['a','b','c'];moveItem(order,0,2);assert.deepEqual(order,['b','c','a']);moveItem(order,-1,2);assert.deepEqual(order,['b','c','a']);
const html=authoredHtml(training,'<img onerror="attack">','training','https://example.com');assert.ok(html.includes('سوپرست'));assert.ok(html.includes('4 ست'));assert.ok(html.includes('75 ثانیه'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img onerror'));
const dietHtml=authoredHtml(saved,'مراجع','nutrition','https://example.com');assert.ok(dietHtml.includes('روز استراحت'));assert.ok(dietHtml.includes('روز تمرین'));assert.ok(dietHtml.includes('پروتئین'));assert.ok(dietHtml.includes('گرم'));
console.log(`PASS Pro studio: ${assertions} catalog arithmetic checks, linked-group integrity, numeric validation, legacy compatibility, engine alternatives, day separation, snapshot persistence, reorder and escaped PDF output`);
