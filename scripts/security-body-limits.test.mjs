import assert from 'node:assert/strict';
import {readFile, unlink} from 'node:fs/promises';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
const output=new URL('./.security-body-limits-test.mjs',import.meta.url);
const originalFetch=globalThis.fetch;
try {
 await build({stdin:{contents:`export * from './supabase/functions/_shared/boundedBody.ts'; export {paymentHandler} from './supabase/functions/payments/core.ts'; import './supabase/functions/body-scan/index.ts'; import './supabase/functions/send-sms/index.ts';`,resolveDir:process.cwd(),loader:'ts'},outfile:output.pathname,bundle:true,platform:'node',format:'esm',plugins:[{name:'serve-test',setup(b){b.onResolve({filter:/^https:/},args=>({path:args.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path.includes('standardwebhooks')?'export class Webhook {verify(){throw new Error("Test must not reach signature verification")}}':'export function serve(handler){globalThis.bodyScanHandler=handler}',loader:'js'}));}}]});
 const env={GEMINI_API_KEY:'synthetic',SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'synthetic'};
 globalThis.Deno={env:{get:k=>env[k]},serve(handler){globalThis.smsHandler=handler;}};
 const {readBoundedText,PayloadTooLargeError,paymentHandler}=await import(output.href);
 const request=(chunks,headers={})=>new Request('https://test/scan',{method:'POST',headers,duplex:'half',body:new ReadableStream({pull(c){if(chunks.length)c.enqueue(chunks.shift());else c.close();},cancel(){chunks.length=0;}})});
 const utf=new TextEncoder().encode('سلام');
 assert.equal(await readBoundedText(request([utf.slice(0,1),utf.slice(1)]),utf.length),'سلام');
 assert.equal(await readBoundedText(request([new Uint8Array(4)]),4),'\0'.repeat(4));
 const chunks=[new Uint8Array(3),new Uint8Array(3),new Uint8Array(100)];
 await assert.rejects(()=>readBoundedText(request(chunks),5),PayloadTooLargeError);assert.equal(chunks.length,0);
 await assert.rejects(()=>readBoundedText(request([new Uint8Array(1)],{'content-length':'9'}),5),PayloadTooLargeError);
 const payment=paymentHandler({site:'https://behtan.fit',authenticate:async()=>{throw new Error('Invalid input must not reach authentication');}});
 for(const raw of ['null','[]','1','{'])assert.equal((await payment(new Request('https://test/payments',{method:'POST',body:raw}))).status,400);
 assert.equal((await payment(request([new Uint8Array(4096),new Uint8Array(1)]))).status,413);
 assert.equal((await payment(request([new TextEncoder().encode('س'.repeat(2049))]))).status,413);
 assert.equal((await globalThis.smsHandler(request([new Uint8Array(64000),new Uint8Array(1)],{'content-type':'application/json'}))).status,413);
 const handler=globalThis.bodyScanHandler;
 let mode='ok',calls=[];
 const result={bodyFatPct:25,biologicalAge:30,bodyType:'mesomorph',estimatedMuscleMass:'average',narrative:'تخمینی',confidence:'low'};
 globalThis.fetch=async(url)=>{calls.push(String(url));if(String(url).endsWith('/auth/v1/user'))return Response.json(mode==='noauth'?{}:{id:'synthetic'});if(String(url).endsWith('/rpc/reserve_body_scan'))return Response.json(mode!=='quota',{status:mode==='quota-error'?503:200});return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});};
 const scan=()=>new Request('https://test/scan',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic',origin:'https://behtan.fit'},body:JSON.stringify({imageBase64:'data:image/jpeg;base64,'+Buffer.from([255,216,255,0]).toString('base64'),gender:'male',heightCm:178,weightKg:90,age:25})});
 mode='quota';assert.equal((await handler(scan())).status,429);assert.equal(calls.length,2);
 calls=[];mode='quota-error';assert.equal((await handler(scan())).status,503);assert.equal(calls.length,2);
 calls=[];mode='noauth';assert.equal((await handler(scan())).status,401);assert.equal(calls.length,1);
 calls=[];mode='ok';const res=await handler(scan());assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.deepEqual(await res.json(),result);assert.equal(calls.length,3);
 calls=[];assert.equal((await handler(request([new Uint8Array(8*1024*1024),new Uint8Array(1)],{'content-type':'application/json',authorization:'Bearer synthetic'}))).status,413);assert.equal(calls.length,1);
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant all on tables to anon,authenticated;`);
  const sql=await readFile(new URL('../supabase/migrations/20261023_034_body_scan_quota.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  const a=randomUUID(),b=randomUUID(),unverified=randomUUID();
  await db.query("insert into auth.users values($1,'989111111111',now()),($2,'989122222222',now()),($3,'989133333333',null)",[a,b,unverified]);
  const as=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const reserve=async()=> (await db.query('select public.reserve_body_scan() as ok')).rows[0].ok;
  await db.exec('set role anon');await assert.rejects(reserve,/permission denied/);
  await as('');await assert.rejects(reserve,/AUTH_REQUIRED/);
  await as(unverified);await assert.rejects(reserve,/AUTH_REQUIRED/);
  await as(a);assert.equal(await reserve(),true);assert.equal(await reserve(),false);
  await assert.rejects(()=>db.query('select * from member_body_scan_usage'),/permission denied/);
  await assert.rejects(()=>db.query('delete from member_body_scan_usage'),/permission denied/);
  for(let i=2;i<=5;i++){await db.exec('reset role');await db.query("update member_body_scan_usage set last_request_at=now()-interval '11 seconds' where user_id=$1",[a]);await as(a);assert.equal(await reserve(),true);}
  await db.exec('reset role');await db.query("update member_body_scan_usage set last_request_at=now()-interval '11 seconds' where user_id=$1",[a]);await as(a);assert.equal(await reserve(),false);
  await as(b);assert.equal(await reserve(),true);
  await db.exec('reset role');await db.query("update member_body_scan_usage set usage_date=current_date-1 where user_id=$1",[a]);await as(a);assert.equal(await reserve(),true);
 } finally {await db.close();}
 console.log('PASS: bounded chunked/UTF-8 requests, cancellation, body-scan auth and quota fail-closed, no-store, real SQL grants/identity/cooldown/daily limit/isolation/reset and repeat migration');
} finally {globalThis.fetch=originalFetch;delete globalThis.Deno;delete globalThis.bodyScanHandler;delete globalThis.smsHandler;await unlink(output).catch(()=>{});}
