import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { calculateFullNutritionPlanWithTrace, calculateProteinReferenceWeightKg } from '../src/utils/nutritionHelpers.ts';
import { DEFAULT_PROTEIN_ENGINE_POLICY as policy } from '../src/utils/proteinPolicy.ts';
import { generateMemberPrescription } from '../src/utils/memberPrescription.ts';
import { emptyRealIntake, generatePrintedPlan, menuCombinationsFeasible, menuIdentity } from '../src/professional/menuPlan.ts';
import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { CONTINUOUS_REFERENCE_WEIGHT_MODEL, continuousReferenceWeightKg } from './e07-continuous-reference-weight.mjs';

let weightChecks = 0;
for (const height of [140, 160, 178, 195, 210]) {
  for (const threshold of [25, 30, 35, 60]) {
    for (const fraction of [0, .4, 1]) {
      const custom = { ...policy, obesityBmiThreshold: threshold, referenceBmi: threshold === 25 ? 18 : 25,
        excessWeightFraction: fraction };
      const thresholdKg = threshold * (height / 100) ** 2;
      const plateauKg = continuousReferenceWeightKg(thresholdKg, height, custom);
      const epsilon = 1e-6;
      for (const join of [plateauKg, thresholdKg]) {
        const below = continuousReferenceWeightKg(join - epsilon, height, custom);
        const above = continuousReferenceWeightKg(join + epsilon, height, custom);
        assert(above >= below && above - below <= 2 * epsilon + 1e-9);
      }
      let previous = 0;
      for (let tenths = 300; tenths <= 3000; tenths++) {
        const weight = tenths / 10;
        const actual = continuousReferenceWeightKg(weight, height, custom);
        const original = calculateProteinReferenceWeightKg(weight, height, custom);
        assert(actual >= previous && actual <= original + 1e-9 && actual <= weight);
        if (weight > thresholdKg + epsilon || weight < plateauKg - epsilon) assert(Math.abs(actual - original) <= 1e-9);
        previous = actual;
        weightChecks++;
      }
    }
  }
}
for (const height of [undefined, NaN, Infinity, 0, -1]) assert.equal(continuousReferenceWeightKg(80, height), 80);

const report = JSON.parse(execFileSync(process.execPath, [
  '--experimental-strip-types', fileURLToPath(new URL('./review-protein-policy.mjs', import.meta.url)), '--continuous',
], { encoding: 'utf8' }));
assert.equal(report.candidate.referenceWeightModel, CONTINUOUS_REFERENCE_WEIGHT_MODEL);
assert.equal(report.baseline.fingerprint, report.candidate.fingerprint);
for (const boundary of report.boundaries) {
  assert(boundary.candidate.proteinDeltaGrams >= 0);
  for (const side of ['below', 'above']) {
    const baseline = boundary.baseline[side], candidate = boundary.candidate[side];
    assert.equal(candidate.targetCalories, baseline.targetCalories);
    assert.equal(candidate.fatGrams, baseline.fatGrams);
    assert(candidate.proteinGrams <= baseline.proteinGrams);
    assert.equal(candidate.proteinGrams + candidate.carbGrams, baseline.proteinGrams + baseline.carbGrams);
    assert(candidate.proteinGrams <= policy.maxProteinGramsPerDay);
    assert(candidate.proteinGrams * 4 <= candidate.targetCalories * policy.maxProteinCalorieFraction);
  }
}
const known = report.boundaries.find(b => b.heightCm === 178 && b.scenario === 'loss-resistance');
assert.deepEqual([known.baseline.below.proteinGrams, known.baseline.above.proteinGrams], [190, 171]);
assert.deepEqual([known.candidate.below.proteinGrams, known.candidate.above.proteinGrams], [171, 171]);

installTestNutritionCatalog();
const date = report.reviewDate;
const intake = { ...emptyRealIntake(), display_name: 'Synthetic E07 review', gender: 'male',
  birth_date: report.birthDateISO, height_cm: 178, activity_level: 'active', goal: 'weight_loss',
  workout_days: 3, training_type: 'resistance', protein_budget: 'performance',
  pregnancy_status: 'not_applicable', safety_confirmed: true };
for (const weightKg of [known.belowKg, known.aboveKg]) {
  for (const curve of [undefined, continuousReferenceWeightKg]) {
    const input = { ...report.scenarios[0], weightKg, heightCm: intake.height_cm, birthDateISO: intake.birth_date,
      referenceDate: new Date(date + 'T12:00:00Z') };
    const { targets } = calculateFullNutritionPlanWithTrace(input, curve);
    const preferences = { vegetarianStatus: 'none', allergies: [] };
    const member = generateMemberPrescription(targets, weightKg, preferences, true, date);
    assert.equal(member.remainingTargetsUnmet, false);
    for (const count of [4, 5]) {
      const plan = generatePrintedPlan({ ...intake, weight_kg: weightKg }, 1, count, policy, date, '', undefined, curve);
      assert.equal(plan.days.length, 2);
      for (const day of plan.days) {
        assert.equal(day.targets.proteinGrams, targets.proteinGrams);
        assert(menuCombinationsFeasible(day.slots, day.targets));
        for (const slot of day.slots) {
          assert.equal(slot.options.length, count);
          assert.equal(new Set(slot.options.map(menuIdentity)).size, count);
        }
      }
    }
  }
}
console.log(`PASS E07 review: ${weightChecks} weight samples, ${report.boundaries.length} macro boundary pairs, and 8 Pro plans with exact menus`);
