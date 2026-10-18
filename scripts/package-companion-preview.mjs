import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(root, 'preview-export'));
fs.mkdirSync(output, { recursive: true });
const cssPath = path.join(output, 'preview.tmp.css');
execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-i', 'src/index.css', '-o', cssPath, '--content', './src/**/*.{ts,tsx},./previews/**/*.tsx', '--minify'], { cwd: root, stdio: 'pipe' });
const data = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;
const result = await build({ entryPoints:['previews/companion.tsx'],absWorkingDir:root,bundle:true,write:false,outdir:'preview-build',format:'iife',external:['/fonts/*'],jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},plugins:[{
 name:'offline-preview',setup(b){
  b.onResolve({filter:/rive\.wasm\?url$/},()=>({path:'wasm',namespace:'embedded'}));
  b.onLoad({filter:/.*/,namespace:'embedded'},()=>({contents:'export default "";',loader:'js'}));
  // Never contact a live trust/payment service from a downloaded preview.
  b.onLoad({filter:/LandingPage\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace(/^const ENAMAD_HTML = .*;$/m,`const ENAMAD_HTML = '<span>نسخهٔ نمایشی</span>';`),loader:'tsx'}));
 }}] });
let js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
js=js.split('/behtan-logo.png').join(data('public/behtan-logo.png','image/png'));
let css=fs.readFileSync(cssPath,'utf8')+'\n'+result.outputFiles.find(f=>f.path.endsWith('.css')).text;
for(const name of ['IRANSansX-Regular.woff','IRANSansX-Bold.woff']) css=css.split('/fonts/'+name).join(data('public/fonts/'+name,'font/woff'));
const assets={rive:data('public/mascot/behtan-companion.riv','application/octet-stream'),fallback:data('public/mascot/behtan-rest.svg','image/svg+xml'),wasm:data('node_modules/@rive-app/canvas/rive.wasm','application/wasm')};
const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>همراه به‌تن · پیش‌نمایش واقعی Rive</title><style>${css}</style></head><body><div id="root"></div><script>window.__BEHTAN_ASSETS__=${JSON.stringify(assets)};</script><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
fs.writeFileSync(path.join(output,'behtan-rive-preview.html'),html);fs.unlinkSync(cssPath);
console.log(`Offline Rive preview: ${Buffer.byteLength(html).toLocaleString()} bytes`);
