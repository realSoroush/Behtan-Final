import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const mocks = {
  'useAuth.ts': `export function useAuth(){return {user:{id:globalThis.lifecycleUserId},loading:false}}`,
  'useUserProfile.ts': `export {useUserProfile} from '${root}/tests/public/onboarding-profile.mock.ts';`,
  'useSubscriptionPlans.ts': `const plans=[{code:'test',name:'آزمایشی',theme:'green',priceToman:0,priceNote:'تست',durationDays:30,features:[]}];export function useSubscriptionPlans(){return {plans,loading:false,error:null,refetch:async()=>plans}}`,
  'payments.ts': `export async function startCheckout(){throw Error('Checkout is outside this test');}`,
  'geminiClient.ts': `export class BodyScanError extends Error{};export async function analyzeBodyScan(){globalThis.lifecycleAnalysisCalls++;throw Error('Unexpected AI call');}`,
  'ThemeToggle.tsx': `export function ThemeToggle(){return null;}`,
  'CompanionCard.tsx': `export function CompanionCard(){return null;}`,
  'BodyScanCamera.tsx': `export function BodyScanCamera(){return null;}`,
};
const compiled = await build({
  stdin: {contents: `export {OnboardingWizard} from './src/components/onboarding/OnboardingWizard';export {useOnboardingStore as store} from './src/hooks/useOnboardingStore';export {createEmptyOnboardingData} from './src/types';export {mergeActivityAnswers} from './src/utils/onboardingActivity';export {MEDICAL_SAFETY_SCREENING_VERSION} from './src/utils/medicalEligibility';export {createElement} from 'react';export {act,create} from 'react-test-renderer';`, resolveDir: root},
  tsconfig: root+'/tsconfig.json', bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['react', 'react/jsx-runtime', 'react-test-renderer'],
  plugins: [{name:'lifecycle-fixtures',setup(b){
    b.onResolve({filter:/^framer-motion$/},()=>({path:'motion',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const motion={div:'div',button:'button'};export const AnimatePresence=({children})=>children;export const useReducedMotion=()=>true;`,loader:'js'}));
    b.onLoad({filter:/\.(ts|tsx)$/},args=>{const name=args.path.split('/').at(-1);if(name in mocks)return {contents:mocks[name],loader:name.endsWith('tsx')?'tsx':'ts',resolveDir:root};});
    b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
  }}],
});
const module={exports:{}};
new Function('module','exports','require',compiled.outputFiles[0].text)(module,module.exports,require);
const {OnboardingWizard,store,createEmptyOnboardingData,mergeActivityAnswers,MEDICAL_SAFETY_SCREENING_VERSION,createElement,act,create}=module.exports;
const values=new Map();
const originalWindow=globalThis.window,originalStorage=globalThis.localStorage;
globalThis.window={setTimeout,clearTimeout,scrollTo(){}};
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
globalThis.lifecycleUserId='onboarding-test-user';globalThis.lifecycleAnalysisCalls=0;
let tree,release,storeWrites=0;
const content=node=>typeof node==='string'?node:(node?.children??[]).map(content).join('');
const nodes=(type)=>tree.root.findAllByType(type);
const button=label=>nodes('button').find(n=>content(n)===label);
const input=label=>{const id=nodes('label').find(n=>content(n)===label)?.props.htmlFor;return nodes('input').find(n=>n.props.id===id);};
const heading=()=>content(nodes('h1')[0]);
const draft=()=>({...mergeActivityAnswers(createEmptyOnboardingData(),{dailyMovement:'mostly_seated',dailySteps:'under_4000',workoutLocation:'none'}),displayName:'کاربر نمونه',gender:'male',province:'تهران',city:'تهران',birthDate:'1992-04-23',height:178,weight:125.5,goal:'weight_loss',pregnancyStatus:'not_applicable',eatingDisorderStatus:'none',safetyAnswersConfirmed:true,safetyScreeningVersion:MEDICAL_SAFETY_SCREENING_VERSION});
async function unmount(){if(tree){await act(async()=>tree.unmount());tree=null;}release?.();release=null;}
async function mount(step=1,patch={},loadError=false){
  await unmount();store.getState().reset();values.clear();
  if(step>1)values.set('onboarding-test-profile',JSON.stringify({onboarding_step:step,onboarding_draft_json:{...draft(),...patch}}));
  if(loadError)values.set('onboarding-test-load-error','1');
  storeWrites=0;release=store.subscribe(()=>{if(++storeWrites>80)throw Error('Onboarding lifecycle entered a repeated store-update loop');});
  await act(async()=>{tree=create(createElement(OnboardingWizard,{onComplete:async()=>{}}));});
}
async function press(label){const node=button(label);assert(node,'Missing button: '+label);assert(!node.props.disabled,'Disabled button: '+label);await act(async()=>{await node.props.onClick();});}
try {
  // The auth fixture deliberately returns a NEW object for the SAME user on every render.
  await mount();assert.equal(heading(),'از خودت بگو');const saver=store.getState().progressSaver;
  for(let i=0;i<12;i++)await act(async()=>store.getState().updateData({displayName:'کاربر '+i}));
  const beforeFocus=storeWrites;
  for(let i=0;i<12;i++)await act(async()=>tree.root.findByType('fieldset').props.onFocusCapture({target:{matches:()=>true}}));
  assert.equal(storeWrites,beforeFocus,'Focus rerenders must not detach/reattach the saver');
  assert.equal(store.getState().progressSaver,saver);
  await act(async()=>store.getState().updateData({...draft(),province:'کردستان',city:'سنندج'}));
  await press('مرد');assert.equal(store.getState().data.city,'سنندج');await press('ادامه');
  assert.equal(heading(),'مشخصات جسمی');assert.equal(JSON.parse(values.get('onboarding-test-profile')).onboarding_step,2);
  await act(async()=>input('وزن فعلی').props.onChange({target:{value:'1e3'}}));assert(button('ادامه').props.disabled);
  await act(async()=>input('وزن فعلی').props.onChange({target:{value:'۱۲۵٫۵'}}));assert.equal(store.getState().data.weight,125.5);
  await press('ادامه');assert.equal(heading(),'هدف شما چیست؟');
  assert.equal(JSON.parse(values.get('onboarding-test-profile')).onboarding_draft_json.weight,125.5);
  values.set('onboarding-test-save-error','1');const logError=console.error;console.error=()=>{};
  try{await press('ادامه');}finally{console.error=logError;}
  assert.equal(heading(),'هدف شما چیست؟');assert(store.getState().submitError);
  values.delete('onboarding-test-save-error');await press('ادامه');assert.equal(heading(),'تحرک روزانه');
  await unmount();assert.equal(store.getState().progressSaver,null,'Unmount releases saver');

  await mount(4,{},true);assert(tree.root.findAllByProps({role:'alert'}).length);await press('تلاش دوباره');assert.equal(heading(),'تحرک روزانه');
  await mount(6,{medicalConditions:['kidney_disease']});assert(!button('ادامه'));assert(button('ذخیره پاسخ‌ها'));
  await mount(9);assert.equal(tree.root.findByProps({role:'progressbar'}).props['aria-valuenow'],8);await press('بازگشت');assert.equal(store.getState().currentStep,7);
  await mount(9);await press('ادامه بدون عکس');
  const manual=nodes('button').find(n=>content(n).includes('مزومورف'));assert(manual);await act(async()=>manual.props.onClick());
  await press('ادامه');assert.equal(store.getState().currentStep,10);assert(nodes('strong').some(n=>content(n)==='بدون عکس ادامه می‌دهیم'));
  await press('ادامه به مرحله پایانی');assert.equal(store.getState().currentStep,11);assert.equal(globalThis.lifecycleAnalysisCalls,0);
  assert(tree.root.findAllByProps({'aria-label':'خلاصهٔ پاسخ‌ها'}).length);
  console.log('PASS mounted onboarding lifecycle: bounded updates, repeated focus/edit rerenders, save/advance, Persian decimal input, failed-save retry, profile retry, medical hard-stop, back navigation, no-photo review and unmount cleanup');
} finally {
  await unmount();globalThis.window=originalWindow;globalThis.localStorage=originalStorage;
  delete globalThis.lifecycleUserId;delete globalThis.lifecycleAnalysisCalls;
}
