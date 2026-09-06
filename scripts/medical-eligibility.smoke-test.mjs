import assert from 'node:assert/strict';
import {
  evaluateMedicalEligibility,
  MEDICAL_SAFETY_SCREENING_VERSION,
  resolveSafeWeightLossSpeed,
} from '../src/utils/medicalEligibility.ts';

const referenceDate = new Date(2026, 8, 5);

const safeMedical = {
  conditions: [],
  injuries: '',
  medications: '',
  pregnancyStatus: 'not_applicable',
  eatingDisorderStatus: 'none',
  safetyScreeningVersion: MEDICAL_SAFETY_SCREENING_VERSION,
  safetyAnswersConfirmed: true,
};

const safeAdult = {
  gender: 'male',
  birthDate: '1990-01-01',
  heightCm: 178,
  weightKg: 85,
  goal: 'weight_loss',
  medical: safeMedical,
  referenceDate,
};

const safeResult = evaluateMedicalEligibility(safeAdult);
assert.equal(safeResult.status, 'eligible');
assert.equal(safeResult.canGenerateAutomaticPlan, true);
assert.equal(safeResult.fastWeightLossAllowed, true);

const legacyResult = evaluateMedicalEligibility({
  ...safeAdult,
  medical: { conditions: [], injuries: '', medications: '' },
});
assert.equal(legacyResult.status, 'needs_screening');
assert.equal(legacyResult.canGenerateAutomaticPlan, false);

for (const condition of ['diabetes', 'kidney_disease', 'heart_disease', 'advanced_liver_disease']) {
  const result = evaluateMedicalEligibility({
    ...safeAdult,
    medical: { ...safeMedical, conditions: [condition] },
  });
  assert.equal(result.status, 'blocked', `${condition} must hard-stop automatic plans`);
  assert.equal(result.blockers.some((item) => item.code === condition), true);
}

for (const pregnancyStatus of ['pregnant', 'breastfeeding']) {
  const result = evaluateMedicalEligibility({
    ...safeAdult,
    gender: 'female',
    medical: { ...safeMedical, pregnancyStatus },
  });
  assert.equal(result.status, 'blocked', `${pregnancyStatus} must hard-stop automatic plans`);
}

const activeEatingDisorder = evaluateMedicalEligibility({
  ...safeAdult,
  medical: { ...safeMedical, eatingDisorderStatus: 'active_or_treatment' },
});
assert.equal(activeEatingDisorder.status, 'blocked');
assert.equal(activeEatingDisorder.blockers[0].code, 'active_eating_disorder');

const underweightLoss = evaluateMedicalEligibility({ ...safeAdult, weightKg: 55 });
assert.equal(underweightLoss.status, 'blocked');
assert.equal(underweightLoss.blockers.some((item) => item.code === 'underweight_weight_loss'), true);

const extremeHighBmi = evaluateMedicalEligibility({ ...safeAdult, weightKg: 170 });
assert.equal(extremeHighBmi.status, 'blocked');
assert.equal(extremeHighBmi.blockers.some((item) => item.code === 'extreme_high_bmi'), true);

const highBmiCaution = evaluateMedicalEligibility({ ...safeAdult, weightKg: 140 });
assert.equal(highBmiCaution.status, 'eligible_with_caution');
assert.equal(highBmiCaution.canGenerateAutomaticPlan, true);
assert.equal(highBmiCaution.fastWeightLossAllowed, false);
assert.equal(resolveSafeWeightLossSpeed('fast', highBmiCaution), 'standard');

const thyroidCaution = evaluateMedicalEligibility({
  ...safeAdult,
  medical: { ...safeMedical, conditions: ['thyroid'], medications: 'لووتیروکسین' },
});
assert.equal(thyroidCaution.status, 'eligible_with_caution');
assert.equal(thyroidCaution.canGenerateAutomaticPlan, true);
assert.equal(thyroidCaution.fastWeightLossAllowed, false);

const invalidFemaleScreen = evaluateMedicalEligibility({
  ...safeAdult,
  gender: 'female',
  medical: safeMedical,
});
assert.equal(invalidFemaleScreen.status, 'needs_screening');

console.log('✅ Behtan medical eligibility & safety gate smoke test passed');
console.log('   Legacy screening migration: OK');
console.log('   Medical/pregnancy/eating-disorder hard stops: OK');
console.log('   BMI guardrails and fast-mode restriction: OK');
