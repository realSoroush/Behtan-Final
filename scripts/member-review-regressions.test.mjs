import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {win32} from 'node:path';
const require=createRequire(import.meta.url);
const mocks={
 'api.ts':`export async function memberRpc(){return {scan_next_at:'2099-01-01T00:00:00Z'}}`,
 'supabaseClient.ts':`export const supabase={from(){return {select(){return this},eq(){return this},order(){return this},limit(){return this},async maybeSingle(){return {data:{result:globalThis.savedBodyReport},error:null}}}}};`,
 'MemberDialog.tsx':`export function MemberDialog({children}){return <div>{children}</div>}`,
 'Step9BodyScan.tsx':`export function Step9BodyScan(){return <p>capture</p>}`,
 'Step10Analysis.tsx':`export function Step10Analysis(){return <p>report-view</p>}`,
};
// Esbuild paths follow the host OS. Normalize separators before fixture lookup.
const fixtureName=file=>win32.basename(file);
for(const name of Object.keys(mocks)){
 assert.equal(fixtureName(win32.join('E:/','Behtan-Final','src','lib',name)),name);
 assert.equal(fixtureName('/workspace/src/lib/'+name),name);
}
const fixtureHits=new Set();
const compiled=await build({stdin:{contents:`export {BodyReview} from './src/member/BodyReview';export {useOnboardingStore as store} from './src/hooks/useOnboardingStore';export {createElement} from 'react';export {act,create} from 'react-test-renderer';`,resolveDir:process.cwd()},tsconfig:'tsconfig.json',bundle:true,platform:'node',format:'cjs',write:false,metafile:true,logLevel:'silent',external:['react','react/jsx-runtime','react-test-renderer'],plugins:[{name:'body-review-fixtures',setup(b){b.onLoad({filter:/\.(ts|tsx)$/},args=>{const name=fixtureName(args.path);if(mocks[name]){fixtureHits.add(name);return {contents:mocks[name],loader:name.endsWith('tsx')?'tsx':'ts',resolveDir:process.cwd()};}});}}]});
assert.deepEqual(compiled.warnings,[],'Unexpected bundler warnings: '+compiled.warnings.map(w=>w.text).join('; '));
for(const name of Object.keys(mocks))assert(fixtureHits.has(name),'Fixture was not applied: '+name);
assert(!Object.keys(compiled.metafile.inputs).some(p=>p.includes('@supabase')),'Real Supabase SDK must never be loaded by this fixture test');
assert(!compiled.outputFiles[0].text.includes('VITE_SUPABASE_URL'),'Real Supabase environment access leaked into the fixture bundle');
const mod={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,require);
const {BodyReview,store,createElement,create,act}=mod.exports;
globalThis.savedBodyReport={bodyFatPct:25,bodyType:'mesomorph',biologicalAge:30,narrative:'نتیجهٔ ذخیره‌شده',estimatedMuscleMass:'average',confidence:'low'};
const prior=store.getState();let tree;
try{
 await act(async()=>{tree=create(createElement(BodyReview,{profile:{id:'test',weight:80,height:178},onClose(){}}));});
 assert.equal(store.getState().currentStep,10);
 assert.deepEqual(store.getState().data.bodyScanResult,globalThis.savedBodyReport);
 assert(JSON.stringify(tree.toJSON()).includes('report-view'));
 assert(!JSON.stringify(tree.toJSON()).includes('capture'));
 await act(async()=>tree.unmount());assert.equal(store.getState().currentStep,prior.currentStep);
 // Reopening during cooldown must still show the saved report, without starting another scan.
 await act(async()=>{tree=create(createElement(BodyReview,{profile:{id:'test',weight:80,height:178},onClose(){}}));});
 assert.deepEqual(store.getState().data.bodyScanResult,globalThis.savedBodyReport);
 console.log('PASS mounted profile scan: report survives close/reopen, is visible during cooldown and onboarding state is restored');
}finally{await act(async()=>tree?.unmount());delete globalThis.savedBodyReport;}
