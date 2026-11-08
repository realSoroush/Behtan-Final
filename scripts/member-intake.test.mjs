import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {processMemberIntake,intakeDependencies} from '../server/member/mealIntake.ts';
import {memberProfileContext} from '../src/utils/memberScheduleContext.ts';
import {TEST_NUTRITION_CATALOG} from './setup-test-nutrition-catalog.mjs';
const food=TEST_NUTRITION_CATALOG.foods[0];
const meal={slot:'breakfast',label:'Synthetic breakfast',templateId:'synthetic',templateName:'Synthetic',consumed:false,
  components:[{foodItem:food,units:1,grams:food.gramsPerUnit,kcal:food.kcalPerUnit,protein:food.proteinPerUnit,carbs:food.carbsPerUnit,fat:food.fatPerUnit,fiber:food.fiberPerUnit}],
  totalKcal:food.kcalPerUnit,totalProtein:food.proteinPerUnit,totalCarbs:food.carbsPerUnit,totalFat:food.fatPerUnit,totalFiber:food.fiberPerUnit};
const user=randomUUID(),profile={id:user,weight:85,height:178};
let state={profile,catalog_revision:'1',intake_revision:'0',schedule:null,operation:null};
let reads=0,writes=0,reserves=0,committed;
const deps={read:async()=>{reads++;return state;},reserve:async()=>{reserves++;return true;},commit:async a=>{writes++;committed=a;return {kind:'intake',date:a.p_day,intakeRevision:'1',expectedUpdatedAt:null,replayed:false};}};
const base={date:'2026-11-07',requestId:randomUUID(),profileContext:memberProfileContext(profile),catalogRevision:'1',intakeRevision:'0',expectedUpdatedAt:null};
for(const bad of [{...base,kind:'record',slot:'breakfast',meal:{...meal,totalKcal:-1}},
  {...base,kind:'record',slot:'breakfast',meal:{...meal,totalProtein:1e99}},
  {...base,kind:'skip',slot:'breakfast',user:randomUUID()}, {...base,kind:'skip',slot:'unknown'},
  {...base,kind:'skip',slot:'breakfast',date:'2026-02-31'}, {...base,kind:'skip',slot:'breakfast',requestId:'forged'},
  {...base,kind:'extra-add',slot:'breakfast',meal}, {...base,kind:'extra-remove',id:'forged'}])
  await assert.rejects(()=>processMemberIntake(user,bad,deps),/INVALID_/);
assert.equal(reads,0);
for(const [field,value,code] of [['intakeRevision','1','STALE_INTAKE'],['catalogRevision','2','STALE_CONTEXT'],['profileContext','12345678','STALE_CONTEXT'],['expectedUpdatedAt','2026-11-07T00:00:00Z','STALE_PLAN']])
  await assert.rejects(()=>processMemberIntake(user,{...base,kind:'record',slot:'breakfast',meal,[field]:value},deps),new RegExp(code));
assert.equal(writes,0);assert.equal(reserves,0);
const input={...base,kind:'record',slot:'breakfast',meal};
const result=await processMemberIntake(user,input,deps);assert.equal(committed.p_meal.consumed,true);
assert.equal(committed.p_user,user);assert.deepEqual(committed.p_profile,profile);
state={...state,intake_revision:'5',operation:{hash:committed.p_request_hash,result}};
assert.deepEqual(await processMemberIntake(user,{...input,intakeRevision:'5'},deps),{...result,replayed:true});
await assert.rejects(()=>processMemberIntake(user,{...base,kind:'skip',slot:'breakfast'},deps),/REQUEST_CONFLICT/);
assert.equal(writes,1);
// A database-aborted compatibility deadlock is retried once with the same args.
let attempts=0;const argsSeen=[];
const db={rpc(name,args){argsSeen.push(args);return{abortSignal(){return this;},async retry(){return ++attempts===1?{error:{code:'40P01'}}:{data:result,error:null};}};}};
assert.deepEqual(await intakeDependencies(db).commit(committed),result);assert.equal(attempts,2);assert.strictEqual(argsSeen[0],argsSeen[1]);
console.log('PASS intake service: semantic/numeric validation before reads, scope/version gates, normalized factual snapshots, stable receipt identity, one-effect replay, bounded deadlock retry');
