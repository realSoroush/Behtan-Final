import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { TEST_NUTRITION_CATALOG, installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { DEFAULT_PROTEIN_ENGINE_POLICY } from '../src/utils/proteinPolicy.ts';
import { calculateFullNutritionPlanWithTrace } from '../src/utils/nutritionHelpers.ts';
import { generateDailyMealPlan } from '../src/utils/mealPlanEngine.ts';
const bundled = await build({ entryPoints: ['src/admin/testScenarioEngine.ts'], bundle: true, write: false, platform: 'node', format: 'esm', tsconfig: 'tsconfig.json' });
const { emptyTestScenario, calculateTestScenario } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);
const scenario = emptyTestScenario();
Object.assign(scenario.data, {
  gender: 'female', province: 'تهران', city: 'تهران', birthDate: '1992-04-23',
  height: 155, weight: 85, goal: 'weight_loss', dailyMovement: 'mostly_seated',
  dailySteps: 'under_4000', workoutLocation: 'none', workoutDays: 0,
  pregnancyStatus: 'not_pregnant', eatingDisorderStatus: 'none', safetyScreeningVersion: 1,
  safetyAnswersConfirmed: true, proteinBudgetPreference: 'economic',
});
scenario.date = '2026-10-15';
const actual = calculateTestScenario(scenario, TEST_NUTRITION_CATALOG, DEFAULT_PROTEIN_ENGINE_POLICY);
installTestNutritionCatalog();
const expected = calculateFullNutritionPlanWithTrace({
  weightKg: 85, heightCm: 155, birthDateISO: '1992-04-23', gender: 'female',
  activityLevel: 'sedentary', goal: 'weight_loss', weightLossSpeed: 'standard',
  bodyFatPercentage: undefined, bodyFatSource: null, isWorkoutDay: false,
  trainingType: null, proteinBudgetPreference: 'economic', proteinPolicy: DEFAULT_PROTEIN_ENGINE_POLICY,
});
assert.deepEqual(actual.targets, expected.targets, 'Admin targets must match dashboard inputs');
assert.deepEqual(actual.plan, generateDailyMealPlan(expected.targets, 85, { vegetarianStatus: 'none', allergies: [] }, false, `${scenario.date}-v0`, {proteinBudgetPreference: 'economic'}), 'Same seed and inputs must give same user meal plan');
assert.throws(() => calculateTestScenario({...scenario,data:{...scenario.data,medicalConditions:['kidney_disease']}},TEST_NUTRITION_CATALOG,DEFAULT_PROTEIN_ENGINE_POLICY),/بیماری کلیه/);
assert.throws(() => calculateTestScenario({...scenario,data:{...scenario.data,safetyAnswersConfirmed:false}},TEST_NUTRITION_CATALOG,DEFAULT_PROTEIN_ENGINE_POLICY),/ارزیابی ایمنی/);
console.log('✅ Admin scenario matches dashboard calculation and first-day meals; medical blockers remain enforced');
