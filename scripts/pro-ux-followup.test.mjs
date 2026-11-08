import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const compiled=await build({
  stdin:{contents:`export {AuthoredPlanArchive} from './src/professional/AuthoredPlanArchive';export {AuthoredNutritionPreview} from './src/professional/NutritionStudio';export {authoredHtml} from './src/professional/authoredPlan';export {CorrectiveBank} from './src/professional/training/corrective/CorrectiveBank';export {CORRECTIVE_SEED} from './src/professional/training/corrective/seed';export {createElement} from 'react';export {act,create} from 'react-test-renderer';`,resolveDir:root},
  tsconfig:root+'/tsconfig.json',bundle:true,platform:'node',format:'cjs',write:false,
  external:['react','react/jsx-runtime','react-test-renderer'],
  plugins:[{name:'synthetic-pro-transports',setup(b){
    b.onLoad({filter:/supabaseClient\.ts$/},()=>({contents:'export const supabase=globalThis.proFollowupDb;',loader:'js'}));
    b.onLoad({filter:/training\/corrective\/api\.ts$/},()=>({contents:'export const correctiveApi=globalThis.proFollowupCorrective;export async function correctiveRpc(){throw Error("Unexpected admin request");}',loader:'js'}));
    b.onLoad({filter:/PanelSelect\.tsx$/},()=>({contents:`import {createElement} from 'react';export function PanelSelect(props){return createElement('select',props);}`,loader:'js'}));
    b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
  }}],
});
const rows=[],writes=[];
let bank=[];
const oldWindow=globalThis.window;
globalThis.window={setTimeout,clearTimeout};
globalThis.proFollowupDb={from(name){assert.equal(name,'pro_authored_plans');const query={select(){return this;},eq(){return this;},order(){return this;},range(){return this;},abortSignal(){return this;},async retry(){return{data:structuredClone(rows),error:null};}};return query;}};
globalThis.proFollowupCorrective={async list(){return structuredClone(bank);},async save(org,payload,expected){writes.push({org,payload:structuredClone(payload),expected});return{...payload,revision:expected+1};}};
const module={exports:{}};
new Function('module','exports','require',compiled.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
const {AuthoredPlanArchive,AuthoredNutritionPreview,authoredHtml,CorrectiveBank,CORRECTIVE_SEED,createElement,act,create}=module.exports;
const text=n=>typeof n==='string'?n:(n?.children??[]).map(text).join('');
const button=(tree,label)=>{const node=tree.root.findAllByType('button').find(b=>text(b)===label);assert(node,label);return node;};
const org='20000000-0000-4000-8000-000000000001';
const failures=[];
async function check(label,run){try{await run();console.log('PASS '+label);}catch(error){failures.push(error);console.error('FAIL '+label+': '+error.message);}}
try{
 await check('case archive renders every saved nutrition menu and preserves legacy training',async()=>{
  const food=(name,grams)=>({name,details:'',food:{id:name,grams,gramsPerUnit:100,basis:'پخته',kcal:100,protein:10,carbs:10,fat:2}});
  rows.push({id:'nutrition',kind:'nutrition',intake_revision:1,recorded_at:'2026-11-08T12:00:00Z',content:{version:1,title:'برنامه مصنوعی',notes:'یادداشت نسخه مصنوعی',reviewed:true,sections:[{title:'صبحانه',lines:[food('ماده اول',100)],alternatives:[{id:'second',title:'منوی دوم',lines:[food('ماده جایگزین',150)]}]}]}},
   {id:'training',kind:'training',intake_revision:1,recorded_at:'2026-11-08T12:00:00Z',content:{version:1,title:'تمرین قدیمی',notes:'',reviewed:true,sections:[{title:'جلسه',lines:[{name:'حرکت قدیمی',details:'دستور قدیمی'}]}]}});
  const before=JSON.stringify(rows);let tree;
  try{
   await act(async()=>{tree=create(createElement(AuthoredPlanArchive,{org,record:'synthetic-record',name:'مراجع مصنوعی'}));});
   await act(async()=>button(tree,'مشاهده برنامه اختصاصی').props.onClick());
   const view=tree.root.findByProps({'aria-label':'مشاهده برنامه اختصاصی ذخیره‌شده'});
   assert(text(view).includes('ماده جایگزین'),'Saved alternatives must also appear in the case archive');
   assert.equal(text(view).split('یادداشت نسخه مصنوعی').length-1,1,'Show historical notes exactly once');assert.equal(view.findAllByType('h3').length,0,'The archive already supplies the document heading');
   assert(text(view).includes('۱۵۰ گرم'));assert.equal(view.findAllByType('tbody')[0].findAllByType('tr').length,2);
   await act(async()=>tree.root.findAllByType('button').filter(b=>text(b)==='مشاهده برنامه اختصاصی')[1].props.onClick());
   assert(text(tree.root.findByProps({'aria-label':'مشاهده برنامه اختصاصی ذخیره‌شده'})).includes('دستور قدیمی'));
   assert.equal(JSON.stringify(rows),before,'Viewing must not rewrite historical records');
  }finally{if(tree)await act(async()=>tree.unmount());}
 });
 await check('switching private corrective records edits only the newly selected identity and revision',async()=>{
  bank=[{...structuredClone(CORRECTIVE_SEED[0]),id:'custom-10000000-0000-4000-8000-000000000001',nameFa:'حرکت اختصاصی الف',ownerOrg:org,revision:1},
   {...structuredClone(CORRECTIVE_SEED[1]),id:'custom-10000000-0000-4000-8000-000000000002',nameFa:'حرکت اختصاصی ب',ownerOrg:org,revision:3}];
  let tree;
  try{
   await act(async()=>{tree=create(createElement(CorrectiveBank,{org,onAdd(){throw Error('Unexpected insertion');}}));});
   const select=async name=>{const b=tree.root.findAllByType('button').find(b=>text(b).startsWith(name));assert(b);await act(async()=>b.props.onClick());};
   await select(bank[0].nameFa);
   assert.equal(tree.root.findByProps({'aria-label':'نام فارسی'}).props.value,bank[0].nameFa);
   await select(bank[1].nameFa);
   assert.equal(tree.root.findByProps({'aria-label':'نام فارسی'}).props.value,bank[1].nameFa,'Editor state must belong to the selected record');
   await act(async()=>tree.root.findByProps({'aria-label':'نام فارسی'}).props.onChange({target:{value:'نسخه تازه ب'}}));
   await act(async()=>button(tree,'ذخیره اطلاعات حرکت').props.onClick());
   assert.equal(writes.length,1);assert.equal(writes[0].payload.id,bank[1].id);assert.equal(writes[0].expected,3);assert.equal(writes[0].payload.nameFa,'نسخه تازه ب');assert.equal(bank[0].nameFa,'حرکت اختصاصی الف');
  }finally{if(tree)await act(async()=>tree.unmount());}
 });
 await check('unknown legacy nutrition is not displayed as zero and partial totals are explicit in history and PDF',async()=>{
  const legacy={version:1,title:'نسخه متنی مصنوعی',notes:'',reviewed:true,sections:[{title:'وعده',lines:[{name:'غذای متنی قدیمی',details:'مقدار به صورت متن ثبت شده'}]}]};
  let tree;
  try{
   await act(async()=>{tree=create(createElement(AuthoredNutritionPreview,{content:legacy}));});
   assert(text(tree.root).includes('مقادیر تغذیه‌ای ثبت نشده‌اند.'));assert(!text(tree.root).includes('۰ کالری'));
   const html=authoredHtml(legacy,'مصنوعی','nutrition','https://example.com');assert(html.includes('مقادیر تغذیه‌ای ثبت نشده‌اند.'));assert(!html.includes('۰ کالری'));
   const partial=structuredClone(legacy);partial.sections[0].lines.push({name:'ماده با مقدار معلوم',details:'',food:{id:'synthetic',grams:100,gramsPerUnit:100,basis:'آماده',kcal:100,protein:10,carbs:10,fat:2}});
   await act(async()=>tree.update(createElement(AuthoredNutritionPreview,{content:partial})));
   assert(text(tree.root).includes('۱۰۰ کالری'));assert(text(tree.root).includes('فقط مواد دارای مقادیر ثبت‌شده'));assert(authoredHtml(partial,'مصنوعی','nutrition','https://example.com').includes('فقط مواد دارای مقادیر ثبت‌شده'));
   const zero=structuredClone(partial);zero.sections[0].lines.shift();zero.sections[0].lines[0].food.kcal=0;
   await act(async()=>tree.update(createElement(AuthoredNutritionPreview,{content:zero})));assert(text(tree.root).includes('۰ کالری'));assert(!text(tree.root).includes('مقادیر تغذیه‌ای ثبت نشده‌اند.'));
  }finally{if(tree)await act(async()=>tree.unmount());}
 });
}finally{
 globalThis.window=oldWindow;delete globalThis.proFollowupDb;delete globalThis.proFollowupCorrective;
}
if(failures.length)throw new AggregateError(failures,'Pro UX follow-up regressions');
