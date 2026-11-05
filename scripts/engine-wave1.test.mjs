import assert from 'node:assert/strict';
import { assertValidNutritionCatalog } from '../src/utils/nutritionCatalog.ts';
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { generateMemberPrescription } from '../src/utils/memberPrescription.ts';
import { calculateMacros } from '../src/utils/nutritionHelpers.ts';
import { generateDailyMealPlan } from '../src/utils/mealPlanEngine.ts';
import { isPresentablePlan, prescriptionForSchedule } from '../src/utils/mealPresentation.ts';
import { isStoredMealSnapshot, applyDailyMealSnapshots } from '../src/utils/dailyMealProgress.ts';
const catalog = installTestNutritionCatalog();
const prefs = { vegetarianStatus: 'none', allergies: [] };
const targets = calculateMacros(2100, 80, 'weight_loss', 178);
const plan = generateDailyMealPlan(targets, 80, prefs, false, '2026-11-04', { proteinBudgetPreference: 'balanced' });
assert(isPresentablePlan(plan));
assert(isStoredMealSnapshot(plan.meals[0], plan.meals[0].slot));
const failures = [];
const check = (label, run) => { try { run(); console.log('PASS', label); } catch (error) { failures.push(label); console.error('FAIL', label, error.message); } };
for (const value of [-1, null, '10', NaN, Infinity]) {
  check(`component grams rejects ${String(value)}`, () => { const bad = structuredClone(plan); bad.meals[0].components[0].grams = value; assert.equal(isPresentablePlan(bad), false); assert.equal(isStoredMealSnapshot(bad.meals[0], bad.meals[0].slot), false); });
}
for (const field of ['totalKcal', 'totalProtein', 'totalCarbs', 'totalFat', 'totalFiber']) {
  check(`rejects inconsistent ${field}`, () => { const bad = structuredClone(plan); bad.meals[0][field] += 100; assert.equal(isPresentablePlan(bad), false); });
}
check('rejects duplicate and unknown slots', () => { const bad = structuredClone(plan); bad.meals[1].slot = bad.meals[0].slot; assert.equal(isPresentablePlan(bad), false); bad.meals[1].slot = 'other'; assert.equal(isPresentablePlan(bad), false); });
check('intake never persisted as prescription', () => {
  const eaten = { ...plan.meals[0], consumed: true };
  const next = prescriptionForSchedule({ ...plan, meals: [eaten, ...plan.meals.slice(1)] }, plan);
  assert.equal(next.meals[0].consumed, false);
  assert.deepEqual(applyDailyMealSnapshots(next, {}).meals, plan.meals);
});
check('direct catalog validator rejects non-finite numbers', () => {
  const bad = structuredClone(catalog); bad.foods[0].kcalPerUnit = NaN;
  assert.throws(() => assertValidNutritionCatalog(bad));
});
check('F03 allergy change + undo + JSON reopen preserves safe prescription and other facts', () => {
  const eaten = { ...plan.meals.find(m => m.components.some(c => c.foodItem.allergyFlags.includes('gluten'))), consumed: true };
  assert(eaten.slot);
  const lunch = { ...plan.meals.find(m => m.slot === 'lunch'), consumed: true };
  const nextPrefs = { ...prefs, allergies: ['gluten'] };
  const next = generateMemberPrescription(targets, 80, nextPrefs, false, '2026-11-04', { lockedMeals: [eaten, lunch], proteinBudgetPreference: 'balanced' });
  assert(next.meals.every(m => !m.consumed && !m.source));
  assert(next.meals.every(m => m.components.every(c => !c.foodItem.allergyFlags.includes('gluten'))));
  const shown = applyDailyMealSnapshots(next, { [eaten.slot]: eaten, lunch });
  assert.deepEqual(shown.meals.find(m => m.slot === eaten.slot), eaten);
  const reopened = JSON.parse(JSON.stringify(next));
  const undone = applyDailyMealSnapshots(reopened, { lunch });
  assert(undone.meals.filter(m => !m.consumed).every(m => m.components.every(c => !c.foodItem.allergyFlags.includes('gluten'))));
  assert.deepEqual(undone.meals.find(m => m.slot === 'lunch'), lunch);
  const custom = { ...eaten, source: 'manual', templateId: 'custom' };
  const manual = generateMemberPrescription(targets, 80, prefs, false, '2026-11-04', { lockedMeals: [custom], proteinBudgetPreference: 'balanced' });
  assert(manual.meals.every(m => !m.source && m.templateId !== 'custom'));
  assert.deepEqual(eaten, shown.meals.find(m => m.slot === eaten.slot));
});
if (failures.length) { console.error('REGRESSIONS:', failures.join('; ')); process.exitCode = 1; }
