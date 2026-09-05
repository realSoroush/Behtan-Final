import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateFullNutritionPlanWithTrace,
  resolveProteinFactorRangeGPerKg,
} from '../src/utils/nutritionHelpers.ts';
import { DEFAULT_PROTEIN_ENGINE_POLICY } from '../src/utils/proteinPolicy.ts';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const cases = [
  ['maintenance', 'cardio', 1.2, 1.4],
  ['maintenance', 'resistance', 1.4, 1.6],
  ['weight_loss', 'cardio', 1.3, 1.6],
  ['weight_loss', 'resistance', 1.6, 2.0],
  ['weight_gain', 'cardio', 1.4, 1.6],
  ['weight_gain', 'resistance', 1.6, 1.7],
];

for (const [goal, trainingType, minimum, preferred] of cases) {
  const range = resolveProteinFactorRangeGPerKg(goal, trainingType, DEFAULT_PROTEIN_ENGINE_POLICY);
  assert(range.minimum === minimum, `${goal}/${trainingType} minimum mismatch`);
  assert(range.preferred === preferred, `${goal}/${trainingType} preferred mismatch`);
  assert(range.minimum <= range.preferred, `${goal}/${trainingType} invalid range`);
}

const result = calculateFullNutritionPlanWithTrace({
  weightKg: 125,
  heightCm: 178,
  birthDateISO: '2002-01-15',
  gender: 'male',
  activityLevel: 'moderate',
  goal: 'weight_loss',
  weightLossSpeed: 'standard',
  trainingType: 'resistance',
  isWorkoutDay: false,
  referenceDate: new Date('2026-09-05T12:00:00Z'),
});

assert(Math.abs(result.trace.proteinReferenceWeightKg - 97.5) <= 0.2, 'Reference weight drifted');
assert(Math.abs(result.trace.proteinMinimumTargetGrams - 156) <= 1, 'Loss+RT minimum target should be ~156g');
assert(Math.abs(result.trace.proteinPreferredTargetGrams - 195) <= 1, 'Loss+RT preferred target should be ~195g');
assert(result.targets.proteinGrams === result.trace.finalProteinTargetGrams, 'Final target trace mismatch');
assert(result.trace.proteinFactorGPerKg === result.trace.proteinPreferredFactorGPerKg, 'Phase 2A must preserve preferred target as active');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const step4 = readFileSync(resolve(root, 'src/components/onboarding/Step4Activity.tsx'), 'utf8');
assert(!step4.includes('rounded-2xl bg-white px-3 py-2 text-center shadow-sm dark:bg-neutral-900'), 'TDEE multiplier card still has hard background');

console.log('✅ Behtan Protein Minimum/Preferred Phase 2A smoke test passed');
console.log('   Loss + RT @125kg/178cm: minimum ~156 g, preferred ~195 g');
console.log(`   Active target remains preferred: ${result.targets.proteinGrams} g`);
console.log('   TDEE multiplier box: background removed');
