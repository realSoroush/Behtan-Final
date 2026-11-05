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
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-14', 'weight_loss').recommendation, 'review_measurements');
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-14', 'weight_gain').recommendation, 'review_trend');
twoWeeks[5].adherence = 'little';
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-14', 'weight_loss').recommendation, 'review_routine');
twoWeeks[5].hunger = 'often';
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-14', 'weight_loss').recommendation, 'review_hunger');
assert.equal(weeklyGoalReview(twoWeeks, '2026-09-22', 'weight_loss'), null);
console.log('✓ Weekly review requires sufficient recent evidence and weighs hunger, adherence and goal direction');

// Safety regression F02: direction alone cannot approve a potentially invalid trend.
const abrupt = Array.from({ length: 14 }, (_, i) => ({
  entry_date: `2026-10-${String(18 + i).padStart(2, '0')}`,
  weight_kg: i < 7 ? 100 : 90, adherence: 'mostly', hunger: 'comfortable', difficulty: 'none',
}));
assert.notEqual(weeklyGoalReview(abrupt, '2026-10-31', 'weight_loss').recommendation, 'continue');

for (const goal of ['weight_loss', 'weight_gain', 'maintenance']) {
  assert.notEqual(weeklyGoalReview(abrupt, '2026-10-31', goal).recommendation, 'continue');
}
const normal = abrupt.map((row, i) => ({ ...row, weight_kg: i < 7 ? 100 : 99.5 }));
assert.equal(weeklyGoalReview(normal, '2026-10-31', 'weight_loss').recommendation, 'review_measurements');
const stable = normal.map(row => ({ ...row, weight_kg: 100 }));
assert.equal(weeklyGoalReview(stable, '2026-10-31', 'maintenance').recommendation, 'continue');
for (const weight_kg of [NaN, Infinity, -10, 0, 351]) {
  const bad = [...stable, { ...stable[13], entry_date: '2026-10-31', weight_kg }];
  assert.notEqual(weeklyGoalReview(bad, '2026-10-31', 'maintenance').recommendation, 'continue');
}
assert.equal(weeklyGoalReview([...stable, stable[0]], '2026-10-31', 'maintenance').recommendation, 'review_measurements');
assert.equal(weeklyGoalReview(stable, '2026-02-31', 'maintenance'), null);
assert.deepEqual(weeklyGoalReview([...stable, { ...stable[0], entry_date: '2026-11-01', weight_kg: 50 }], '2026-10-31', 'maintenance'), weeklyGoalReview(stable, '2026-10-31', 'maintenance'));
assert.notEqual(contentFingerprint(weeklyGoalReview(stable, '2026-10-31', 'maintenance').evidence), contentFingerprint(['old-version', ...weeklyGoalReview(stable, '2026-10-31', 'maintenance').evidence.slice(1)]));
console.log('PASS F02, both directions/maintenance, no guessed rate cutoff, invalid/duplicate/future dates and versioned acknowledgement evidence');
