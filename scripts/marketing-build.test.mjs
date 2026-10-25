import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const [home,pro,app,manifest]=await Promise.all(['dist/index.html','dist/professionals/index.html','dist/app.html','dist/.vite/manifest.json'].map(p=>readFile(p,'utf8')));
for(const html of [home,pro]){assert(html.includes('id="marketing-shell"'));assert(html.includes('data-marketing-css'));assert(!html.includes('id="root"'));assert(html.includes('id="pro-price-grid"'));}
assert(home.includes('href="https://behtan.fit/"'));
assert(pro.includes('href="https://behtan.fit/professionals"'));
assert(pro.includes('id="member-page" hidden'));
assert(!pro.includes('id="pro-page" hidden'));
assert(app.includes('id="root"'));assert(app.includes('noindex,nofollow'));assert(!app.includes('marketing-shell'));
const m=JSON.parse(manifest);assert(m['src/marketing/main.ts'].css.length>0);
console.log('PASS: public static HTML, Pro initial view, canonical URLs, first-paint CSS and separate private app entry.');
