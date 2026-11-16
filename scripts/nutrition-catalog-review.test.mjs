import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ALLERGENS } from '../src/utils/allergens.ts';
import { catalogEvidenceGaps, reviewRecipe } from './review-nutrition-catalog.mjs';

const source = { name: 'Synthetic test record', url: 'https://example.invalid/evidence', locator: 'page 1' };
const recipe = {
  schemaVersion: 1, id: 'synthetic_recipe', version: 'test-v1', name: 'Synthetic recipe', source,
  gramsPerUnit: 100, preparationState: 'cooked',
  ingredients: [{ name: 'Synthetic ingredient', grams: 140, preparationState: 'raw' }],
  batch: { cookedGrams: 100, servings: 1, method: 'measured', source },
  nutrition: { kcal: 120, proteinGrams: 5, carbGrams: 16, fatGrams: 4, fiberGrams: 2, source },
  allergens: Object.fromEntries(ALLERGENS.map(allergen => [allergen, {
    ingredients: allergen === 'egg' ? 'contains' : 'absent',
    crossContact: allergen === 'sesame' ? 'possible' : 'controlled',
    ingredientSource: source, crossContactSource: source,
  }])),
  micronutrients: {
    calcium: { amount: 42, unit: 'mg', source }, iron: null, sodium: { amount: 0, unit: 'mg', source },
    potassium: null, vitamin_d: null,
  },
};
const ready = reviewRecipe(recipe);
assert.equal(ready.status, 'awaiting_review');
assert.equal(ready.allergenAssessment.egg, 'contains');
assert.equal(ready.allergenAssessment.sesame, 'may_contain');
assert.equal(ready.allergenAssessment.dairy, 'assessed_absent');
assert.equal(ready.micronutrients.iron.amount, null);
assert.equal(ready.micronutrients.sodium.amount, 0);
const approval = { fingerprint: ready.fingerprint, reviewer: 'Synthetic reviewer', decisionRef: 'TEST-1', date: '2026-11-16', decision: 'approved_for_pilot' };
assert.equal(reviewRecipe(recipe, approval).status, 'review_recorded');
assert.equal(reviewRecipe(Object.fromEntries(Object.entries(recipe).reverse()), approval).status, 'review_recorded');
assert.equal(reviewRecipe({ ...recipe, version: 'test-v2' }, approval).status, 'approval_mismatch');
assert.equal(reviewRecipe(recipe, { ...approval, date: '2026-02-30' }).status, 'approval_mismatch');

const incomplete = reviewRecipe({
  ...recipe,
  allergens: { ...recipe.allergens, dairy: { ...recipe.allergens.dairy, crossContact: 'unknown' } },
  batch: { ...recipe.batch, cookedGrams: 0 },
  micronutrients: { ...recipe.micronutrients, calcium: { ...recipe.micronutrients.calcium, unit: 'µg' } },
}, approval);
assert.equal(incomplete.status, 'incomplete');
assert.equal(incomplete.allergenAssessment.dairy, 'unknown');
assert.deepEqual(incomplete.blockers, ['cooked batch yield evidence', 'allergen evidence: dairy', 'micronutrient evidence or explicit null: calcium']);
assert.equal(reviewRecipe({ ...recipe, allergens: { ...recipe.allergens, dairy: null } }).status, 'incomplete');
assert.equal(reviewRecipe({ ...recipe, preparationState: 'raw' }).status, 'incomplete');
assert.equal(reviewRecipe({ ...recipe, source: { ...source, url: 'http://example.invalid' } }).status, 'incomplete');
assert.equal(reviewRecipe({ ...recipe, micronutrients: {} }).blockers.length, 5);

const rows = [
  { id: 'active', is_active: true, allergy_flags: ['dairy'], allergen_assessment: { egg: 'assessed_absent', soy: 'unknown' } },
  { id: 'inactive', is_active: false },
];
const gaps = catalogEvidenceGaps(rows);
assert.deepEqual(gaps.map(row => row.id), ['active']);
assert(gaps[0].allergensWithoutRecordedAssessment.includes('egg'));
assert(gaps[0].allergensWithoutRecordedAssessment.includes('soy'));
assert(!gaps[0].allergensWithoutRecordedAssessment.includes('dairy'));
assert(!gaps[0].recipeBatchYieldRecorded);
assert.throws(() => catalogEvidenceGaps([...rows, rows[0]]), /unique IDs/);

const temp = mkdtempSync(join(tmpdir(), 'behtan-catalog-review-'));
try {
  const candidatePath = join(temp, 'recipe.json');
  const approvalPath = join(temp, 'approval.json');
  writeFileSync(candidatePath, JSON.stringify(recipe));
  writeFileSync(approvalPath, JSON.stringify(approval));
  const run = (...args) => spawnSync(process.execPath, [
    '--experimental-strip-types', 'scripts/review-nutrition-catalog.mjs', '--candidate', candidatePath, ...args,
  ], { encoding: 'utf8' });
  assert.equal(JSON.parse(run().stdout).status, 'awaiting_review');
  assert.equal(run('--approval', approvalPath).status, 0);
  writeFileSync(candidatePath, JSON.stringify({ ...recipe, version: 'updated' }));
  const stale = run('--approval', approvalPath);
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).status, 'approval_mismatch');
} finally {
  rmSync(temp, { force: true, recursive: true });
}
console.log('PASS catalog evidence gaps, review provenance, cross-contact, cooked yield, unknown micronutrients and stale approvals');
