import {proHealth} from '../server/proHealth.ts';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createPlanHandler } from '../server/proPlanHttp.ts';
import { supabasePlanDependencies } from '../server/proPlanSupabase.ts';
import { ProServerError, processPlanRequest } from '../server/proPlanService.ts';
import { TEST_NUTRITION_CATALOG } from './setup-test-nutrition-catalog.mjs';
import { DEFAULT_PROTEIN_ENGINE_POLICY } from '../src/utils/proteinPolicy.ts';
import { emptyRealIntake, menuCombinationsFeasible } from '../src/professional/menuPlan.ts';
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const reject=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);checks++;};
const org=randomUUID(),record=randomUUID(),actor=randomUUID();
const body={action:'generate',org,record,revision:1,key:randomUUID(),date:'2026-10-21',count:4,notes:'متن مراجع'};
let answers={...emptyRealIntake(),display_name:'مراجع سرور',birth_date:'1992-04-23',height_cm:165,weight_kg:75,safety_confirmed:true};
const drafts=new Map(); let stageCalls=0, publishCalls=0, deny=false;
const failures=[];
const deps={
 async reportFailure(x){failures.push(x);},
 async verifyToken(token){if(token!=='valid-token') throw new ProServerError('PRO_AUTH_REQUIRED',401);return actor;},
 async readCase(token,o,r){assert.equal(token,'valid-token');if(deny||o!==org||r!==record)throw new ProServerError('PRO_ACCESS_DENIED',403);return {revision:1,answers};},
 async loadNutrition(){return {catalog:TEST_NUTRITION_CATALOG,policy:DEFAULT_PROTEIN_ENGINE_POLICY};},
 async stage(x){stageCalls++;assert.equal(x.actor,actor);const prior=drafts.get(x.key);if(prior)return prior;const d={draft_id:randomUUID(),plan:structuredClone(x.plan)};drafts.set(x.key,d);return d;},
 async publish(x){publishCalls++;if(deny)throw new ProServerError('PRO_ACCESS_DENIED',403);assert.equal(x.actor,actor);if(![...drafts.values()].some(d=>d.draft_id===x.draft))throw new ProServerError('PRO_INVALID_PLAN');return 'saved-id';},
};
await reject(()=>processPlanRequest(body,'',deps),'PRO_AUTH_REQUIRED');
await reject(()=>processPlanRequest(body,'forged-token',deps),'PRO_AUTH_REQUIRED');
for(const change of [{plan:{days:[]}},{answers:{weight_kg:1}},{targetCalories:1},{actor:randomUUID()},{revision:0},{revision:1.5},{org:'x'},{count:5},{count:1.5},{date:'2026-02-31'},{date:'bad'},{notes:'x'.repeat(2001)}])
 await reject(()=>processPlanRequest({...body,...change},'valid-token',deps),'PRO_INVALID_REQUEST');
await reject(()=>processPlanRequest({...body,revision:2},'valid-token',deps),'PRO_STALE_REVISION');
deny=true;await reject(()=>processPlanRequest(body,'valid-token',deps),'PRO_ACCESS_DENIED');deny=false;
answers={...answers,medical_conditions:['kidney_disease']};
await reject(()=>processPlanRequest(body,'valid-token',deps),'PRO_MEDICAL_STOP');
equal(stageCalls,0);answers={...answers,medical_conditions:[]};
const generated=await processPlanRequest(body,'valid-token',deps);
equal(generated.plan.display_name,answers.display_name);
equal(generated.plan.intake_revision,1);
for(const d of generated.plan.days)equal(menuCombinationsFeasible(d.slots,d.targets),true);
equal((await processPlanRequest(body,'valid-token',deps)).draft_id,generated.draft_id);
equal(drafts.size,1);
const save={action:'save',org,record,revision:1,key:randomUUID(),draft:generated.draft_id};
await reject(()=>processPlanRequest({...save,plan:{targetCalories:1}},'valid-token',deps),'PRO_INVALID_REQUEST');
equal(publishCalls,0);
equal(await processPlanRequest(save,'valid-token',deps),{id:'saved-id'});
await reject(()=>processPlanRequest({...save,draft:randomUUID()},'valid-token',deps),'PRO_INVALID_PLAN');
deny=true;await reject(()=>processPlanRequest(save,'valid-token',deps),'PRO_ACCESS_DENIED');deny=false;
// Actual HTTP request parsing/response boundaries; dependencies emulate Supabase,
// while generation above uses the real engine and fixture catalog.
const server=createServer(createPlanHandler(()=>deps,async()=>({ready:true,missing:[]})));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/api/pro-plan`;
async function http(payload,headers={},method='POST'){
 const response=await fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer valid-token',...headers},...(method==='GET'?{}:{body:typeof payload==='string'?payload:JSON.stringify(payload)})});
 return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
}
try{
 equal((await http(null,{},'GET')).body,{ready:true,missing:[]});
 equal((await http(body,{Authorization:''})).status,401);
 equal((await http(body,{'Content-Type':'text/plain'})).status,415);
 equal((await http(body,{'sec-fetch-site':'cross-site'})).status,403);
 equal((await http('{invalid')).status,400);
 equal((await http('x'.repeat(9000))).status,413);
 const result=await http(body);equal(result.status,200);equal(result.cache,'no-store');equal(result.body.draft_id,generated.draft_id);
 equal((await http({...save,plan:{totalKcal:999999}})).status,400);
 equal((await http(save)).body,{id:'saved-id'});
 answers={...answers,medical_conditions:['kidney_disease']};
 const blocked=await http({...body,key:randomUUID()});equal(blocked.body.error,'PRO_MEDICAL_STOP');
 equal(failures.at(-1).code,'PRO_MEDICAL_STOP');equal(failures.at(-1).actor,actor);
 equal(Object.keys(failures.at(-1)).sort(),['actor','code','id','operation','org']);
 equal(JSON.stringify(failures).includes('kidney_disease'),false);
 answers={...answers,medical_conditions:[]};
}finally{await new Promise(r=>server.close(r));}
const savedFlag=process.env.PRO_SERVER_PLANS_ENABLED;
process.env.PRO_SERVER_PLANS_ENABLED='false';
assert.throws(()=>supabasePlanDependencies(),e=>e.code==='PRO_SERVER_NOT_CONFIGURED');checks++;
if(savedFlag===undefined)delete process.env.PRO_SERVER_PLANS_ENABLED;else process.env.PRO_SERVER_PLANS_ENABLED=savedFlag;

// Exercise the health adapter through the actual Supabase SDK with controlled HTTP.
const originalFetch=globalThis.fetch;
const names=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRO_SERVER_PLANS_ENABLED'];
const originalEnv=Object.fromEntries(names.map(n=>[n,process.env[n]]));
let healthMode='ready';
try{
 Object.assign(process.env,{VITE_SUPABASE_URL:'https://health-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test-never-expose',PRO_SERVER_PLANS_ENABLED:'true'});
 globalThis.fetch=async(input,init)=>{
  const path=new URL(String(input)).pathname;
  if(path.endsWith('/auth/v1/user'))return new Response(JSON.stringify(healthMode==='auth-denied'?{message:'denied'}:{id:actor,phone:'989000000000',phone_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}),{status:healthMode==='auth-denied'?401:200,headers:{'Content-Type':'application/json'}});
  if(path.endsWith('/pro_pilot_status'))return new Response(JSON.stringify(healthMode!=='access-denied'),{headers:{'Content-Type':'application/json'}});
  assert(path.endsWith('/pro_service_status'));
  assert.equal(new Headers(init.headers).get('apikey'),'private-test-never-expose');
  if(healthMode==='bad-key')return new Response(JSON.stringify({message:'invalid api key'}),{status:401});
  if(healthMode==='migration')return new Response(JSON.stringify({message:'missing function',code:'PGRST202'}),{status:404});
  return new Response(JSON.stringify('operations-v2'),{headers:{'Content-Type':'application/json'}});
 };
 const healthy=await proHealth('valid-token');equal(healthy.ready,true);equal(healthy.scope,'server-and-migration');equal(JSON.stringify(healthy).includes('private-test-never-expose'),false);
 process.env.PRO_SERVER_PLANS_ENABLED='false';equal((await proHealth('valid-token')).missing,['PRO_SERVER_PLANS_ENABLED']);process.env.PRO_SERVER_PLANS_ENABLED='true';
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;equal((await proHealth('valid-token')).missing,['SUPABASE_SERVICE_ROLE_KEY']);process.env.SUPABASE_SERVICE_ROLE_KEY='private-test-never-expose';
 for(const [mode,code] of [['auth-denied','PRO_AUTH_REQUIRED'],['access-denied','PRO_ACCESS_DENIED'],['bad-key','PRO_SERVER_CREDENTIAL_INVALID'],['migration','PRO_MIGRATION_REQUIRED']]){healthMode=mode;await reject(()=>proHealth('valid-token'),code);}
}finally{
 globalThis.fetch=originalFetch;
 for(const n of names){if(originalEnv[n]===undefined)delete process.env[n];else process.env[n]=originalEnv[n];}
}
console.log(`PASS: ${checks} server/HTTP assertions; verified identity, RLS-scoped intake, authoritative engine, medical stops, snapshot-only publish, forged body rejection, retries`);
