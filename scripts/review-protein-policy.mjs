import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { calculateFullNutritionPlanWithTrace, calculateProteinReferenceWeightKg } from '../src/utils/nutritionHelpers.ts';
import { contentFingerprint } from '../src/utils/planProvenance.ts';
import {
  buildProteinEnginePolicy, CONTINUOUS_REFERENCE_WEIGHT_MODEL, DEFAULT_PROTEIN_ENGINE_POLICY, STEP_REFERENCE_WEIGHT_MODEL,
} from '../src/utils/proteinPolicy.ts';

const { values } = parseArgs({ options: {
  baseline: { type: 'string' }, candidate: { type: 'string' }, continuous: { type: 'boolean' },
} });
const reviewDate = '2026-11-15';
const birthDateISO = '1992-04-23';
const scenarios = [
  { id: 'loss-resistance', gender: 'male', goal: 'weight_loss', activityLevel: 'active',
    trainingType: 'resistance', proteinBudgetPreference: 'performance', isWorkoutDay: true },
  { id: 'loss-sedentary', gender: 'female', goal: 'weight_loss', activityLevel: 'sedentary',
    trainingType: null, proteinBudgetPreference: 'economic', isWorkoutDay: false },
  { id: 'maintenance-rest', gender: 'female', goal: 'maintenance', activityLevel: 'moderate',
    trainingType: 'mixed', proteinBudgetPreference: 'balanced', isWorkoutDay: false },
  { id: 'maintenance-workout', gender: 'female', goal: 'maintenance', activityLevel: 'moderate',
    trainingType: 'mixed', proteinBudgetPreference: 'balanced', isWorkoutDay: true },
  { id: 'gain-cardio', gender: 'male', goal: 'weight_gain', activityLevel: 'lightly_active',
    trainingType: 'cardio', proteinBudgetPreference: 'economic', isWorkoutDay: true },
];

function readPolicy(flag, file) {
  const row = JSON.parse(readFileSync(file, 'utf8'));
  if (!row || typeof row.id !== 'string' || !row.id.trim() ||
      (row.updated_at != null && typeof row.updated_at !== 'string')) {
    throw new Error(`--${flag} needs one nutrition_protein_policy row as a JSON object.`);
  }
  return buildProteinEnginePolicy(row);
}

function describePolicy(policy, source) {
  return { source, referenceWeightModel: STEP_REFERENCE_WEIGHT_MODEL, fingerprint: contentFingerprint(policy), ...policy };
}

function evaluate(input, proteinPolicy) {
  const { targets, trace } = calculateFullNutritionPlanWithTrace({ ...input, proteinPolicy });
  return {
    targetCalories: targets.targetCalories,
    proteinGrams: targets.proteinGrams,
    carbGrams: targets.carbGrams,
    fatGrams: targets.fatGrams,
    referenceWeightKg: trace.proteinReferenceWeightKg,
    rawProteinGrams: trace.rawProteinTargetGrams,
    proteinCappedByCalories: trace.proteinCappedByCalories,
    proteinCappedByAbsoluteLimit: trace.proteinCappedByAbsoluteLimit,
  };
}

function compareBoundary(input, belowKg, aboveKg, policy) {
  const below = evaluate({ ...input, weightKg: belowKg }, policy);
  const above = evaluate({ ...input, weightKg: aboveKg }, policy);
  return { below, above, proteinDeltaGrams: above.proteinGrams - below.proteinGrams };
}

const baseline = values.baseline === undefined
  ? DEFAULT_PROTEIN_ENGINE_POLICY : readPolicy('baseline', values.baseline);
const candidateInput = values.candidate === undefined ? null : readPolicy('candidate', values.candidate);
const candidate = values.continuous
  ? { ...(candidateInput ?? baseline), referenceWeightModel: CONTINUOUS_REFERENCE_WEIGHT_MODEL }
  : candidateInput;
const thresholds = new Set([baseline.obesityBmiThreshold]);
if (candidate) thresholds.add(candidate.obesityBmiThreshold);
const heights = [160, 178, 195];

const boundaries = [];
for (const heightCm of heights) {
  for (const thresholdBmi of thresholds) {
    const thresholdKg = thresholdBmi * (heightCm / 100) ** 2;
    // Use supported 0.1 kg steps strictly on either side, even at an exact tenth.
    const belowKg = Math.floor((thresholdKg - 1e-6) * 10) / 10;
    const aboveKg = Math.ceil((thresholdKg + 1e-6) * 10) / 10;
    for (const { id, ...context } of scenarios) {
      const input = { ...context, heightCm, birthDateISO, referenceDate: new Date(reviewDate + 'T12:00:00Z') };
      boundaries.push({
        scenario: id, heightCm, thresholdBmi, belowKg, aboveKg,
        baseline: compareBoundary(input, belowKg, aboveKg, baseline),
        candidate: candidate ? compareBoundary(input, belowKg, aboveKg, candidate) : null,
      });
    }
  }
}

console.log(JSON.stringify({
  version: 1,
  reviewDate,
  birthDateISO,
  baseline: describePolicy(baseline, values.baseline === undefined ? 'repository_default' : 'file'),
  candidate: candidate ? describePolicy(candidate,
    values.candidate === undefined ? 'baseline_coefficients' : 'file') : null,
  ...(candidate?.referenceWeightModel === CONTINUOUS_REFERENCE_WEIGHT_MODEL ? { candidateTransition: heights.map(heightCm => {
    const endsAtKg = candidate.obesityBmiThreshold * (heightCm / 100) ** 2;
    return { heightCm, startsAtKg: calculateProteinReferenceWeightKg(endsAtKg, heightCm, candidate), endsAtKg };
  }) } : {}),
  scenarios,
  boundaries,
}, null, 2));
