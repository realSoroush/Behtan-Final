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
const deps={
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
const server=createServer(createPlanHandler(()=>deps));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/api/pro-plan`;
async function http(payload,headers={},method='POST'){
 const response=await fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer valid-token',...headers},...(method==='GET'?{}:{body:typeof payload==='string'?payload:JSON.stringify(payload)})});
 return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
}
try{
 equal((await http(null,{},'GET')).status,405);
 equal((await http(body,{Authorization:''})).status,401);
 equal((await http(body,{'Content-Type':'text/plain'})).status,415);
 equal((await http(body,{'sec-fetch-site':'cross-site'})).status,403);
 equal((await http('{invalid')).status,400);
 equal((await http('x'.repeat(9000))).status,413);
 const result=await http(body);equal(result.status,200);equal(result.cache,'no-store');equal(result.body.draft_id,generated.draft_id);
 equal((await http({...save,plan:{totalKcal:999999}})).status,400);
 equal((await http(save)).body,{id:'saved-id'});
}finally{await new Promise(r=>server.close(r));}
const savedFlag=process.env.PRO_SERVER_PLANS_ENABLED;
process.env.PRO_SERVER_PLANS_ENABLED='false';
assert.throws(()=>supabasePlanDependencies(),e=>e.code==='PRO_SERVER_NOT_CONFIGURED');checks++;
if(savedFlag===undefined)delete process.env.PRO_SERVER_PLANS_ENABLED;else process.env.PRO_SERVER_PLANS_ENABLED=savedFlag;
console.log(`PASS: ${checks} server/HTTP assertions; verified identity, RLS-scoped intake, authoritative engine, medical stops, snapshot-only publish, forged body rejection, retries`);
