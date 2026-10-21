import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, realpath, symlink, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

// Source-only tests cannot detect broken imports after Vercel emits .ts as .js.
// Execute the entire HTTP/engine suite from an isolated JS-only module graph.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=await mkdtemp(resolve(tmpdir(),'behtan-pro-runtime-'));
const config=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);
if(config.error)throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
assert.equal(parsed.options.rewriteRelativeImportExtensions,true,'Deployment requires rewriting .ts imports to emitted .js');
const seen=new Set();
async function emit(source){
 if(seen.has(source))return;seen.add(source);
 const input=resolve(root,source);
 const text=await readFile(input,'utf8');
 const compiled=ts.transpileModule(text,{fileName:input,compilerOptions:{...parsed.options,noEmit:false,sourceMap:false,inlineSourceMap:false}}).outputText;
 const destination=resolve(output,source.replace(/\.ts$/,'.js'));
 await mkdir(dirname(destination),{recursive:true});await writeFile(destination,compiled);
 const ast=ts.createSourceFile(destination,compiled,ts.ScriptTarget.Latest,true);
 for(const statement of ast.statements){
  const spec=statement.moduleSpecifier;
  if(!spec||!ts.isStringLiteral(spec))continue;
  const name=spec.text;
  assert(!name.startsWith('@/'),'Unresolved runtime alias: '+name);
  if(!name.startsWith('.'))continue;
  assert(!name.endsWith('.ts'),'Emitted runtime still imports TypeScript: '+name);
  let dependency=relative(root,resolve(dirname(input),name));
  if(dependency.endsWith('.js'))dependency=dependency.slice(0,-3)+'.ts';
  await emit(dependency);
 }
}
try{
 await emit('api/pro-plan.ts');
 await emit('scripts/pro-server-plan.test.mjs');
 await mkdir(resolve(output,'scripts/fixtures'),{recursive:true});
 await copyFile(resolve(root,'scripts/fixtures/nutrition-catalog.fixture.json'),resolve(output,'scripts/fixtures/nutrition-catalog.fixture.json'));
 await writeFile(resolve(output,'package.json'),JSON.stringify({type:'module'}));
 await symlink(await realpath(resolve(root,'node_modules')),resolve(output,'node_modules'),'junction');
 const env={...process.env};
 for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRO_SERVER_PLANS_ENABLED'])delete env[key];
 for(const entry of ['api/pro-plan.js','scripts/pro-server-plan.test.mjs']){
  const run=spawnSync(process.execPath,[resolve(output,entry)],{cwd:output,env,encoding:'utf8',timeout:120000});
  if(run.error)throw run.error;
  assert.equal(run.status,0,`${entry} failed after compilation:\n${run.stdout}\n${run.stderr}`);
  if(entry.startsWith('scripts/'))process.stdout.write(run.stdout);
 }
 console.log(`PASS: ${seen.size} emitted modules load without source .ts files; production API entry and complete server/HTTP suite execute`);
}finally{await rm(output,{recursive:true,force:true});}
