import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contactPhone, profileError, registrationField, specialistHtml, PROFESSIONS } from '../src/professional/specialistProfile.ts';
import { authoredHtml } from '../src/professional/authoredPlan.ts';
import { printedPlanHtml } from '../src/professional/printPlan.ts';
import { trainingHtml } from '../src/training/print.ts';
const profile = { full_name: 'متخصص <script>bad</script>', contact_phone: '09111234567', profession: 'nutritionist', province: 'مازندران', city: 'ساری', address: 'خیابان <img src=x onerror=bad>، واحد ۴۰۱' };
assert.equal(contactPhone('۰۰۹۸ (۹۱۱) ۱۲۳-۴۵۶۷'), '+989111234567');
assert.equal(contactPhone('٠٩١١١٢٣٤٥٦٧'), '09111234567');
assert.equal(profileError(profile), '');
for (const [key, value] of [['full_name',' '],['contact_phone','1'],['contact_phone','0911abc1234'],['province',' '],['city',''],['address','x'],['profession','admin']]) assert.notEqual(profileError({...profile,[key]:value}), '', key);
for (const [key] of PROFESSIONS) assert.equal(profileError({...profile,profession:key}), '');
assert.equal(registrationField('fitness_coach'), 'training'); assert.equal(registrationField('nutritionist'), 'nutrition'); assert.equal(registrationField('physician'), 'clinic'); assert.equal(registrationField('gym_manager'), 'gym');
const content = { version:1,title:'برنامه تست',notes:'',reviewed:true,sections:[{title:'جلسه',lines:[{name:'حرکت',details:'آرام'}]}] };
const plan = {display_name:'مراجع',date:'2026-11-01',intake_revision:1,days:[],notes:''};
const training = {display_name:'مراجع',intake_revision:1,input:{start_date:'2026-11-01',location:'home',days:[],minutes:30,equipment:[]},weeks:[],notes:[],engine:'test'};
for (const html of [specialistHtml(profile),authoredHtml(content,'مراجع','training','https://pro.behtan.fit',profile),authoredHtml(content,'مراجع','nutrition','https://pro.behtan.fit',profile),printedPlanHtml(plan,'https://pro.behtan.fit',profile),trainingHtml(training,'https://pro.behtan.fit',profile)]) {
  assert(html.includes('متخصص &lt;script&gt;bad&lt;/script&gt;'));
  assert(html.includes('09111234567')); assert(html.includes('مازندران، ساری، خیابان'));
  assert(!html.includes('<script>bad</script>')); assert(!html.includes('<img src=x onerror=bad>'));
}
assert(!trainingHtml(training,'https://behtan.fit').includes('مشخصات متخصص'), 'B2C print remains unchanged');
const landing = await readFile(new URL('../site.html',import.meta.url),'utf8');
const footer = landing.slice(landing.indexOf('<footer'),landing.indexOf('</footer>'));
for(const text of ['فرهنگ ۱۷','واحد ۴۰۱','https://Instagram.com/behtan_pro','https://wa.me/989115391016','https://T.me/+989115391016','enamad']) assert(footer.includes(text),text);
console.log('PASS specialist profile: validation, profession mapping, Persian/Arabic phones, all Pro PDF templates, HTML escaping, B2C compatibility and footer contacts');
