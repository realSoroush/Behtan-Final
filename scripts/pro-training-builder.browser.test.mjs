// Isolated UI fixture: real components, fake data, no database or payment calls.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=await mkdtemp(join(tmpdir(),'behtan-forms-'));
const mock="export const supabase={from:()=>new Proxy({},{get:(_,k)=>k==='then'?((resolve)=>Promise.resolve({data:[],error:null}).then(resolve)):()=>supabase.from()})};";
const fixture='import React from \'react\';import{createRoot}from\'react-dom/client\';import{MemberProfile}from\'./src/components/dashboard/MemberProfile\';import{AuthoredPlanEditor}from\'./src/professional/AuthoredPlanEditor\';import \'./src/components/dashboard/member-app.css\';import \'./src/professional/workspace.css\';function App(){return <><div id="member" className="member-app" style={{width:390,padding:16}}><MemberProfile profile={{id:\'demo\',display_name:\'سارا\',phone:\'۰۹۱۲۰۰۰۰۰۰۰\',weight:72,height:175,goal:\'maintenance\',workout_days:3,workout_weekdays:[1,3,5],activity_level:\'moderate\',protein_budget_preference:\'balanced\'}} today="2026-10-25"/></div><div id="pro" className="pro-shell" style={{display:\'block\',padding:24,width:1200}}><AuthoredPlanEditor org="demo" record="demo" revision={1} kind="training" name="مراجع نمونه" canWrite={true} onBusy={()=>{}} seed={{version:1,title:\'برنامه تمرینی سه روزه\',notes:\'اجرای کنترل\u200cشده؛ استراحت کافی بین جلسات.\',reviewed:false,sections:[{title:\'روز اول · بالاتنه\',lines:[{name:\'پرس سینه دمبل\',details:\'3 ست · 12 تکرار · 60 ثانیه استراحت\'},{name:\'پارویی تک دمبل\',details:\'3 ست · 12 تکرار · 60 ثانیه استراحت\'}]},{title:\'روز دوم · پایین\u200cتنه\',lines:[{name:\'اسکوات گابلت\',details:\'3 ست · 12 تکرار · 60 ثانیه استراحت\'}]},{title:\'روز سوم · تمام بدن\',lines:[{name:\'پل باسن\',details:\'3 ست · 12 تکرار · 60 ثانیه استراحت\'}]}]}}/></div></>};createRoot(document.getElementById(\'root\')).render(<App/>);';
let browser,server;
try{
 await build({stdin:{contents:fixture,resolveDir:root,loader:'tsx'},bundle:true,format:'esm',outfile:join(dir,'ui.js'),define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'mock-data',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'js'}));}}]});
 execFileSync(process.execPath,[join(root,'node_modules/tailwindcss/lib/cli.js'),'-i',join(root,'src/index.css'),'-o',join(dir,'base.css')],{cwd:root,stdio:'pipe'});
 await writeFile(join(dir,'index.html'),'<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/ui.css"><div id="root"></div><script type="module" src="/ui.js"></script></html>');
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),name=url.pathname==='/'?'index.html':url.pathname.slice(1);const path=name.startsWith('fonts/')?join(root,'public',name):join(dir,name);if(!path.startsWith(dir)&&!path.startsWith(join(root,'public/fonts')))throw Error('path');const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff')?'font/woff':'text/html';res.setHeader('Content-Type',type);res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.BEHTAN_TEST_CHROMIUM||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('heading',{name:'سارا',exact:true}).waitFor();
 await page.setViewportSize({width:1440,height:1100});
 await page.getByRole('button',{name:'پرس سینه هالتر',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'نام حرکت 3',exact:true}).inputValue(),'پرس سینه هالتر');
 await page.getByRole('spinbutton',{name:'ست حرکت 3',exact:true}).fill('4');
 assert.match(await page.locator('.authored-live-preview').innerText(),/4 ست/);
 await page.getByRole('button',{name:'بالا بردن حرکت 3'}).click();assert.equal(await page.getByRole('textbox',{name:'نام حرکت 2',exact:true}).inputValue(),'پرس سینه هالتر');
 const grip=await page.locator('.manual-grip').first().boundingBox();await page.locator('.manual-exercise').last().scrollIntoViewIfNeeded();const drop=await page.locator('.manual-exercise').last().boundingBox();await page.locator('.manual-grip').first().scrollIntoViewIfNeeded();const start=await page.locator('.manual-grip').first().boundingBox();await page.mouse.move(start.x+5,start.y+5);await page.mouse.down();await page.locator('.manual-exercise').last().scrollIntoViewIfNeeded();const end=await page.locator('.manual-exercise').last().boundingBox();await page.mouse.move(end.x+end.width/2,end.y+15,{steps:12});await page.mouse.up();await expect(page.getByRole('textbox',{name:'نام حرکت 1',exact:true})).toHaveValue('پرس سینه هالتر');
 await page.getByRole('combobox',{name:'تعداد روزهای برنامه'}).click();await page.getByRole('option',{name:'۴ روز',exact:true}).click();assert.equal(await page.locator('.manual-days button').count(),4);
 await page.locator('#member').screenshot({animations:'disabled',path:join(dir,'member-light.png'),type:'png'});
 await page.locator('#pro').screenshot({animations:'disabled',path:join(dir,'pro-builder.png'),type:'png'});
 await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.locator('#member').screenshot({animations:'disabled',path:join(dir,'member-dark.png')});
 if(process.env.BEHTAN_PREVIEW_OUTPUT){for(const name of ['member-light','member-dark','pro-builder']){const {copyFile}=await import('node:fs/promises');await copyFile(join(dir,name+'.png'),join(process.env.BEHTAN_PREVIEW_OUTPUT,name+'.png'));}}
 assert.deepEqual(errors,[]);console.log('PASS manual bank selection, sets, live preview, reorder, day count and real component screenshots');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
