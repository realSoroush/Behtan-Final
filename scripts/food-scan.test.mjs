import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {parseFoodScanResult,foodScanTotals,parseFoodGrams,scannedMeal} from '../src/utils/foodScan.ts';
import {isStoredMealSnapshot,applyDailyMealSnapshots} from '../src/utils/dailyMealProgress.ts';
import {changeMemberMeal} from '../src/utils/changeMemberMeal.ts';
import {withSwapBaseline,prescriptionForSchedule} from '../src/utils/mealPresentation.ts';
import {installTestNutritionCatalog} from './setup-test-nutrition-catalog.mjs';
import {generateDailyMealPlan} from '../src/utils/mealPlanEngine.ts';
import {calculateMacros} from '../src/utils/nutritionHelpers.ts';
installTestNutritionCatalog();
const result=parseFoodScanResult({confidence:'medium',note:'تخمینی',foods:[{name:'برنج پخته',grams:125,kcalPer100:130,proteinPer100:2.7,carbsPer100:28,fatPer100:.3,fiberPer100:.4}]});
assert.equal(parseFoodGrams('۱۵۰'),150);assert.equal(parseFoodGrams('١٥٠٫٥'),150.5);for(const v of ['','-5','۱e۳','abc','0','2001'])assert.equal(parseFoodGrams(v),null);
const changed={...result,foods:result.foods.map(f=>({...f,grams:150}))};assert.equal(foodScanTotals(result.foods).kcal,162.5);assert.equal(foodScanTotals(changed.foods).kcal,195);assert(Math.abs(foodScanTotals(changed.foods).protein/foodScanTotals(result.foods).protein-1.2)<1e-9);
for(const bad of [{...result,foods:[{...result.foods[0],grams:NaN}]},{...result,foods:[{...result.foods[0],fatPer100:100}]},{...result,foods:Array(13).fill(result.foods[0])},{...result,confidence:'high'}])assert.throws(()=>parseFoodScanResult(bad));
const custom=scannedMeal(changed,'lunch','ناهار');assert.equal(custom.templateName,'وعدهٔ دلخواه');assert.equal(custom.estimated,true);assert.equal(custom.totalKcal,195);assert(isStoredMealSnapshot(JSON.parse(JSON.stringify(custom)),'lunch'));
const targets=calculateMacros(2100,85,'weight_loss',178);const prefs={vegetarianStatus:'none',allergies:[]};const plan=generateDailyMealPlan(targets,85,prefs,false,'2026-10-22-v0',{proteinBudgetPreference:'balanced'});
const applied=applyDailyMealSnapshots(plan,{lunch:custom});assert.equal(applied.meals.find(m=>m.slot==='lunch').totalKcal,195);assert.equal(applied.meals.filter(m=>m.consumed).length,1);
assert.deepEqual(prescriptionForSchedule(applied,plan).meals.find(m=>m.slot==='lunch'),plan.meals.find(m=>m.slot==='lunch'));
const next=changeMemberMeal(withSwapBaseline(applied,plan),0,85,prefs,'balanced','test-single');for(let i=1;i<applied.meals.length;i++)assert.deepEqual(next.meals[i],applied.meals[i]);assert.deepEqual(withSwapBaseline(next,plan).swapBaselineMeals[0],next.meals[0]);assert.throws(()=>changeMemberMeal(applied,applied.meals.findIndex(m=>m.slot==='lunch'),85,prefs,'balanced','locked'));
const db=new PGlite();try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.uid',true),'')::uuid$$;create function public.billing_has_access() returns boolean language sql as $$select current_setting('request.access',true)='yes'$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261022_033_food_scan_quota.sql',import.meta.url),'utf8'));
 const u='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users values($1)',[u]);await db.query("select set_config('request.uid',$1,false)",[u]);await db.query("select set_config('request.access','yes',false)");await db.exec('set role authenticated');
 assert.equal((await db.query('select public.reserve_food_scan() as ok')).rows[0].ok,true);assert.equal((await db.query('select public.reserve_food_scan() as ok')).rows[0].ok,false);
 await assert.rejects(db.query('select * from public.member_food_scan_usage'),/permission denied/);
 for(let i=0;i<9;i++){await db.exec('reset role;update public.member_food_scan_usage set last_request_at=now()-interval \'1 minute\';set role authenticated');assert.equal((await db.query('select public.reserve_food_scan() as ok')).rows[0].ok,true);}
 await db.exec('reset role;update public.member_food_scan_usage set last_request_at=now()-interval \'1 minute\';set role authenticated');assert.equal((await db.query('select public.reserve_food_scan() as ok')).rows[0].ok,false);
 await db.query("select set_config('request.access','no',false)");await assert.rejects(db.query('select public.reserve_food_scan()'),/ACCESS_DENIED/);await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.reserve_food_scan()'),/permission denied/);
}finally{await db.close();}
console.log('✓ Food scan: Persian weights, 125→150g scaling, bounded AI output, custom snapshot reload, one-slot menu changes, protected atomic quotas and denied unauthorized access');
