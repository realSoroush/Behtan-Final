import assert from 'node:assert/strict';
import {parseWeight,weightTrend,reviewDue,weeklyGoalReview} from '../src/utils/progressJournal.ts';
import {contentFingerprint,buildPlanProvenance} from '../src/utils/planProvenance.ts';
assert.equal(parseWeight('۸۴٫۵'),84.5);assert.equal(parseWeight('٨٤.٥'),84.5);assert.equal(parseWeight(''),null);
for(const value of ['NaN','1e2','-1','۳۵۱','84.55','0'])assert.throws(()=>parseWeight(value));
const entry=(date,weight)=>({entry_date:date,weight_kg:weight,adherence:null,hunger:null,difficulty:null});
const rows=[entry('2026-09-21',84),entry('2026-09-15',85),entry('2026-09-20',null)];
assert.equal(weightTrend(rows).change,-1);assert.equal(weightTrend([rows[0]]).change,null);
assert(reviewDue(rows,'2026-09-21'));rows[1].hunger='comfortable';assert(!reviewDue(rows,'2026-09-21'));assert(reviewDue(rows,'2026-09-22'));
assert.equal(contentFingerprint({b:2,a:1}),contentFingerprint({a:1,b:2}));
assert.notEqual(contentFingerprint({a:1}),contentFingerprint({a:2}));
assert.equal(buildPlanProvenance({},{}).caloriePolicy.percentage,.25);
console.log('✅ Persian/Arabic weights, validation, time ordering, review due dates and policy provenance');


const twoWeeks = [1, 3, 6, 8, 10, 13].map((day, i) =>
  entry(`2026-09-${String(day).padStart(2, '0')}`, i < 3 ? 85 : 84.5));
Object.assign(twoWeeks[5], { adherence: 'mostly', hunger: 'comfortable' });
assert.equal(weeklyGoalReview(twoWeeks.slice(1), '2026-09-14', 'weight_loss'), null);
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-14', 'weight_loss').recommendation, 'continue');
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-14', 'weight_gain').recommendation, 'review_trend');
twoWeeks[5].adherence = 'little';
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-14', 'weight_loss').recommendation, 'review_routine');
twoWeeks[5].hunger = 'often';
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-14', 'weight_loss').recommendation, 'review_hunger');
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-22', 'weight_loss'), null);
console.log('✓ Weekly review requires sufficient recent evidence and weighs hunger, adherence and goal direction');
