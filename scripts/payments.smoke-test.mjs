import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { paymentHandler, verifyOrder } from '../supabase/functions/payments/core.ts';
import { parseGatewayReply, gatewayCall } from '../supabase/functions/payments/gateway.ts';
import callbackHandler from '../api/payment-callback.ts';

const user=randomUUID(), other=randomUUID();
const template=()=>({id:randomUUID(),user_id:user,plan_code:'gold',plan_name:'طلایی',price_toman:249000,amount_rial:2490000,duration_days:30,mode:'sandbox',status:'creating',authority:null,callback_token:randomUUID(),ref_id:null,created_at:new Date().toISOString(),verified_at:null});
function setup(){
  const order=template(), subscriptions=[], calls=[];
  const settings={mode:'sandbox',checkout_enabled:true};
  let lease=false, failSettle=false, verified=false, gatewayError=false, eligible=true;
  const db={
    settings:async()=>settings,
    subscriptions:async()=>subscriptions,
    orders:async query=>{
      if(query.includes(`user_id=eq.${other}`))return [];
      if(query.includes('authority=eq.Awrong'))return [];
      if(query.includes('callback_token=eq.') && !query.includes(order.callback_token))return [];
      return [order];
    },
    update:async(_id,fields)=>{Object.assign(order,fields);if(fields.verify_lease_until===null)lease=false;},
    rpc:async(name,args)=>{
      if(name==='billing_begin_order'){
        assert.equal(args.p_user,user);
        if(args.p_price!==order.price_toman || args.p_days!==order.duration_days)throw new Error('OFFER_CHANGED');
        return {...order,is_new:true};
      }
      if(name==='billing_claim_verify'){if(lease)return false;lease=true;return true;}
      if(name==='billing_settle'){
        if(failSettle){failSettle=false;throw new Error('DB outage');}
        if(!subscriptions.length)subscriptions.push({source_order_id:order.id,mode:order.mode});
        order.status='paid';order.ref_id=args.p_ref;order.last_code=args.p_code;return subscriptions[0];
      }
      throw new Error(name);
    },
  };
  let verifiedPhone=true;
  const deps={db,site:'https://behtan.fit',reconcileSecret:'test-server-only-secret',
    authenticate:async token=>token==='valid'?{id:user,phone:verifiedPhone?'+989121234567':null,phone_confirmed_at:verifiedPhone?new Date().toISOString():null}:token==='other'?{id:other,phone:'+989121234568',phone_confirmed_at:new Date().toISOString()}:null,
    eligible:async()=>eligible,
    gateway:async(mode,method,body)=>{
      calls.push({mode,method,body});
      if(gatewayError)throw new Error('timeout');
      if(method==='request')return {code:100,authority:`${mode==='live'?'A':'S'}0000000000000000012345678901234567`};
      if(method==='inquiry')return {code:100,status:'PAID'};
      const code=verified?101:100;verified=true;
      return {code,ref_id:'9876543210123456789'};
    },
  };
  const handler=paymentHandler(deps);
  const post=(body,token='valid')=>handler(new Request('https://example.supabase.co/functions/v1/payments',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'https://behtan.fit'},body:JSON.stringify(body)}));
  return {order,subscriptions,calls,settings,deps,handler,post,failNextSettle:()=>{failSettle=true;},timeout:()=>{gatewayError=true;},block:()=>{eligible=false;},unverifyPhone:()=>{verifiedPhone=false;}};
}
const quote={action:'create',planCode:'gold',priceToman:249000,durationDays:30};
let f=setup();
assert.equal((await f.post(quote,'bad')).status,401);
assert.equal((await f.post({...quote,priceToman:0})).status,409);
assert.equal(f.calls.length,0);
assert.equal((await f.post(quote)).status,200);
assert.equal(f.calls[0].body.amount,2490000);
assert.equal(f.calls[0].body.currency,'IRR');
assert.equal(f.calls[0].body.metadata.auto_verify,false);
assert.match(f.calls[0].body.callback_url,/https:\/\/behtan.fit\/api\/payment-callback\?token=/);
assert.equal(f.order.status,'pending');
assert.equal((await f.post({action:'verify',token:f.order.callback_token},'other')).status,404);
assert.equal(f.subscriptions.length,0);
const callback=new URL(`https://example.supabase.co/functions/v1/payments?token=${f.order.callback_token}&Authority=${f.order.authority}&Status=NOK`);
await f.handler(new Request(callback));
assert.equal(f.subscriptions.length,0,'NOK must not activate anything');
callback.searchParams.set('Status','OK');
callback.searchParams.set('Authority','Awrong000000000000000');
assert.equal((await f.handler(new Request(callback))).status,404);
callback.searchParams.set('Authority',f.order.authority);
await Promise.all([f.handler(new Request(callback)),f.handler(new Request(callback))]);
assert.equal(f.subscriptions.length,1);
assert.equal(f.calls.filter(c=>c.method==='verify').length,1,'Lease prevents concurrent gateway verification');
await f.handler(new Request(callback));
assert.equal(f.subscriptions.length,1);

f=setup();await f.post(quote);f.failNextSettle();
await assert.rejects(()=>verifyOrder(f.order,f.deps),/DB outage/);
assert.equal(f.subscriptions.length,0);
await verifyOrder(f.order,f.deps);
assert.equal(f.subscriptions.length,1);assert.equal(f.order.last_code,101,'Recover DB outage after successful gateway verify');

f=setup();f.order.price_toman=0;f.order.amount_rial=0;
assert.equal((await f.post({...quote,priceToman:0})).status,200);
assert.equal(f.calls.length,0);assert.equal(f.subscriptions.length,1,'Free order activates without gateway');
f=setup();f.settings.mode='live';f.order.mode='live';
assert.equal((await f.post(quote)).status,200,'Confirmed Iranian phone must be allowed to create a live payment');
assert.equal(f.calls[0].mode,'live');
assert.match(f.order.authority,/^A/);
f=setup();f.settings.mode='live';f.order.mode='live';f.unverifyPhone();
assert.equal((await f.post(quote)).status,403,'Unverified phone cannot spend real money');
assert.equal(f.calls.length,0);
f=setup();f.block();assert.equal((await f.post(quote)).status,403);
f=setup();await f.post(quote);f.timeout();
assert.equal((await f.post({action:'verify',token:f.order.callback_token})).status,503);
assert.equal(f.order.status,'pending');assert.equal(f.subscriptions.length,0);
f=setup();assert.equal((await f.post({action:'reconcile'})).status,401);
assert.equal((await f.post({action:'reconcile'},'test-server-only-secret')).status,200);
assert.equal((await f.handler(new Request('https://example.test',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}))).status,403);
assert.equal(parseGatewayReply('{"data":{"code":100,"ref_id":9876543210123456789}}').ref_id,'9876543210123456789');
assert.throws(()=>parseGatewayReply('<html>oops</html>'));
assert.equal(parseGatewayReply('{"errors":{"code":-10}}').code,-10);
let sent;
await gatewayCall('live','test-merchant','verify',{amount:1230,authority:'A123456789012'},async(url,options)=>{
  sent={url,...JSON.parse(options.body)};return new Response('{"data":{"code":101,"ref_id":123}}');
});
assert.equal(sent.url,'https://payment.zarinpal.com/pg/v4/payment/verify.json');
assert.equal(sent.merchant_id,'test-merchant');assert.equal(sent.amount,1230);
const savedFetch=globalThis.fetch, savedBase=process.env.VITE_SUPABASE_URL;
try {
  process.env.VITE_SUPABASE_URL='https://test-project.supabase.co';
  let relayed;
  globalThis.fetch=async url=>{relayed=String(url);throw new Error('network timeout');};
  const token=randomUUID();
  const response={headers:{},setHeader(name,value){this.headers[name]=value;},end(){}};
  await callbackHandler({method:'GET',url:`/api/payment-callback?token=${token}&Authority=S123456789012345&Status=OK&redirect=https://evil.example`},response);
  assert.equal(response.statusCode,303);
  assert.equal(response.headers.Location,`/?payment=${token}#auth`,'Timeout must still return to same-domain result and login');
  assert.equal(response.headers['Referrer-Policy'],'no-referrer');
  assert.match(relayed,/https:\/\/test-project.supabase.co\/functions\/v1\/payments/);
  const invalid={...response,headers:{}};
  await callbackHandler({method:'GET',url:'/api/payment-callback?token=bad'},invalid);
  assert.equal(invalid.statusCode,400);
} finally {
  globalThis.fetch=savedFetch;
  if(savedBase===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=savedBase;
}
console.log('✅ Payment HTTP tests: quote integrity, rial conversion, confirmed-phone live gate, auth/ownership, callback forgery, duplicate verify, 101 recovery, free plan, medical gate, timeout and reconciliation authorization');
