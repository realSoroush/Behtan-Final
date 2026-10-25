import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const text=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [app,html]=await Promise.all([text('src/App.tsx'),text('site.html')]);
assert.match(app,/<MarketingEntry professional \/>/);
assert.match(app,/authRequested \? <PhoneAuth onBack=\{closeAuth\} \/> : <MarketingEntry \/>/);
assert(!app.includes('VITE_MARKETING_V2'));
for(const old of ['src/components/landing','src/components/professionals'])await assert.rejects(access(new URL('../'+old,import.meta.url)));
assert(html.includes('trustseal.enamad.ir/logo.aspx?id=7609793'));
assert(html.includes('id="menu-toggle"'));
assert(html.includes('aria-controls="site-nav"'));
assert(html.includes('id="pro-price-grid"'));
assert(!html.includes('2490000'));
await import('./marketing.test.mjs');
await import('./landing-catalog-database.test.mjs');
console.log('PASS: sole marketing design, authentication handoff, catalogs, accessible mobile menu and eNamad.');

await import('./marketing-database.test.mjs');
