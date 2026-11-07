import {test,expect,type Page} from '@playwright/test';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {once} from 'node:events';
import {createSyntheticIntakeMember} from '../../scripts/member-intake-database.mjs';
import {TEST_NUTRITION_CATALOG as catalog} from '../../scripts/setup-test-nutrition-catalog.mjs';
import {DEFAULT_PROTEIN_ENGINE_POLICY as policy} from '../../src/utils/proteinPolicy';
import {memberProfileContext,memberScheduleContext} from '../../src/utils/memberScheduleContext';
import {processMemberIntake,intakeDependencies} from '../../server/member/mealIntake';
import {memberHandler} from '../../server/member/http';
import {processMemberMealSchedule,mealScheduleDependencies} from '../../server/member/mealSchedule';
import type {Meal,UserProfile} from '../../src/types';
const secret='synthetic-postgrest-test-secret-32-characters-minimum';
const jwt=(claims:Record<string,unknown>)=>{
 const parts=[{alg:'HS256',typ:'JWT'},{...claims,exp:Math.floor(Date.now()/1000)+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url'));
 return [...parts,createHmac('sha256',secret).update(parts.join('.')).digest('base64url')].join('.');
};
const endpoint='http://127.0.0.1:54321';
const admin=createClient(endpoint,jwt({role:'service_role'}),{auth:{persistSession:false,autoRefreshToken:false}});
let server:Server,base:string,db:Client,user:string,other:string,token:string,fixture:any;
let held: {promise:Promise<void>;release:()=>void}|null=null;
const latch=()=>{let release!:()=>void;return{promise:new Promise<void>(r=>release=r),release};};
const intakeDeps=intakeDependencies(admin);
const planDeps={...mealScheduleDependencies(admin,endpoint),loadContext:async()=>({catalog,policy,revision:fixture.revision})};

test.beforeAll(async()=>{
 const connectionString=process.env.PRO_TEST_DATABASE_URL;if(!connectionString)throw Error('Disposable database required');
 const url=new URL(connectionString);expect(url.pathname).toBe('/behtan_pro_test');expect(['localhost','127.0.0.1']).toContain(url.hostname);
 db=new Client({connectionString});await db.connect();
 user=await createSyntheticIntakeMember({query:db.query.bind(db)});other=await createSyntheticIntakeMember({query:db.query.bind(db)});
 await db.query(`update user_profiles set birth_date='1992-04-23',gender='male',goal='weight_loss',activity_level='moderate',
 protein_budget_preference='balanced',workout_days=0,dietary_preferences_json=$2,medical_conditions_json=$3 where id=$1`,[user,
 {vegetarianStatus:'none',allergies:[]},{conditions:[],medications:'',injuries:'',pregnancyStatus:'not_applicable',eatingDisorderStatus:'none',safetyScreeningVersion:1,safetyAnswersConfirmed:true}]);
 const state=(await db.query("select member_read_meal_day($1,(now() at time zone 'Asia/Tehran')::date,null) s",[user])).rows[0].s;
 const profile=state.profile as UserProfile,day=(await db.query("select ((now() at time zone 'Asia/Tehran')::date)::text d")).rows[0].d;
 fixture={user,day,revision:state.catalog_revision,context:memberScheduleContext(profile,catalog,policy),profileContext:memberProfileContext(profile)};
 token=jwt({role:'authenticated',sub:user});
 const food=catalog.foods[0];fixture.meal={slot:'breakfast',label:'Synthetic meal',templateId:'synthetic',templateName:'Synthetic',consumed:false,
 components:[{foodItem:food,units:1,grams:food.gramsPerUnit,kcal:food.kcalPerUnit,protein:food.proteinPerUnit,carbs:food.carbsPerUnit,fat:food.fatPerUnit,fiber:food.fiberPerUnit}],
 totalKcal:food.kcalPerUnit,totalProtein:food.proteinPerUnit,totalCarbs:food.carbsPerUnit,totalFat:food.fatPerUnit,totalFiber:food.fiberPerUnit} satisfies Meal;
 // GoTrue is deliberately a synthetic verified JWT gate in this fixture.
 // The application HTTP handler, services, actual PostgREST and PG17 are real.
 server=createServer(memberHandler(()=>async(bearer,action,input)=>{
   const [header,payload,signature]=bearer.split('.');
   const expected=createHmac('sha256',secret).update(header+'.'+payload).digest();const supplied=Buffer.from(signature??'','base64url');
   if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw Error('AUTH_REQUIRED');
   const claims=JSON.parse(Buffer.from(payload,'base64url').toString());if(claims.exp<Date.now()/1000||claims.sub!==user)throw Error('AUTH_REQUIRED');
   if(action==='meal_intake'){const gate=held;held=null;await gate?.promise;return processMemberIntake(user,input,intakeDeps);}
   return processMemberMealSchedule(user,input,planDeps);
 }));server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+(server.address() as {port:number}).port;
});
test.afterAll(async()=>{held?.release();server?.closeAllConnections();await new Promise<void>(r=>server?.close(()=>r()));await db?.end();});
async function open(page:Page){
 await page.addInitScript(({fixture,token})=>{(window as any).intakeFixture=fixture;localStorage.setItem('sb-pro-test-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:fixture.user}}));},{fixture,token});
 await page.route('**/api/member',async route=>route.fulfill({response:await route.fetch({url:base,timeout:25000})}));
 await page.goto('/tests/member-intake/harness.html');await expect(page.getByRole('button',{name:'record',exact:true})).toBeEnabled();
}

test('two browser contexts: conflict, recovery, persistence and receipt replay over real PostgREST',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
 const gate=latch();
 try{
  await open(a);await open(b);
  const old=await b.getByTestId('revision').textContent();
  // Hold the real transaction to observe optimistic preview independently.
  held=gate;
  await a.getByRole('button',{name:'record',exact:true}).click();
  await expect(a.getByTestId('recorded')).toHaveText('true');await expect(a.getByTestId('pending')).toHaveText('true');gate.release();
  await expect(a.getByTestId('pending')).toHaveText('false');await expect(a.getByTestId('revision')).not.toHaveText(old!);
  // B still displays the exact old revision. It must not delete A's fact.
  await b.getByRole('button',{name:'skip',exact:true}).click();await expect(b.getByRole('alert')).toContainText('ثبت‌های روز تغییر');
  expect((await intakeDeps.read(user,fixture.day,randomUUID())).checkins.breakfast).toBeTruthy();
  await b.getByRole('button',{name:'reload state'}).click();await expect(b.getByTestId('recorded')).toHaveText('true');
  await b.getByRole('button',{name:'skip',exact:true}).click();await expect(b.getByTestId('pending')).toHaveText('false');
  await b.reload();await expect(b.getByTestId('skipped')).toHaveText('true');await expect(b.getByTestId('recorded')).toHaveText('false');
  await a.bringToFront();await a.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(a.getByTestId('skipped')).toHaveText('true');
  // Commit both responses then lose them. Manual recovery must retry the same ID.
  const keys:string[]=[];let lost=0;
  await a.route('**/api/member',async route=>{
   const body=route.request().postDataJSON();if(body.action!=='meal_intake')return route.fallback();
   keys.push(body.input.requestId);await route.fetch({url:base});if(lost++<2)return route.abort('connectionreset');return route.fulfill({response:await route.fetch({url:base})});
  });
  await a.getByRole('button',{name:'record',exact:true}).click();await expect(a.getByRole('alert')).toContainText('نتیجهٔ ذخیره');
  await a.getByRole('button',{name:'reload state'}).click();await expect(a.getByRole('alert')).toHaveText('');
  expect(new Set(keys).size).toBe(1);await expect(a.getByTestId('recorded')).toHaveText('true');
  const count=(await db.query('select count(*)::int n from member_meal_schedule_operations where user_id=$1 and request_id=$2',[user,keys[0]])).rows[0].n;expect(count).toBe(1);
 }finally{gate.release();held?.release();await ca.close();await cb.close();}
});

test('actual REST privilege boundaries reject browser writes, forged actors and legacy RPCs',async()=>{
 const client=createClient(endpoint,token,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const table of ['daily_meal_checkins','member_skipped_meals','member_extra_foods','member_meal_schedule']){
  const {error}=await client.from(table).delete().eq('user_id',user);expect(error?.code).toBe('42501');
 }
 expect((await client.rpc('member_read_meal_day',{p_user:other,p_day:fixture.day,p_request_id:null})).error?.code).toBe('42501');
 expect((await client.rpc('save_member_meal_schedule_v3',{p_today:fixture.day,p_context:'forged',p_days:[],p_expected_diet:{},p_replace:false,p_meal_edit:false})).error?.code).toBe('42501');
 const rows=await client.from('daily_meal_checkins').select('user_id');expect(rows.error).toBeNull();expect(rows.data!.every(r=>r.user_id===user)).toBe(true);
 const day=await intakeDeps.read(user,fixture.day,randomUUID());
 const bad=await fetch(base,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action:'meal_intake',input:{date:fixture.day,requestId:randomUUID(),kind:'extra-remove',id:randomUUID(),catalogRevision:day.catalog_revision,profileContext:fixture.profileContext,intakeRevision:day.intake_revision,expectedUpdatedAt:day.schedule?.updated_at??null,user:other}})});
 expect(bad.status).toBe(400);
});
