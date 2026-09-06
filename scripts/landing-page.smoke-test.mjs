import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const landing = await readFile(new URL('../src/components/landing/LandingPage.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const auth = await readFile(new URL('../src/components/PhoneAuth.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const tailwind = await readFile(new URL('../tailwind.config.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const enamad = "<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=7609793&Code=scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=7609793&Code=scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO' alt='' style='cursor:pointer' code='scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO'></a>";

assert.ok(landing.includes(enamad), 'The exact eNamad markup must remain unchanged.');
assert.match(landing, /dangerouslySetInnerHTML=\{\{ __html: ENAMAD_HTML \}\}/, 'eNamad markup must be rendered in the footer.');
assert.match(landing, /ساخت برنامه شخصی/, 'The primary onboarding CTA is missing.');
assert.match(landing, /ورود به حساب/, 'The returning-user CTA is missing.');
assert.match(app, /authRequested \? <PhoneAuth onBack=\{closeAuth\} \/> : <LandingPage onStart=\{openAuth\} \/>/, 'Logged-out routing must lead to landing or auth.');
assert.match(auth, /onBack\?: \(\) => void/, 'Auth needs a safe route back to landing.');
assert.match(landing, /dark:bg-transparent dark:shadow-none/, 'Landing logo background must be transparent in dark mode.');
assert.match(landing, /border-primary-400 bg-primary-500/, 'The final CTA must keep the brand-green background in both themes.');
assert.match(styles, /font-family: 'IRANSansX'/, 'IRANSansX font-face is missing.');
assert.match(styles, /url\('\/fonts\/IRANSansX-Regular\.woff'\)/, 'IRANSansX regular source is missing.');
assert.match(styles, /url\('\/fonts\/IRANSansX-Bold\.woff'\)/, 'IRANSansX bold source is missing.');
assert.match(tailwind, /sans: \['IRANSansX'/, 'IRANSansX must be the app-wide sans font.');
assert.doesNotMatch(landing, /landing-font/, 'Landing must inherit the same global font as the app.');
assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/, 'The app must not depend on a remote font CDN.');
await access(new URL('../public/fonts/IRANSansX-Regular.woff', import.meta.url));
await access(new URL('../public/fonts/IRANSansX-Bold.woff', import.meta.url));

console.log('✓ Landing page, auth handoff, and exact eNamad embed verified.');
