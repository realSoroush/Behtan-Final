import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const landing = await readFile(new URL('../src/components/landing/LandingPage.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const auth = await readFile(new URL('../src/components/PhoneAuth.tsx', import.meta.url), 'utf8');

const enamad = "<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=7609793&Code=scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=7609793&Code=scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO' alt='' style='cursor:pointer' code='scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO'></a>";

assert.ok(landing.includes(enamad), 'The exact eNamad markup must remain unchanged.');
assert.match(landing, /dangerouslySetInnerHTML=\{\{ __html: ENAMAD_HTML \}\}/, 'eNamad markup must be rendered in the footer.');
assert.match(landing, /ساخت برنامه شخصی/, 'The primary onboarding CTA is missing.');
assert.match(landing, /ورود به حساب/, 'The returning-user CTA is missing.');
assert.match(app, /authRequested \? <PhoneAuth onBack=\{closeAuth\} \/> : <LandingPage onStart=\{openAuth\} \/>/, 'Logged-out routing must lead to landing or auth.');
assert.match(auth, /onBack\?: \(\) => void/, 'Auth needs a safe route back to landing.');

console.log('✓ Landing page, auth handoff, and exact eNamad embed verified.');
