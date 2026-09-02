import { installTestNutritionCatalog } from './setup-test-nutrition-catalog.mjs';
import { calculateFullNutritionPlan } from '../src/utils/nutritionHelpers.ts';
import { generateDailyMealPlan, MealPlanFeasibilityError } from '../src/utils/mealPlanEngine.ts';
import {
  calculateFiberTarget,
  evaluateDailyFoodQuality,
  MIN_ADULT_FIBER_GRAMS,
} from '../src/utils/nutritionQuality.ts';

installTestNutritionCatalog();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(calculateFiberTarget(1500) === 25, '1500 kcal fiber floor should be 25g');
assert(calculateFiberTarget(2149) === 30.1, '2149 kcal fiber target should be 30.1g');
assert(calculateFiberTarget(2500) === 35, '2500 kcal fiber target should be 35g');

const normalPreferences = { vegetarianStatus: 'none', allergies: [] };
const representative = [
  { weightKg: 58, heightCm: 158, gender: 'female', activityLevel: 'moderate', goal: 'weight_loss' },
  { weightKg: 80, heightCm: 178, gender: 'male', activityLevel: 'lightly_active', goal: 'weight_loss' },
  { weightKg: 105, heightCm: 180, gender: 'male', activityLevel: 'moderate', goal: 'weight_loss' },
  { weightKg: 70, heightCm: 168, gender: 'female', activityLevel: 'moderate', goal: 'maintenance' },
];

let plansTested = 0;
let minFiberPct = Infinity;
let minFruitVeg = Infinity;
let maxFiberPct = 0;

for (let day = 1; day <= 14; day++) {
  for (const user of representative) {
    const targets = calculateFullNutritionPlan({
      ...user,
      birthDateISO: '1990-05-15',
      weightLossSpeed: 'standard',
      isWorkoutDay: day % 3 === 0,
    });

    let plan;
    try {
      plan = generateDailyMealPlan(
        targets,
        user.weightKg,
        normalPreferences,
        day % 3 === 0,
        `2026-09-${String(day).padStart(2, '0')}`
      );
    } catch (error) {
      if (error instanceof MealPlanFeasibilityError) continue;
      throw error;
    }

    const quality = evaluateDailyFoodQuality(plan.meals, targets.targetCalories);
    plansTested += 1;
    minFiberPct = Math.min(minFiberPct, quality.fiberAdequacyPct);
    maxFiberPct = Math.max(maxFiberPct, quality.fiberAdequacyPct);
    minFruitVeg = Math.min(minFruitVeg, quality.fruitVegGrams);

    // Fiber is a secondary quality guardrail, not a hard plan-failure gate.
    // Common unrestricted plans should nevertheless clear a useful minimum.
    assert(
      quality.fiberAdequacyPct >= 75 || quality.fiberGrams >= MIN_ADULT_FIBER_GRAMS,
      `Common plan fiber too low: ${JSON.stringify(quality)}`
    );
    assert(
      quality.fruitVegGrams >= 250,
      `Common plan fruit/vegetable amount too low: ${quality.fruitVegGrams}g`
    );

    // Fiber is separate from total carbohydrate; it must never be added again.
    for (const meal of plan.meals) {
      const componentFiber = meal.components.reduce((sum, component) => sum + component.fiber, 0);
      assert(Math.abs(componentFiber - meal.totalFiber) <= 0.2, `Meal fiber total drifted: ${meal.templateId}`);
    }
  }
}

assert(plansTested > 0, 'No representative quality plans were generated');

console.log('✅ Behtan fiber + food-quality smoke test passed');
console.log(`   Representative plans tested: ${plansTested}`);
console.log(`   Minimum fiber adequacy: ${minFiberPct}%`);
console.log(`   Maximum fiber adequacy: ${maxFiberPct}%`);
console.log(`   Minimum fruit+vegetable amount: ${minFruitVeg}g`);
console.log('   Nutrition v2 targets: unchanged');
console.log('   Fiber: tracked separately from total carbohydrate');
