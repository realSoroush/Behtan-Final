import { createEmptyOnboardingData, type DailyMealPlan, type MacroTargets, type NutritionCatalog, type OnboardingData, type ProteinEnginePolicy } from '@/types';
import { evaluateOnboardingMedicalEligibility, resolveSafeWeightLossSpeed } from '@/utils/medicalEligibility';
import { calculateFullNutritionPlanWithTrace, tryCalculateAge, type NutritionCalculationTrace } from '@/utils/nutritionHelpers';
import { generateDailyMealPlan, configureNutritionCatalog } from '@/utils/mealPlanEngine';
import { hasDailyMovementAnswers, hasWorkoutAnswers, deriveOnboardingActivity } from '@/utils/onboardingActivity';
import { getLocalDateKey } from '@/utils/dailyMealProgress';

export interface TestScenarioAnswers {
  data: OnboardingData;
  isWorkoutDay: boolean;
  date: string;
}
export interface TestScenarioResult {
  targets: MacroTargets;
  trace: NutritionCalculationTrace;
  plan: DailyMealPlan;
  totals: { kcal: number; protein: number; carbs: number; fat: number };
}

// Identical calculation inputs and seed to DashboardPage for a first view of an unconsumed day.
export function calculateTestScenario(
  scenario: TestScenarioAnswers,
  catalog: NutritionCatalog,
  proteinPolicy: ProteinEnginePolicy,
): TestScenarioResult {
  const { data, isWorkoutDay, date } = scenario;
  if (!data.gender || !data.goal || !data.height || !data.weight || !data.proteinBudgetPreference
      || !data.birthDate || tryCalculateAge(data.birthDate) === null
      || data.height < 100 || data.height > 250 || data.weight < 30 || data.weight > 300
      || !hasDailyMovementAnswers(data) || !hasWorkoutAnswers(data)
      || !data.province || !data.city || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('پاسخ‌های پایه، تاریخ تولد، تحرک، ورزش یا ترجیحات هنوز کامل نیستند.');
  }
  if (isWorkoutDay && data.workoutLocation === 'none') {
    throw new Error('روز تمرین برای فردی که ورزش نمی‌کند قابل انتخاب نیست.');
  }
  const activityLevel = deriveOnboardingActivity(data);
  if (!activityLevel) throw new Error('پاسخ‌های تحرک و ورزش معتبر نیستند.');
  const eligibility = evaluateOnboardingMedicalEligibility(data);
  if (!eligibility.canGenerateAutomaticPlan) {
    throw new Error(eligibility.blockers.map(blocker => blocker.title).join('، ') || 'برای این پاسخ‌های پزشکی برنامهٔ خودکار صادر نمی‌شود.');
  }
  const { targets, trace } = calculateFullNutritionPlanWithTrace({
    weightKg: data.weight, heightCm: data.height, birthDateISO: data.birthDate,
    gender: data.gender, activityLevel, goal: data.goal,
    weightLossSpeed: resolveSafeWeightLossSpeed('standard', eligibility),
    bodyFatPercentage: data.bodyScanResult?.bodyFatPct,
    bodyFatSource: data.bodyScanResult ? 'ai_visual' : null,
    isWorkoutDay, trainingType: data.trainingType,
    proteinBudgetPreference: data.proteinBudgetPreference, proteinPolicy,
  });
  configureNutritionCatalog(catalog);
  const plan = generateDailyMealPlan(
    targets, data.weight,
    { vegetarianStatus: data.vegetarianStatus, allergies: data.allergies },
    isWorkoutDay, `${date}-v0`, { proteinBudgetPreference: data.proteinBudgetPreference },
  );
  const totals = plan.meals.reduce((sum, meal) => ({
    kcal: sum.kcal + meal.totalKcal, protein: sum.protein + meal.totalProtein,
    carbs: sum.carbs + meal.totalCarbs, fat: sum.fat + meal.totalFat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { targets, trace, plan, totals };
}

export function emptyTestScenario(): TestScenarioAnswers {
  // Date and exercise-day choice match a fresh dashboard session on the same device.
  return { data: { ...createEmptyOnboardingData() }, isWorkoutDay: false, date: getLocalDateKey() };
}
