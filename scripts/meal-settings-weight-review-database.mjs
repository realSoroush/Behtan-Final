import { processWeightReview } from '../server/member/weightReview.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { generatePrintedPlan,emptyRealIntake } from '../src/professional/menuPlan.ts';
import { createMealPlanEngine } from '../src/utils/mealPlanEngine.ts';
import { DEFAULT_PROTEIN_ENGINE_POLICY as policy } from '../src/utils/proteinPolicy.ts';
import { TEST_NUTRITION_CATALOG } from './setup-test-nutrition-catalog.mjs';
export async function testMealSettingsAndWeightReview(db) {
 await db.exec('reset role');
 // The older shared test bootstrap predates the budget-policy migration.
 await db.exec(await readFile(new URL('../supabase/migrations/20260905_010_protein_budget_preference.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261117210000_060_meal_settings_weight_review.sql',import.meta.url),'utf8'));
 const user=randomUUID(),other=randomUUID();
 for (const id of [user,other]){
  await db.query("insert into auth.users(id,phone,phone_confirmed_at)values($1,'989111111111',now())",[id]);
  await db.query('insert into user_profiles(id,weight,height,onboarding_completed)values($1,85,178,true)',[id]);
 }
 const day=(await db.query("select ((now() at time zone 'Asia/Tehran')::date)::text as d")).rows[0].d;
 const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 await as(user);
 await rpc('member_set_meal_settings',[null,{regularMeals:3,includePostWorkout:false}]);
 await assert.rejects(()=>rpc('member_set_meal_settings',[null,{regularMeals:6,includePostWorkout:true}]),/STALE_CONTEXT/);
 for(const bad of [{}, {regularMeals:null,includePostWorkout:false},{regularMeals:3,includePostWorkout:null},{regularMeals:3,includePostWorkout:false,extra:true}]){
  await assert.rejects(()=>rpc('member_set_meal_settings',[{regularMeals:3,includePostWorkout:false},bad]),/member_meal_settings_valid/);
 }
 await db.query('insert into user_progress_entries(user_id,entry_date,weight_kg,adherence,hunger,difficulty)values($1,$2,80,\'mostly\',\'comfortable\',\'none\')',[user,day]);
 assert.equal(Number((await db.query('select weight from user_profiles where id=$1',[user])).rows[0].weight),85,'Measurement does not alter reference weight');
 await assert.rejects(()=>rpc('member_weight_review_state',[user]),/permission denied/);
 await assert.rejects(()=>db.query("insert into nutrition_protein_prices values('IR','{}')"),/permission denied/);
 await db.exec('reset role');
 let state=await rpc('member_weight_review_state',[user]);
 let revision=(await db.query('select revision from member_catalog_version')).rows[0].revision;
 const apply=()=>rpc('member_apply_weight_review',[user,state.profile,state.entries,revision,day,80,'a'.repeat(64),{test:true}]);
 await db.query('update user_progress_entries set weight_kg=79 where user_id=$1',[user]);
 await assert.rejects(apply,/STALE_CONTEXT/);
 state=await rpc('member_weight_review_state',[user]);
 await apply();
 assert.equal(Number((await db.query('select weight from user_profiles where id=$1',[user])).rows[0].weight),80);
 assert.equal(await rpc('member_weight_review_receipt',[user,'a'.repeat(64)]),true);
 assert.equal(await rpc('member_weight_review_receipt',[other,'a'.repeat(64)]),false);
 await as(other);assert.equal((await db.query('select * from member_weight_review_history')).rows.length,0);
 await db.exec('reset role');
 const price={region:'IR',observedOn:day,validThrough:day,quotes:{test:{tomanPerKg:1,preparationState:'cooked',source:'https://example.invalid/synthetic'}}};
 await db.query("insert into nutrition_protein_prices(id,snapshot)values('IR',$1)",[price]);
 assert.notEqual((await db.query('select revision from member_catalog_version')).rows[0].revision,revision);
 await db.exec('set role service_role');
 assert.deepEqual((await rpc('nutrition_context_snapshot',[null])).protein_prices,price);
 await db.exec('reset role');
 const a={...emptyRealIntake(),display_name:'Synthetic',birth_date:'1992-04-23',weight_kg:85,height_cm:180,gender:'male',pregnancy_status:'not_applicable',activity_level:'moderate',workout_days:3,safety_confirmed:true};
 const engine=createMealPlanEngine(TEST_NUTRITION_CATALOG);
 for(const regularMeals of [3,4,5,6])for(const includePostWorkout of [false,true]){
  const settings={regularMeals,includePostWorkout};
  const {mealStructureFor}=await import('../src/utils/mealSettings.ts');
  const plan=generatePrintedPlan(a,1,1,policy,day,'',engine,{mealStructure:mealStructureFor(settings)});plan.meal_settings=settings;
  assert.equal((await db.query('select pro_private.valid_printed_plan($1) ok',[plan])).rows[0].ok,true);
  const bad=structuredClone(plan);bad.days[0].slots[0].slot='post_workout';
  assert.equal((await db.query('select pro_private.valid_printed_plan($1) ok',[bad])).rows[0].ok,false);
 }
 // Rolling cap includes both existing future proposals and consumed snapshots.
 await db.query("insert into meal_templates(id,slot,display_name,max_per_week,is_active)values('synthetic-cap','lunch','Synthetic',1,false)");
 const plan={meals:[{slot:'lunch',templateId:'synthetic-cap'}]};
 await db.query("insert into member_meal_schedule(user_id,plan_date,context_key,plan,server_verified_at) values($1,$2,'cap-test',$3,now())",[user,day,plan]);
 const next=(await db.query('select ($1::date+1)::text d',[day])).rows[0].d;
 await assert.rejects(()=>db.query("insert into member_meal_schedule(user_id,plan_date,context_key,plan,server_verified_at) values($1,$2,'cap-test',$3,now())",[user,next,plan]),/WEEKLY_MEAL_LIMIT/);
 assert.equal((await rpc('member_meal_week_context',[user,next,'cap-test']))[0].meals[0].templateId,'synthetic-cap');
 if(process.env.PRO_TEST_DATABASE_URL){
  const {Client}=await import('pg');const second=new Client({connectionString:process.env.PRO_TEST_DATABASE_URL});await second.connect();
  const concurrent=randomUUID();
  await db.query("insert into auth.users(id,phone,phone_confirmed_at)values($1,'989111111111',now())",[concurrent]);
  await db.query('insert into user_profiles(id,weight,height,onboarding_completed)values($1,85,178,true)',[concurrent]);
  const sql="insert into member_meal_schedule(user_id,plan_date,context_key,plan,server_verified_at) values($1,$2,'cap-race',$3,now())";
  try {
   const results=await Promise.allSettled([db.query(sql,[concurrent,day,plan]),second.query(sql,[concurrent,next,plan])]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'Only one concurrent proposal can use the last weekly occurrence');
   assert.match(results.find(r=>r.status==='rejected').reason.message,/WEEKLY_MEAL_LIMIT/);
  }finally{await second.end();}
 }

 // Historical consumption can exceed a cap; it must not block unrelated new meals.
 for(const offset of [0,1])await db.query("insert into daily_meal_checkins(user_id,plan_date,meal_slot,template_id,meal_snapshot) values($1,$2::date-$3::int,'lunch','synthetic-cap',$4)",[user,day,offset,plan.meals[0]]);
 await db.query("insert into member_meal_schedule(user_id,plan_date,context_key,plan,server_verified_at) values($1,$2,'cap-test',$3,now())",[user,next,{meals:[{slot:'breakfast',templateId:TEST_NUTRITION_CATALOG.mealTemplates.find(t=>t.slot==='breakfast').id}]}]);
 await db.query("insert into daily_meal_checkins(user_id,plan_date,meal_slot,template_id,meal_snapshot) values($1,$2,'morning_snack','synthetic',$3)",[user,day,{slot:'morning_snack',templateId:'synthetic'}]);
 await as(user);
 await assert.rejects(()=>rpc('member_set_meal_settings',[{regularMeals:3,includePostWorkout:false},{regularMeals:3,includePostWorkout:false}]),/MEAL_NOT_EDITABLE/);
 await db.exec('reset role');
 // Exercise the complete server proposal/confirmation path with SQL-backed RPCs.
 await db.query(`update user_profiles set weight=85,gender='male',birth_date='1990-05-15',activity_level='moderate',goal='weight_loss',
 weight_loss_speed='standard',protein_budget_preference='balanced',medical_conditions_json=$2 where id=$1`,[user,
 {conditions:[],injuries:'',medications:'',pregnancyStatus:'not_applicable',eatingDisorderStatus:'none',safetyAnswersConfirmed:true,safetyScreeningVersion:1}]);
 for(let i=0;i<14;i++) await db.query(`insert into user_progress_entries(user_id,entry_date,weight_kg,adherence,hunger,difficulty)
 values($1,$2::date-$3::integer,80,'mostly','comfortable','none') on conflict(user_id,entry_date) do update set weight_kg=80,adherence='mostly',hunger='comfortable',difficulty='none'`,[user,day,i]);
 const adapter={rpc(name,args){return{abortSignal(){return this;},retry(){return this;},then(resolve,reject){
  return rpc(name,Object.values(args)).then(data=>resolve({data,error:null}),reject);
 }}}};
 const preview=await processWeightReview(adapter,user,{kind:'preview'});
 assert.equal(preview.proposal.weight,80);
 await db.query('update user_progress_entries set weight_kg=81 where user_id=$1 and entry_date=$2',[user,day]);
 await assert.rejects(()=>processWeightReview(adapter,user,{kind:'apply',reviewKey:preview.proposal.reviewKey}),/STALE_CONTEXT/);
 const fresh=await processWeightReview(adapter,user,{kind:'preview'});
 assert.deepEqual(await processWeightReview(adapter,user,{kind:'apply',reviewKey:fresh.proposal.reviewKey}),{applied:true});
 assert.deepEqual(await processWeightReview(adapter,user,{kind:'apply',reviewKey:fresh.proposal.reviewKey}),{applied:true},'Lost-response retry returns original receipt without applying again');
 assert.equal((await processWeightReview(adapter,user,{kind:'preview'})).proposal,null);
 await db.query('delete from nutrition_protein_prices');
 console.log('PASS migration 060: settings CAS/shape, measurement isolation, stale-evidence rejection, apply audit/receipt ownership, price RLS/revision/snapshot, all Pro layout SQL contracts, rolling weekly cap');
}
