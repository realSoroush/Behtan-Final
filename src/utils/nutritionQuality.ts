import type { FoodQualitySummary, Meal, MealComponent } from '@/types';

export const FIBER_PER_1000_KCAL = 14;
export const MIN_ADULT_FIBER_GRAMS = 25;
export const FRUIT_VEG_TARGET_GRAMS = 400;

export function calculateFiberTarget(targetCalories: number): number {
  const energyBased = Math.max(0, targetCalories) * FIBER_PER_1000_KCAL / 1000;
  return Math.round(Math.max(MIN_ADULT_FIBER_GRAMS, energyBased) * 10) / 10;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPct(value: number): number {
  return Math.max(0, Math.round(value));
}

export function evaluateFoodQualityFromComponents(
  components: MealComponent[],
  targetCalories: number
): FoodQualitySummary {
  const fiberTargetGrams = calculateFiberTarget(targetCalories);
  let fiberGrams = 0;
  let fruitVegGrams = 0;
  let wholeGrainGrams = 0;
  let refinedGrainGrams = 0;
  let legumeGrams = 0;

  for (const component of components) {
    fiberGrams += component.fiber;
    fruitVegGrams += component.units * component.foodItem.fruitVegGramsPerUnit;

    const tags = new Set(component.foodItem.qualityTags);
    if (tags.has('whole_grain')) wholeGrainGrams += component.grams;
    if (tags.has('refined_grain')) refinedGrainGrams += component.grams;
    if (tags.has('legume')) legumeGrams += component.grams;
  }

  fiberGrams = round1(fiberGrams);
  fruitVegGrams = Math.round(fruitVegGrams);
  wholeGrainGrams = Math.round(wholeGrainGrams);
  refinedGrainGrams = Math.round(refinedGrainGrams);
  legumeGrams = Math.round(legumeGrams);

  const fiberAdequacyPct = clampPct((fiberGrams / Math.max(1, fiberTargetGrams)) * 100);
  const fruitVegAdequacyPct = clampPct((fruitVegGrams / FRUIT_VEG_TARGET_GRAMS) * 100);

  const fiberStatus: FoodQualitySummary['fiberStatus'] =
    fiberGrams >= MIN_ADULT_FIBER_GRAMS && fiberAdequacyPct >= 90
      ? 'good'
      : fiberAdequacyPct >= 75
        ? 'needs_improvement'
        : 'poor';

  return {
    fiberTargetGrams,
    fiberGrams,
    fiberAdequacyPct,
    fiberStatus,
    fruitVegTargetGrams: FRUIT_VEG_TARGET_GRAMS,
    fruitVegGrams,
    fruitVegAdequacyPct,
    wholeGrainGrams,
    refinedGrainGrams,
    legumeGrams,
  };
}

export function evaluateDailyFoodQuality(meals: Meal[], targetCalories: number): FoodQualitySummary {
  return evaluateFoodQualityFromComponents(
    meals.flatMap((meal) => meal.components),
    targetCalories
  );
}

/**
 * Internal optimizer penalty. This is intentionally NOT shown to users as a
 * black-box score. The UI exposes the underlying transparent metrics instead.
 */
export function foodQualityPenalty(summary: FoodQualitySummary): number {
  const fiberDeficit = Math.max(0, summary.fiberTargetGrams - summary.fiberGrams) / Math.max(1, summary.fiberTargetGrams);
  const fiberFloorDeficit = Math.max(0, MIN_ADULT_FIBER_GRAMS - summary.fiberGrams) / MIN_ADULT_FIBER_GRAMS;
  // There is no formal tolerable upper intake level for dietary fiber, but an
  // automated meal planner should not chase very high intakes by default. This
  // is a soft comfort preference only; restricted diets are never failed for it.
  const fiberComfortUpper = Math.max(45, summary.fiberTargetGrams * 1.6);
  const fiberExcess = Math.max(0, summary.fiberGrams - fiberComfortUpper) / fiberComfortUpper;
  const fruitVegDeficit = Math.max(0, FRUIT_VEG_TARGET_GRAMS - summary.fruitVegGrams) / FRUIT_VEG_TARGET_GRAMS;

  const totalGrain = summary.wholeGrainGrams + summary.refinedGrainGrams;
  const refinedShare = totalGrain > 0 ? summary.refinedGrainGrams / totalGrain : 0;
  const excessiveRefinedShare = Math.max(0, refinedShare - 0.6) / 0.4;

  // Fiber is the primary quality guardrail. Fruit/veg and grain quality are
  // softer preferences; legumes are a small tie-breaker rather than a daily
  // requirement.
  const legumeCredit = Math.min(0.12, summary.legumeGrams / 1000);
  return (
    3.2 * fiberDeficit +
    2.2 * fiberFloorDeficit +
    1.8 * fiberExcess +
    1.2 * fruitVegDeficit +
    0.65 * excessiveRefinedShare -
    legumeCredit
  );
}
