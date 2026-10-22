import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFile,unlink} from 'node:fs/promises';
const output=new URL('./.food-scan-edge-test.mjs',import.meta.url);
await build({entryPoints:['supabase/functions/food-scan/index.ts'],outfile:output.pathname,bundle:true,platform:'node',format:'esm',plugins:[{name:'serve-test',setup(b){b.onResolve({filter:/^https:/},()=>({path:'serve',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function serve(handler){globalThis.foodScanHandler=handler}',loader:'js'}));}}]});
const env={GEMINI_API_KEY:'test-key',SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test-anon'};globalThis.Deno={env:{get:k=>env[k]}};
const food={confidence:'medium',note:'تخمینی',foods:[{name:'برنج پخته',grams:125,kcalPer100:130,proteinPer100:2.7,carbsPer100:28,fatPer100:.3,fiberPer100:.4}]};let calls=[],mode='ok';const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{calls.push(String(url));if(String(url).endsWith('/auth/v1/user'))return Response.json(mode==='noauth'?{}:{id:'u'},{status:mode==='noauth'?401:200});if(String(url).includes('/rpc/'))return Response.json(mode!=='quota');assert.equal(options.headers['x-goog-api-key'],'test-key');const request=JSON.parse(options.body);assert(request.systemInstruction);assert(!JSON.stringify(request).includes('gender'));return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(mode==='bad'?{...food,confidence:'high'}:food)}]}}]});};
try{
 await import(output.href);const handler=globalThis.foodScanHandler;const photo='data:image/jpeg;base64,'+Buffer.from([255,216,255,0]).toString('base64');
 const request=(body={imageBase64:photo},auth=true,origin='https://behtan.fit')=>new Request('https://test/food-scan',{method:'POST',headers:{'content-type':'application/json',origin,...(auth?{authorization:'Bearer synthetic'}:{})},body:JSON.stringify(body)});
 assert.equal((await handler(request({},false))).status,401);assert.equal((await handler(request({},true,'https://untrusted.invalid'))).status,403);assert.equal(calls.length,0);
 assert.equal((await handler(request({imageBase64:'data:image/jpeg;base64,YWJjZA=='}))).status,400);
 mode='noauth';assert.equal((await handler(request())).status,401);mode='quota';calls=[];assert.equal((await handler(request())).status,429);assert.equal(calls.length,2);
 mode='bad';assert.equal((await handler(request())).status,502);mode='ok';const res=await handler(request());assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');assert.deepEqual(await res.json(),food);
 console.log('✓ Food-scan server: CORS, authentication, image signature, quota enforcement, provider schema, bounded result validation and no-store responses');
}finally{globalThis.fetch=originalFetch;delete globalThis.Deno;delete globalThis.foodScanHandler;await unlink(output);}
