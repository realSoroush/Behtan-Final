import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createServer} from 'node:http';
import {AccountError,accountInput,provisionAccount,createProAccountHandler,accountDependencies} from '../server/proAccountHttp.ts';
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++};
const body={phone:'۰۹۱۲۱۲۳۴۵۶۷',name:' پنل تست ',expires:new Date(Date.now()+86400000).toISOString(),limit:20,reason:'تست داخلی',key:randomUUID()};
const input=accountInput(body);equal(input.phone,'989121234567');equal(input.name,'پنل تست');
for(const change of [{phone:'123'},{phone:'+9891212345677'},{phone:''},{name:''},{limit:1.2},{limit:100001},{key:'bad'},{reason:'x'},{expires:'bad'},{expires:'2020-01-01'},{phone_confirm:true},{actor:randomUUID()}]){assert.throws(()=>accountInput({...body,...change}),/PRO_INVALID_REQUEST/);checks++;}
const actor=randomUUID(),user=randomUUID(),org=randomUUID();let creations=0,lookups=0,exists=false,denied=false;
const deps={async authenticate(){if(denied)throw new AccountError('ADMIN_REQUIRED',403);return actor},async lookup(a,p){equal(a,actor);equal(p,input.phone);lookups++;return exists?user:null},async create(){creations++;exists=true;return user},async provision(a,u,x){equal(a,actor);equal(u,user);equal(x,input);return org}};
equal((await provisionAccount(input,'token',deps)).organization_id,org);await provisionAccount(input,'token',deps);equal(creations,1);
denied=true;await assert.rejects(()=>provisionAccount(input,'forged',deps),/ADMIN_REQUIRED/);checks++;equal(creations,1);equal(lookups,2);denied=false;
let raceLookup=0;await provisionAccount(input,'token',{...deps,async lookup(){return ++raceLookup===1?null:user},async create(){throw new Error('duplicate phone')}});equal(raceLookup,2);
const server=createServer(createProAccountHandler(()=>deps));await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{const url=`http://127.0.0.1:${server.address().port}`;for(const [headers,content,status] of [[{},body,401],[{Authorization:'Bearer token','Content-Type':'text/plain'},body,415],[{Authorization:'Bearer token','Content-Type':'application/json','sec-fetch-site':'cross-site'},body,403],[{Authorization:'Bearer token','Content-Type':'application/json'},'bad json',400],[{Authorization:'Bearer token','Content-Type':'application/json'},'x'.repeat(5000),413]]){const r=await fetch(url,{method:'POST',headers,body:typeof content==='string'?content:JSON.stringify(content)});equal(r.status,status);equal(Boolean(r.headers.get('x-request-id')),true);}const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer token','Content-Type':'application/json'},body:JSON.stringify(body)});equal(r.status,200);equal((await r.json()).user_id,user);}finally{await new Promise(r=>server.close(r));}
const names=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRO_ADMIN_ACCOUNTS_ENABLED'];const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));const originalFetch=globalThis.fetch;
try{
 Object.assign(process.env,{VITE_SUPABASE_URL:'https://account-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-test',PRO_ADMIN_ACCOUNTS_ENABLED:'true'});
 let confirmed;globalThis.fetch=async(url,init)=>{const p=new URL(String(url)).pathname;if(p.endsWith('/auth/v1/admin/users')){const payload=JSON.parse(init.body);confirmed=payload.phone_confirm;equal(payload.phone,'+989121234567');return new Response(JSON.stringify({id:user,phone:payload.phone}),{headers:{'Content-Type':'application/json'}});}throw new Error('Unexpected SDK request '+p)};
 equal(await accountDependencies().create(input.phone),user);equal(confirmed,false,'admin creation never confirms a phone');
 process.env.PRO_ADMIN_ACCOUNTS_ENABLED='false';assert.throws(()=>accountDependencies(),/PRO_ADMIN_NOT_CONFIGURED/);checks++;
}finally{globalThis.fetch=originalFetch;for(const k of names){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}}
console.log(`PASS: ${checks} account provisioning assertions; admin gate, validation, phone normalization, retry/race recovery, HTTP limits and unconfirmed Auth creation`);
