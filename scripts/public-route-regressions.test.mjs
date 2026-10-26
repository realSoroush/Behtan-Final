import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile('src/marketing/entry.ts','utf8');
const code=source.replaceAll('import.meta.env.DEV','false').replace("await import('./main')",'await publicLoaded()').replace('export {};','');
for(const [pathname,search,hash,expected]of [['/','','',null],['/professionals','','#pro-pricing',null],['/site.html','','','/'],['/site.html','','#pro','/professionals#pro'],['/','','#pro','/professionals#pro'],['/','?payment=test','#auth','/app?payment=test']]){
 let redirect=null,loaded=0;const context={URLSearchParams,history:{replaceState(){}},location:{pathname,search,hash,replace:x=>redirect=x},publicLoaded:async()=>loaded++};vm.runInNewContext(code,context);await new Promise(r=>setImmediate(r));assert.equal(redirect,expected);assert.equal(loaded,expected?0:1);
}
assert(!source.includes('getSession'),'Public entry must not wait for auth');
const demo=await readFile('src/marketing/pro-demo.js','utf8');
const routeCode=demo.slice(0,demo.indexOf('const bank='))+'})();';
for(const hash of ['', '#top','#pro-faq','#main']){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,innerHTML:'',textContent:'',classList:{toggle(){}},removeAttribute(){},scrollIntoView(){}});return nodes.get(id)};
 const document={getElementById:node,querySelector:node};const context={document,location:{pathname:'/professionals',hash},window:{addEventListener(){},scrollTo(){}},requestAnimationFrame:fn=>fn(),encodeURIComponent};vm.runInNewContext(routeCode,context);assert.equal(node('pro-page').hidden,false);assert.equal(node('member-page').hidden,true);assert.equal(node('.brand').href,'/');
}
console.log('PASS public routes: no session gate; legacy auth/payment handoff; Pro anchors and logo preserve path semantics');

const html=await readFile('site.html','utf8');const boot=html.match(/<script>([\s\S]*?)<\/script>/)[1];
let moved=null,clean=null;const history={replaceState:(_a,_b,url)=>clean=url};vm.runInNewContext(boot,{history,location:{pathname:'/',search:'',hash:'#pricing'},performance:{getEntriesByType:()=>[{type:'reload'}]},window:{scrollTo:(x,y)=>moved=[x,y]}});
assert.equal(history.scrollRestoration,'auto');assert.equal(clean,'/');assert.equal(moved,null);
const config=JSON.parse(await readFile('vercel.json','utf8'));assert(config.rewrites.some(x=>x.source==='/app'&&x.destination==='/app.html'));
assert(!await readFile('src/marketing/member-demo.js','utf8').then(s=>s.includes("classList.add('js-motion')")));
console.log('PASS clean app rewrite, native reload position preservation, no late content hiding');
