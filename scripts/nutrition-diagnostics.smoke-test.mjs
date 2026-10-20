import {
  calculateFullNutritionPlanWithTrace,
} from '../src/utils/nutritionHelpers.ts';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const base = {
  weightKg: 57,
  heightCm: 158,
  birthDateISO: '2000-01-01',
  gender: 'female',
  activityLevel: 'moderate',
  goal: 'weight_loss',
  weightLossSpeed: 'standard',
  isWorkoutDay: false,
  referenceDate: new Date('2026-09-01T12:00:00'),
};

const noScan = calculateFullNutritionPlanWithTrace(base);
const aiScan = calculateFullNutritionPlanWithTrace({
  ...base,
  bodyFatPercentage: 24,
  bodyFatSource: 'ai_visual',
});
const measured = calculateFullNutritionPlanWithTrace({
  ...base,
  bodyFatPercentage: 24,
  bodyFatSource: 'measured',
});

assert(noScan.trace.chronologicalAgeUsed === 26, 'Chronological age must be 26');
// Current policy is a fixed 25% adjustment; these golden values previously
// encoded the superseded 22% policy. Keep the engine unchanged.
assert(noScan.trace.tdee === 1964, 'Mifflin/activity fixture changed');
assert(noScan.targets.targetCalories === 1473, `Expected 1473 kcal (25%), got ${noScan.targets.targetCalories}`);
assert(aiScan.targets.targetCalories === noScan.targets.targetCalories, 'AI visual body fat changed calorie target');
assert(aiScan.trace.bmrFormula === 'mifflin_st_jeor', 'AI visual body fat must use Mifflin-St Jeor');
assert(aiScan.trace.bodyFatUsedInBmr === false, 'AI visual body fat was used in BMR');
assert(aiScan.trace.biologicalAgeUsedInNutrition === false, 'Biological age must never drive nutrition math');
assert(measured.trace.bmrFormula === 'katch_mcardle', 'Measured body fat must automatically use Katch-McArdle');
assert(measured.trace.bodyFatUsedInBmr === true, 'Measured body fat was not used in BMR');
assert(measured.trace.tdee === 2024, 'Measured body-fat/activity fixture changed');
assert(measured.targets.targetCalories === 1518, `Expected measured-BF target 1518 (25%), got ${measured.targets.targetCalories}`);

console.log('✅ Behtan nutrition diagnostics/body-fat policy smoke test passed');
console.log(`   No scan: ${noScan.targets.targetCalories} kcal via ${noScan.trace.bmrFormula}`);
console.log(`   AI visual 24% BF: ${aiScan.targets.targetCalories} kcal via ${aiScan.trace.bmrFormula}`);
console.log(`   Measured 24% BF: ${measured.targets.targetCalories} kcal via ${measured.trace.bmrFormula}`);
console.log('   Biological age used in nutrition: false');
