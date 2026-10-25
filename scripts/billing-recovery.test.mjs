import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { paymentHandler } from '../supabase/functions/payments/core.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const plans=[{code:'silver',name:'تغذیه',theme:'silver',priceToman:10000,priceNote:'ماهانه',durationDays:30,features:['برنامهٔ غذایی']},{code:'trial',name:'آزمایشی',theme:'green',priceToman:0,priceNote:'۳ روز',durationDays:3,features:['آزمایش برنامه']}];
const mocks={
  'payments.ts':`export const paymentRequest=body=>globalThis.billingRequest(body);export const startCheckout=plan=>globalThis.billingCheckout(plan);`,
  'useSubscriptionPlans.ts':`export function useSubscriptionPlans(){return {plans:globalThis.billingPlans,loading:false,error:null,refetch:async()=>globalThis.billingPlans}}`,
  'analytics.ts':`export function track(){}`,
  'ThemeToggle.tsx':`export function ThemeToggle(){return <button aria-label="تغییر تم"/>}`,
  'BehtanMascot.tsx':`export function BehtanMascot(){return <button aria-label="کاراکتر به‌تن"/>}`,
};
const compiled=await build({
  stdin:{contents:`export {BillingAccess} from './src/components/billing/BillingAccess';export {Step11Paywall} from './src/components/onboarding/Step11Paywall';export {useOnboardingStore as store} from './src/hooks/useOnboardingStore';export {createElement} from 'react';export {act,create} from 'react-test-renderer';`,resolveDir:root},
  bundle:true,platform:'node',format:'cjs',write:false,tsconfig:root+'/tsconfig.json',external:['react','react/jsx-runtime','react-test-renderer'],
  plugins:[{name:'billing-fixtures',setup(b){
    b.onResolve({filter:/^framer-motion$/},()=>({path:'motion',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const motion={div:'div',button:'button'};export const AnimatePresence=({children})=>children;export const useReducedMotion=()=>true;`,loader:'js'}));
    b.onLoad({filter:/\.(ts|tsx)$/},args=>{const name=args.path.split(/[\\/]/).at(-1);if(name in mocks)return {contents:mocks[name],loader:name.endsWith('tsx')?'tsx':'ts',resolveDir:root};});
    b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
  }}],
});
const module={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(module,module.exports,require);
const {BillingAccess,Step11Paywall,store,createElement,act,create}=module.exports;
const saved={window:globalThis.window,document:globalThis.document,sessionStorage:globalThis.sessionStorage};
const values=new Map();
globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const location=new URL('http://localhost:5173/');
globalThis.window={location,history:{replaceState(_s,_t,url){location.href=new URL(url,location).href;}},setTimeout,clearTimeout,setInterval,addEventListener(){},removeEventListener(){}};
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
globalThis.billingPlans=plans;
const status=()=>({mode:'live',checkout_enabled:true,active:null,orders:[]});
const text=n=>typeof n==='string'?n:(Array.isArray(n)?n:n?.children??[]).map(text).join('');
let tree;
const button=label=>tree.root.findAllByType('button').find(n=>text(n)===label);
const mount=async()=>{await act(async()=>{tree=create(createElement(BillingAccess,{onSignOut:async()=>{}},'MEMBER_DASHBOARD'));});};
const unmount=async()=>{if(tree)await act(async()=>tree.unmount());tree=null;};
try {
  globalThis.billingRequest=async()=>status();globalThis.billingCheckout=async()=>{};
  await mount();
  assert(tree.root.findByProps({className:'onboarding-app billing-app'}));
  assert(tree.root.findByProps({'aria-label':'همراه به‌تن'}));
  assert(tree.root.findAllByProps({'data-onboarding-plan':true}).length || tree.root.findAllByProps({'data-plan-title':true}).length);
  await unmount();await mount(); // Browser refresh: profile complete, no subscription, empty in-memory selection.
  assert(tree.root.findByProps({id:'billing-title'}));
  assert.equal(text(tree.root.findByProps({id:'billing-title'})),'ادامهٔ مسیر، با برنامهٔ تو');
  assert(!text(tree.toJSON()).includes('MEMBER_DASHBOARD'));
  await unmount();

  globalThis.billingRequest=async()=>{throw Error('اتصال قطع شد');};await mount();
  assert.equal(text(tree.root.findByProps({role:'alert'})),'اتصال قطع شد');
  assert(tree.root.findByProps({className:'onboarding-app billing-app'}));
  globalThis.billingRequest=async()=>status();await act(async()=>button('به‌روزرسانی وضعیت اشتراک').props.onClick());
  assert.equal(tree.root.findAllByProps({role:'alert'}).length,0);await unmount();

  globalThis.billingRequest=async()=>({...status(),active:{plan_code:'silver',starts_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString()}});
  await mount();assert(text(tree.toJSON()).includes('MEMBER_DASHBOARD'));await unmount();

  location.search='?payment=12345678-1234-4234-8234-123456789abc';let paid=false;
  globalThis.billingRequest=async body=>body.action==='verify'?{order:{token:location.searchParams.get('payment'),status:paid?'paid':'failed',planName:'تغذیه',priceToman:10000,refId:paid?'987654':null}}:{...status(),active:paid?{plan_code:'silver',starts_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString()}:null};
  await mount();assert(text(tree.toJSON()).includes('این پرداخت تکمیل نشده'));
  paid=true;await act(async()=>button('بررسی دوبارهٔ پرداخت').props.onClick());
  assert(text(tree.toJSON()).includes('MEMBER_DASHBOARD'));assert.equal(location.searchParams.has('payment'),false);await unmount();

  store.getState().reset();store.getState().updateData({selectedTier:'silver'});
  let calls=0,release;
  await act(async()=>{tree=create(createElement(Step11Paywall,{checkout:true,onComplete:async()=>{calls++;await new Promise(r=>{release=r;});throw Error('پرداخت این نسخه هنوز آماده نیست');}}));});
  const activate=button('پرداخت و فعال‌سازی — پلن تغذیه');assert(activate);
  await act(async()=>{activate.props.onClick();await Promise.resolve();});
  assert.equal(tree.root.findByType('fieldset').props.disabled,true);
  assert(tree.root.findAllByProps({role:'group'})[0].findAllByType('button').every(n=>n.props.disabled));
  await act(async()=>activate.props.onClick());assert.equal(calls,1,'Double click must not start two checkouts');
  await act(async()=>release());assert.equal(tree.root.findByType('fieldset').props.disabled,false);
  assert(text(tree.toJSON()).includes('پرداخت این نسخه هنوز آماده نیست'));await unmount();
} finally {
  await unmount();for(const [k,v] of Object.entries(saved))globalThis[k]=v;
  delete globalThis.billingPlans;delete globalThis.billingRequest;delete globalThis.billingCheckout;
}

// Capabilities must require authentication and must never write, charge or bypass preflight.
let writes=0;
const handler=paymentHandler({site:'https://behtan.fit',requirePreflight:true,reconcileSecret:'',authenticate:async t=>t==='valid'?{id:'test'}:null,eligible:async()=>true,db:{rpc:async()=>{writes++;throw Error('Unexpected write');}},gateway:async()=>{writes++;throw Error('Unexpected charge');}});
const post=(action,token='valid')=>handler(new Request('https://example.supabase.co/functions/v1/payments-v3',{method:'POST',headers:{authorization:'Bearer '+token,origin:'http://localhost:5173'},body:JSON.stringify({action})}));
assert.equal((await post('capabilities','invalid')).status,401);
const caps=await post('capabilities');assert.equal(caps.status,200);assert.deepEqual(await caps.json(),{checkoutProtocol:2});
assert.equal((await post('create')).status,409);assert.equal(writes,0);
for(const code of ['PENDING_ORDER_REVIEW_REQUIRED','PROFILE_CHANGED','PRO_PLAN_CHANGE_REQUIRES_SUPPORT']){
  const h=paymentHandler({site:'https://behtan.fit',requirePreflight:true,reconcileSecret:'',authenticate:async()=>({id:'test',phone:'+989121234567',phone_confirmed_at:'2026-01-01'}),eligible:async()=>true,db:{settings:async()=>({mode:'live'}),rpc:async()=>{throw Error(code);}}});
  const r=await h(new Request('https://example.supabase.co/functions/v1/payments-v3',{method:'POST',body:JSON.stringify({action:'create_v2',planCode:'silver',priceToman:10000,durationDays:30})}));
  assert.equal(r.status,409);assert.equal((await r.json()).error,code);
}
console.log('PASS billing recovery: branded refresh, failed status/retry, active access, payment return/reconciliation, double-click/period locks, authenticated capability check and recoverable error codes');
