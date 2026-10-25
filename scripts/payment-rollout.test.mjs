import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(import.meta.url);
async function client(functionName='payments-v3'){
 const built=await build({entryPoints:[root+'/src/lib/payments.ts'],bundle:true,platform:'node',format:'cjs',write:false,tsconfig:root+'/tsconfig.json',define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test-key',VITE_PAYMENTS_FUNCTION:functionName})},plugins:[{name:'payment-fixtures',setup(b){
  b.onLoad({filter:/supabaseClient\.ts$/},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'test-jwt'}}})}};`,loader:'js'}));
  b.onLoad({filter:/member[\\/]api\.ts$/},()=>({contents:`export async function memberRequest(action){globalThis.preflightCalls++;if(action!=='preflight')throw Error('Unexpected action');return {id:'test-preflight'};}`,loader:'js'}));
  b.onLoad({filter:/member[\\/]analytics\.ts$/},()=>({contents:`export function track(){}`,loader:'js'}));
 }}]});
 const m={exports:{}};new Function('module','exports','require',built.outputFiles[0].text)(m,m.exports,require);return m.exports;
}
const saved={fetch:globalThis.fetch,window:globalThis.window};
const requests=[];let redirects=[];globalThis.window={location:{assign:url=>redirects.push(url)}};
const plan={code:'silver',priceToman:10000,durationDays:30};
try {
 const api=await client();assert.equal(api.PAYMENT_FUNCTION,'payments-v3');
 globalThis.preflightCalls=0;
 globalThis.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return Response.json({error:'INVALID_REQUEST'},{status:400});};
 await assert.rejects(()=>api.startCheckout(plan),/پرداخت این نسخه هنوز آماده نیست/);
 assert.equal(globalThis.preflightCalls,0);assert.equal(requests.length,1);assert.equal(requests[0].body.action,'capabilities');assert.equal(redirects.length,0);
 assert(requests.every(r=>r.url.endsWith('/functions/v1/payments-v3')),'Never fall back to legacy production checkout');

 requests.length=0;
 globalThis.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);requests.push({url,body});return Response.json(body.action==='capabilities'?{checkoutProtocol:2}:{order:{status:'pending',mode:'live',paymentUrl:'https://payment.zarinpal.com/pg/StartPay/A1234567890123456789'}});};
 await api.startCheckout(plan);assert.equal(globalThis.preflightCalls,1);assert.deepEqual(requests.map(r=>r.body.action),['capabilities','create_v2']);
 assert.equal(requests[1].body.preflight,'test-preflight');assert.equal(redirects.length,1);assert(redirects[0].startsWith('https://payment.zarinpal.com/'));

 globalThis.preflightCalls=0;redirects=[];
 globalThis.fetch=async()=>Response.json({checkoutProtocol:1});
 await assert.rejects(()=>api.startCheckout(plan),/پرداخت این نسخه هنوز آماده نیست/);assert.equal(globalThis.preflightCalls,0);
 globalThis.fetch=async(_url,opts)=>Response.json(JSON.parse(opts.body).action==='capabilities'?{checkoutProtocol:2}:{error:'PENDING_ORDER_REVIEW_REQUIRED'},{status:JSON.parse(opts.body).action==='capabilities'?200:409});
 await assert.rejects(()=>api.startCheckout(plan),/سفارش قبلی با اطلاعات فعلی تفاوت دارد/);assert.equal(redirects.length,0);
 const production=await client('payments');assert.equal(production.PAYMENT_FUNCTION,'payments');
 await assert.rejects(()=>client('unknown-function'),/Invalid payments function/);
} finally {
 globalThis.fetch=saved.fetch;globalThis.window=saved.window;delete globalThis.preflightCalls;
}
// Trace the isolated entrypoint and its shared implementation without executing or deploying it.
const edge=await build({entryPoints:[root+'/supabase/functions/payments-v3/index.ts'],bundle:true,platform:'neutral',format:'esm',write:false});
assert(edge.outputFiles[0].text.includes('checkoutProtocol'));
assert(edge.outputFiles[0].text.includes('requirePreflight: true'));
assert(edge.outputFiles[0].text.includes('/api/payment-callback?token='));
console.log('PASS payment rollout: isolated endpoint, legacy detection before preflight, no fallback/charge, V2 preflight binding, live gateway redirect, pending-order messaging and bundled preview Edge entrypoint');
