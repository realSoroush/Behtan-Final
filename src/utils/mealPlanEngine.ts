/**
 * mealPlanEngine.ts
 * ─────────────────────────────────────────────────────────────────────────
 * DYNAMIC, deterministic meal-plan generation. No AI, no invented numbers.
 *
 * Architecture (bottom to top):
 *   1. Supabase food_items          - atomic foods + serving guardrails
 *   2. Supabase food_substitutes    - approved swap graph
 *   3. Supabase meal_templates      - culturally coherent meal structures
 *   4. SLOT_DISTRIBUTION     - reverse-engineered from a real, verified
 *                              professional diet plan (see below)
 *   5. generateDailyMealPlan - fills each template dynamically per user
 *
 * Every user gets the SAME templates but DIFFERENT gram amounts, because
 * amounts are computed live from that user's own MacroTargets. Two users
 * with different weight/goal/gender will see different portion sizes for
 * the exact same meal structure - that's the point.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  Allergy,
  DailyMealPlan,
  DietaryPreferencesJson,
  FoodItem,
  FoodSwapOption,
  MacroTargets,
  Meal,
  MealComponent,
  MealSlot,
  MealTemplate,
  NutritionCatalog,
  PortionRule,
} from '@/types';
import {
  evaluateFoodQualityFromComponents,
  foodQualityPenalty,
} from './nutritionQuality.ts';
// ============================================================================
// RUNTIME NUTRITION CATALOG
// ============================================================================
// Production data is loaded from Supabase before meal generation. Keeping the
// engine dependent on an injected catalog prevents a hidden second source of
// truth in the app bundle while preserving deterministic, pure calculations.
let ACTIVE_CATALOG: NutritionCatalog | null = null;

export class NutritionCatalogNotLoadedError extends Error {
  constructor() {
    super('دیتابیس غذایی به‌تن هنوز بارگذاری نشده است.');
    this.name = 'NutritionCatalogNotLoadedError';
  }
}

export function configureNutritionCatalog(catalog: NutritionCatalog): void {
  ACTIVE_CATALOG = catalog;
}

export function clearNutritionCatalog(): void {
  ACTIVE_CATALOG = null;
}

function requireNutritionCatalog(): NutritionCatalog {
  if (!ACTIVE_CATALOG) throw new NutritionCatalogNotLoadedError();
  return ACTIVE_CATALOG;
}

const foodById = (id: string): FoodItem => {
  const f = requireNutritionCatalog().foods.find((x) => x.id === id);
  if (!f) throw new Error(`[mealPlanEngine] Unknown food item id: ${id}`);
  return f;
};

export function getSubstitutesFor(foodItemId: string): FoodItem[] {
  const group = requireNutritionCatalog().substitutes.find((g) => g.foodItemId === foodItemId);
  if (!group) return [];
  return group.substituteIds.map(foodById);
}

// ============================================================================
// 4 - SLOT DISTRIBUTION
// ============================================================================

interface SlotShare {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const SLOT_DISTRIBUTION: Record<MealSlot, SlotShare> = {
  // Calories stay on the verified v2 split. Carbs/fats are distributed more
  // evenly so the optimizer does not try to cram 40% of the day's carbs into
  // lunch (the main cause of extreme rice portions). Daily macro targets are
  // unchanged; this is only a meal-allocation policy.
  breakfast:        { kcal: 0.20, protein: 0.21, carbs: 0.20, fat: 0.25 },
  morning_snack:    { kcal: 0.11, protein: 0.15, carbs: 0.10, fat: 0.10 },
  lunch:            { kcal: 0.34, protein: 0.26, carbs: 0.30, fat: 0.30 },
  afternoon_snack:  { kcal: 0.12, protein: 0.12, carbs: 0.20, fat: 0.10 },
  dinner:           { kcal: 0.18, protein: 0.22, carbs: 0.15, fat: 0.20 },
  night_snack:      { kcal: 0.05, protein: 0.04, carbs: 0.05, fat: 0.05 },
};

const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'صبحانه',
  morning_snack: 'میان‌وعده صبح',
  lunch: 'ناهار',
  afternoon_snack: 'میان‌وعده عصر',
  dinner: 'شام',
  night_snack: 'قبل از خواب',
};

const SLOT_ORDER: MealSlot[] = [
  'breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'night_snack',
];

// ============================================================================
// 5 - DIETARY FILTERING — fail closed
// ============================================================================

function isFoodAllowed(food: FoodItem, preferences: DietaryPreferencesJson): boolean {
  return (
    !food.allergyFlags.some((a: Allergy) => preferences.allergies.includes(a)) &&
    !food.excludedForVegetarian.includes(preferences.vegetarianStatus)
  );
}

function isTemplateEligible(
  template: MealTemplate,
  preferences: DietaryPreferencesJson,
  isWorkoutDay: boolean
): boolean {
  if (template.isWorkoutDayOnly && !isWorkoutDay) return false;
  if (template.isRestDayOnly && isWorkoutDay) return false;
  if (
    template.restrictedDietOnly &&
    preferences.vegetarianStatus === 'none' &&
    preferences.allergies.length === 0
  ) return false;
  if (
    template.vegetarianStatusesOnly?.length &&
    !template.vegetarianStatusesOnly.includes(preferences.vegetarianStatus)
  ) return false;
  return template.slots.every((slotFill) => isFoodAllowed(foodById(slotFill.primaryFoodItemId), preferences));
}

export class MealPlanGenerationError extends Error {
  slot: MealSlot;

  constructor(slot: MealSlot, message: string) {
    super(message);
    this.name = 'MealPlanGenerationError';
    this.slot = slot;
  }
}

export class MealPlanFeasibilityError extends Error {
  target: MacroVector;
  actual: MacroVector;

  constructor(target: MacroVector, actual: MacroVector) {
    super(
      'با مواد غذایی و محدودیت‌های فعلی، ساخت برنامه‌ای با حجم واقعی و نزدیک به اهداف تغذیه‌ای شما ممکن نیست. لطفاً محدودیت‌های غذایی را بررسی کنید یا بعداً دوباره تلاش کنید.'
    );
    this.name = 'MealPlanFeasibilityError';
    this.target = target;
    this.actual = actual;
  }
}

// ============================================================================
// 6 - PORTION OPTIMIZER
// ============================================================================

type MacroVector = { kcal: number; protein: number; carbs: number; fat: number };

type ResolvedTemplate = {
  components: MealComponent[];
  totals: MacroVector;
  score: number;
  kcalDeviation: number;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function componentFromUnits(food: FoodItem, units: number): MealComponent {
  return {
    foodItem: food,
    units: round2(units),
    grams: Math.round(units * food.gramsPerUnit),
    kcal: Math.round(units * food.kcalPerUnit),
    protein: round1(units * food.proteinPerUnit),
    carbs: round1(units * food.carbsPerUnit),
    fat: round1(units * food.fatPerUnit),
    fiber: round1(units * food.fiberPerUnit),
  };
}

function addTotals(a: MacroVector, b: MealComponent): MacroVector {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

function range(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let value = min; value <= max + 1e-9; value += step) {
    out.push(round2(value));
  }
  return out;
}

function portionRuleFor(food: FoodItem): PortionRule {
  const rule = requireNutritionCatalog().portionRules[food.id];
  if (!rule) {
    throw new Error(`[mealPlanEngine] Missing portion rule for food: ${food.id}`);
  }
  return rule;
}

function desiredUnitsForTarget(food: FoodItem, target: MacroVector): number {
  if (food.role === 'starch' && food.carbsPerUnit > 0) return target.carbs / food.carbsPerUnit;
  if (food.role === 'fat' && food.fatPerUnit > 0) return target.fat / food.fatPerUnit;
  if (food.role === 'protein' && food.proteinPerUnit > 0) return target.protein / food.proteinPerUnit;
  if (food.role === 'dairy' && food.proteinPerUnit > 0) return target.protein / food.proteinPerUnit;
  if (food.role === 'fruit' && food.carbsPerUnit > 0) return target.carbs / food.carbsPerUnit;
  return portionRuleFor(food).typicalUnits;
}

function portionCandidates(food: FoodItem, target?: MacroVector): number[] {
  const rule = portionRuleFor(food);
  if (!target) return range(rule.minUnits, rule.softMaxUnits, rule.step);

  const desiredUnits = desiredUnitsForTarget(food, target);
  // Search slightly past the desired amount when necessary, but never relax
  // the hard ceiling. High-energy users are handled by distributing food
  // across the day, not by turning one serving into an extreme portion.
  const adaptiveMax = Math.min(
    rule.hardMaxUnits,
    Math.max(rule.softMaxUnits, desiredUnits * 1.15)
  );
  const snappedMax = Math.max(
    rule.minUnits,
    Math.floor((adaptiveMax + 1e-9) / rule.step) * rule.step
  );
  return range(rule.minUnits, snappedMax, rule.step);
}

function portionRealismPenalty(food: FoodItem, units: number): number {
  const rule = portionRuleFor(food);
  if (units > rule.hardMaxUnits + 1e-9) return Number.POSITIVE_INFINITY;

  const typicalDistance = Math.abs(units - rule.typicalUnits) / Math.max(rule.typicalUnits, rule.step);
  const overSoft = Math.max(0, units - rule.softMaxUnits) / Math.max(rule.hardMaxUnits - rule.softMaxUnits, rule.step);

  // Staying near a typical serving is a small preference; crossing Soft Max
  // is a much stronger signal. Hard Max is enforced separately and absolutely.
  return 0.015 * typicalDistance * typicalDistance + 0.35 * overSoft * overSoft;
}

function mealMassLimitGrams(slot: MealSlot, slotKcalTarget: number): number {
  const base: Record<MealSlot, number> = {
    breakfast: 650,
    morning_snack: 425,
    lunch: 900,
    afternoon_snack: 500,
    dinner: 800,
    night_snack: 350,
  };

  // For unusually high-energy plans allow some extra total meal volume, while
  // individual-food hard limits remain unchanged. The upper bound keeps a
  // single meal from drifting toward kilogram-plus portions.
  const extra = Math.max(0, slotKcalTarget - 800) * 0.35;
  return Math.min(base[slot] + extra, slot === 'lunch' ? 1050 : slot === 'dinner' ? 950 : base[slot] + 150);
}

function mealMassGrams(components: MealComponent[]): number {
  return components.reduce((sum, component) => sum + component.grams, 0);
}

function mealRealismPenalty(components: MealComponent[]): number {
  return components.reduce(
    (sum, component) => sum + portionRealismPenalty(component.foodItem, component.units),
    0
  );
}

function normalizedDeviation(actual: number, target: number): number {
  return Math.abs(actual - target) / Math.max(1, target);
}

/**
 * Energy gets the strongest weight. Macro targets guide composition, but an
 * individual meal is never allowed to chase protein/carbs by blowing through
 * its calorie budget. A sharp overshoot penalty begins above +5%.
 */
function scoreTotals(actual: MacroVector, target: MacroVector): number {
  const kcalDev = normalizedDeviation(actual.kcal, target.kcal);
  const proteinDev = normalizedDeviation(actual.protein, target.protein);
  const carbDev = normalizedDeviation(actual.carbs, target.carbs);
  const fatDev = normalizedDeviation(actual.fat, target.fat);

  const kcalOverRatio = Math.max(0, actual.kcal / Math.max(1, target.kcal) - 1);
  const severeOver = Math.max(0, kcalOverRatio - 0.05);
  const proteinUnder = Math.max(0, target.protein - actual.protein) / Math.max(1, target.protein);

  return (
    7 * kcalDev +
    3.5 * proteinDev +
    1.1 * carbDev +
    1.1 * fatDev +
    20 * kcalOverRatio * kcalOverRatio +
    60 * severeOver * severeOver +
    0.75 * proteinUnder
  );
}

function resolveTemplate(template: MealTemplate, slotTargets: MacroVector): ResolvedTemplate {
  const foods = template.slots.map((slotFill) => foodById(slotFill.primaryFoodItemId));
  const candidateSets = foods.map((food) => portionCandidates(food, slotTargets));

  type Bounds = { min: MacroVector; max: MacroVector };
  const remainingBounds: Bounds[] = Array.from({ length: foods.length + 1 }, () => ({
    min: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    max: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  }));

  // For each suffix, compute the independent min/max contribution still
  // available. This lets the beam keep states that can still reach the target
  // instead of greedily preferring whichever food appears first.
  for (let i = foods.length - 1; i >= 0; i--) {
    const components = candidateSets[i].map((units) => componentFromUnits(foods[i], units));
    const minComp: MacroVector = {
      kcal: Math.min(...components.map((c) => c.kcal)),
      protein: Math.min(...components.map((c) => c.protein)),
      carbs: Math.min(...components.map((c) => c.carbs)),
      fat: Math.min(...components.map((c) => c.fat)),
    };
    const maxComp: MacroVector = {
      kcal: Math.max(...components.map((c) => c.kcal)),
      protein: Math.max(...components.map((c) => c.protein)),
      carbs: Math.max(...components.map((c) => c.carbs)),
      fat: Math.max(...components.map((c) => c.fat)),
    };
    remainingBounds[i] = {
      min: {
        kcal: minComp.kcal + remainingBounds[i + 1].min.kcal,
        protein: minComp.protein + remainingBounds[i + 1].min.protein,
        carbs: minComp.carbs + remainingBounds[i + 1].min.carbs,
        fat: minComp.fat + remainingBounds[i + 1].min.fat,
      },
      max: {
        kcal: maxComp.kcal + remainingBounds[i + 1].max.kcal,
        protein: maxComp.protein + remainingBounds[i + 1].max.protein,
        carbs: maxComp.carbs + remainingBounds[i + 1].max.carbs,
        fat: maxComp.fat + remainingBounds[i + 1].max.fat,
      },
    };
  }

  const boundDeviation = (current: number, minRemaining: number, maxRemaining: number, target: number) => {
    const minPossible = current + minRemaining;
    const maxPossible = current + maxRemaining;
    if (target < minPossible) return (minPossible - target) / Math.max(1, target);
    if (target > maxPossible) return (target - maxPossible) / Math.max(1, target);
    return 0;
  };

  const lowerBoundScore = (totals: MacroVector, remaining: Bounds): number => {
    const kcalDev = boundDeviation(totals.kcal, remaining.min.kcal, remaining.max.kcal, slotTargets.kcal);
    const proteinDev = boundDeviation(totals.protein, remaining.min.protein, remaining.max.protein, slotTargets.protein);
    const carbDev = boundDeviation(totals.carbs, remaining.min.carbs, remaining.max.carbs, slotTargets.carbs);
    const fatDev = boundDeviation(totals.fat, remaining.min.fat, remaining.max.fat, slotTargets.fat);
    const alreadyOver = Math.max(0, totals.kcal / Math.max(1, slotTargets.kcal) - 1.05);
    return 7 * kcalDev + 3.5 * proteinDev + 1.1 * carbDev + 1.1 * fatDev + 50 * alreadyOver * alreadyOver;
  };

  type BeamState = {
    components: MealComponent[];
    totals: MacroVector;
    grams: number;
    realismPenalty: number;
  };
  const BEAM_WIDTH = 120;
  const hardMealMass = mealMassLimitGrams(template.slot, slotTargets.kcal);
  let beam: BeamState[] = [{
    components: [],
    totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    grams: 0,
    realismPenalty: 0,
  }];

  for (let index = 0; index < foods.length; index++) {
    const food = foods[index];
    const expanded: BeamState[] = [];

    for (const state of beam) {
      for (const units of candidateSets[index]) {
        const component = componentFromUnits(food, units);
        const totals = addTotals(state.totals, component);
        const grams = state.grams + component.grams;

        // Remaining components only add calories and mass; branches already far
        // above either hard boundary cannot recover.
        if (totals.kcal > slotTargets.kcal * 1.35 && index < foods.length - 1) continue;
        if (grams > hardMealMass) continue;

        expanded.push({
          components: [...state.components, component],
          totals,
          grams,
          realismPenalty: state.realismPenalty + portionRealismPenalty(food, units),
        });
      }
    }

    const remaining = remainingBounds[index + 1];
    expanded.sort((a, b) =>
      (lowerBoundScore(a.totals, remaining) + a.realismPenalty) -
      (lowerBoundScore(b.totals, remaining) + b.realismPenalty)
    );
    beam = expanded.slice(0, BEAM_WIDTH);
  }

  if (beam.length === 0) {
    throw new Error(`[mealPlanEngine] Could not resolve template ${template.id}`);
  }

  beam.sort((a, b) => {
    const aOver = a.totals.kcal > slotTargets.kcal * 1.05 ? 1 : 0;
    const bOver = b.totals.kcal > slotTargets.kcal * 1.05 ? 1 : 0;
    if (aOver !== bOver) return aOver - bOver;
    return (scoreTotals(a.totals, slotTargets) + a.realismPenalty) -
      (scoreTotals(b.totals, slotTargets) + b.realismPenalty);
  });

  const best = beam[0];
  const bestScore = scoreTotals(best.totals, slotTargets) + best.realismPenalty;

  return {
    components: best.components,
    totals: {
      kcal: Math.round(best.totals.kcal),
      protein: round1(best.totals.protein),
      carbs: round1(best.totals.carbs),
      fat: round1(best.totals.fat),
    },
    score: bestScore,
    kcalDeviation: normalizedDeviation(best.totals.kcal, slotTargets.kcal),
  };
}

// ============================================================================
// 7 - DETERMINISTIC VARIETY
// ============================================================================

function dateSeed(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

type ResolvedOption = {
  slot: MealSlot;
  template: MealTemplate;
  resolved: ResolvedTemplate;
};

function getResolvedOptions(
  slot: MealSlot,
  candidates: MealTemplate[],
  slotTargets: MacroVector
): ResolvedOption[] {
  const ranked = candidates
    .map((template) => ({ slot, template, resolved: resolveTemplate(template, slotTargets) }))
    .sort((a, b) => a.resolved.score - b.resolved.score);

  if (ranked.length === 0) {
    throw new Error('[mealPlanEngine] No candidate templates to rank.');
  }

  // Keep every eligible template in the day-level frontier. Some options are
  // intentionally a poor fit for the slot in isolation (for example a lean
  // protein night snack), but can be exactly what the whole day needs after
  // global portion refinement. With the current catalog this is at most five
  // options per slot, so the search remains bounded.
  return ranked;
}

function buildMeal(option: ResolvedOption): Meal {
  const { slot, template, resolved } = option;
  return {
    slot,
    label: MEAL_SLOT_LABELS[slot],
    templateId: template.id,
    templateName: template.displayName,
    components: resolved.components,
    totalKcal: resolved.totals.kcal,
    totalProtein: resolved.totals.protein,
    totalCarbs: resolved.totals.carbs,
    totalFat: resolved.totals.fat,
    totalFiber: round1(resolved.components.reduce((sum, component) => sum + component.fiber, 0)),
    consumed: false,
  };
}

function scoreDailyTotals(actual: MacroVector, target: MacroVector): number {
  const kcalDev = normalizedDeviation(actual.kcal, target.kcal);
  const proteinDev = normalizedDeviation(actual.protein, target.protein);
  const carbDev = normalizedDeviation(actual.carbs, target.carbs);
  const fatDev = normalizedDeviation(actual.fat, target.fat);
  const kcalOverRatio = Math.max(0, actual.kcal / Math.max(1, target.kcal) - 1);
  const severeOver = Math.max(0, kcalOverRatio - 0.03);
  const proteinUnder = Math.max(0, target.protein - actual.protein) / Math.max(1, target.protein);

  return (
    8.5 * kcalDev +
    6 * proteinDev +
    4 * carbDev +
    3 * fatDev +
    24 * kcalOverRatio * kcalOverRatio +
    80 * severeOver * severeOver +
    1.5 * proteinUnder
  );
}

function chooseDailyCombination(
  optionsBySlot: ResolvedOption[][],
  targets: MacroTargets,
  seed: number
): ResolvedOption[] {
  const dailyTarget: MacroVector = {
    kcal: targets.targetCalories,
    protein: targets.proteinGrams,
    carbs: targets.carbGrams,
    fat: targets.fatGrams,
  };

  type Bounds = { min: MacroVector; max: MacroVector };
  const suffixBounds: Bounds[] = Array.from({ length: optionsBySlot.length + 1 }, () => ({
    min: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    max: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  }));

  for (let index = optionsBySlot.length - 1; index >= 0; index--) {
    const options = optionsBySlot[index];
    const min: MacroVector = {
      kcal: Math.min(...options.map((o) => o.resolved.totals.kcal)),
      protein: Math.min(...options.map((o) => o.resolved.totals.protein)),
      carbs: Math.min(...options.map((o) => o.resolved.totals.carbs)),
      fat: Math.min(...options.map((o) => o.resolved.totals.fat)),
    };
    const max: MacroVector = {
      kcal: Math.max(...options.map((o) => o.resolved.totals.kcal)),
      protein: Math.max(...options.map((o) => o.resolved.totals.protein)),
      carbs: Math.max(...options.map((o) => o.resolved.totals.carbs)),
      fat: Math.max(...options.map((o) => o.resolved.totals.fat)),
    };
    suffixBounds[index] = {
      min: addVector(min, suffixBounds[index + 1].min),
      max: addVector(max, suffixBounds[index + 1].max),
    };
  }

  const boundDeviation = (current: number, remaining: { min: number; max: number }, target: number) => {
    const minPossible = current + remaining.min;
    const maxPossible = current + remaining.max;
    if (target < minPossible) return (minPossible - target) / Math.max(1, target);
    if (target > maxPossible) return (target - maxPossible) / Math.max(1, target);
    return 0;
  };

  const lowerBoundDailyScore = (totals: MacroVector, remaining: Bounds) => {
    const kcalDev = boundDeviation(totals.kcal, { min: remaining.min.kcal, max: remaining.max.kcal }, dailyTarget.kcal);
    const proteinDev = boundDeviation(totals.protein, { min: remaining.min.protein, max: remaining.max.protein }, dailyTarget.protein);
    const carbDev = boundDeviation(totals.carbs, { min: remaining.min.carbs, max: remaining.max.carbs }, dailyTarget.carbs);
    const fatDev = boundDeviation(totals.fat, { min: remaining.min.fat, max: remaining.max.fat }, dailyTarget.fat);
    const alreadyOver = Math.max(0, totals.kcal / Math.max(1, dailyTarget.kcal) - 1.03);
    return 8.5 * kcalDev + 6 * proteinDev + 4 * carbDev + 3 * fatDev + 80 * alreadyOver * alreadyOver;
  };

  type CandidateDay = {
    options: ResolvedOption[];
    totals: MacroVector;
    localScoreSum: number;
  };

  const DAY_BEAM_WIDTH = 400;
  let beam: CandidateDay[] = [{
    options: [],
    totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    localScoreSum: 0,
  }];

  for (let slotIndex = 0; slotIndex < optionsBySlot.length; slotIndex++) {
    const expanded: CandidateDay[] = [];
    for (const state of beam) {
      for (const option of optionsBySlot[slotIndex]) {
        expanded.push({
          options: [...state.options, option],
          totals: addVector(state.totals, option.resolved.totals),
          localScoreSum: state.localScoreSum + option.resolved.score,
        });
      }
    }

    const remaining = suffixBounds[slotIndex + 1];
    expanded.sort((a, b) =>
      (lowerBoundDailyScore(a.totals, remaining) + 0.02 * a.localScoreSum) -
      (lowerBoundDailyScore(b.totals, remaining) + 0.02 * b.localScoreSum)
    );
    beam = expanded.slice(0, DAY_BEAM_WIDTH);
  }

  const completed = beam
    .map((candidate) => ({
      ...candidate,
      score: scoreDailyTotals(candidate.totals, dailyTarget) + 0.02 * candidate.localScoreSum,
    }))
    .sort((a, b) => a.score - b.score);

  const best = completed[0];
  if (!best) throw new Error('[mealPlanEngine] Could not build a daily combination.');

  const tied = completed.filter((candidate) =>
    Math.abs(candidate.score - best.score) < 0.005 &&
    candidate.totals.kcal <= dailyTarget.kcal * 1.03
  );

  return (tied.length > 0 ? tied[seed % tied.length] : best).options;
}

function subtractComponent(total: MacroVector, component: MealComponent): MacroVector {
  return {
    kcal: total.kcal - component.kcal,
    protein: total.protein - component.protein,
    carbs: total.carbs - component.carbs,
    fat: total.fat - component.fat,
  };
}

function addVector(a: MacroVector, b: MacroVector): MacroVector {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

/**
 * Second-stage day-wide portion refinement.
 *
 * The template resolver optimizes each meal against its own slot budget. That is
 * necessary for meal quality, but small per-slot rounding/food-composition errors
 * can stack in the same direction over six meals. This pass keeps the selected
 * foods/templates fixed and only nudges legal portion sizes to improve the whole
 * day's calorie + macro fit.
 */
function refineDailyPortions(
  chosen: ResolvedOption[],
  targets: MacroTargets
): ResolvedOption[] {
  const dailyTarget: MacroVector = {
    kcal: targets.targetCalories,
    protein: targets.proteinGrams,
    carbs: targets.carbGrams,
    fat: targets.fatGrams,
  };

  const refined = chosen.map((option) => ({
    ...option,
    resolved: {
      ...option.resolved,
      components: option.resolved.components.map((component) => ({ ...component })),
      totals: { ...option.resolved.totals },
    },
  }));

  let dailyTotals = refined.reduce<MacroVector>(
    (acc, option) => addVector(acc, option.resolved.totals),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const combinedScore = (
    candidateDaily: MacroVector,
    candidateMeal: MacroVector,
    slotTarget: MacroVector,
    components: MealComponent[],
    slot: MealSlot
  ) => {
    const kcalRatio = candidateMeal.kcal / Math.max(1, slotTarget.kcal);
    if (kcalRatio < 0.55 || kcalRatio > 1.35) return Number.POSITIVE_INFINITY;
    if (mealMassGrams(components) > mealMassLimitGrams(slot, slotTarget.kcal)) {
      return Number.POSITIVE_INFINITY;
    }
    return (
      scoreDailyTotals(candidateDaily, dailyTarget) +
      0.035 * scoreTotals(candidateMeal, slotTarget) +
      0.05 * mealRealismPenalty(components)
    );
  };

  // Coordinate descent is deterministic and cheap here: ~20 components × a
  // small candidate list × four passes. Stop early when a full pass is stable.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;

    for (const option of refined) {
      const share = SLOT_DISTRIBUTION[option.slot];
      const slotTarget: MacroVector = {
        kcal: dailyTarget.kcal * share.kcal,
        protein: dailyTarget.protein * share.protein,
        carbs: dailyTarget.carbs * share.carbs,
        fat: dailyTarget.fat * share.fat,
      };

      for (let index = 0; index < option.resolved.components.length; index++) {
        const current = option.resolved.components[index];
        const withoutCurrentMeal = subtractComponent(option.resolved.totals, current);
        const withoutCurrentDay = subtractComponent(dailyTotals, current);

        let bestComponent = current;
        let bestMeal = option.resolved.totals;
        let bestDay = dailyTotals;
        let bestScore = combinedScore(
          dailyTotals,
          option.resolved.totals,
          slotTarget,
          option.resolved.components,
          option.slot
        );

        for (const units of portionCandidates(current.foodItem, slotTarget)) {
          const candidateComponent = componentFromUnits(current.foodItem, units);
          const candidateMeal = addTotals(withoutCurrentMeal, candidateComponent);
          const candidateDay = addTotals(withoutCurrentDay, candidateComponent);
          const candidateComponents = option.resolved.components.map((component, candidateIndex) =>
            candidateIndex === index ? candidateComponent : component
          );
          const candidateScore = combinedScore(
            candidateDay,
            candidateMeal,
            slotTarget,
            candidateComponents,
            option.slot
          );

          if (candidateScore + 1e-9 < bestScore) {
            bestScore = candidateScore;
            bestComponent = candidateComponent;
            bestMeal = candidateMeal;
            bestDay = candidateDay;
          }
        }

        if (bestComponent.units !== current.units) {
          option.resolved.components[index] = bestComponent;
          option.resolved.totals = bestMeal;
          dailyTotals = bestDay;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  for (const option of refined) {
    option.resolved.totals = {
      kcal: Math.round(option.resolved.totals.kcal),
      protein: round1(option.resolved.totals.protein),
      carbs: round1(option.resolved.totals.carbs),
      fat: round1(option.resolved.totals.fat),
    };
  }

  return refined;
}

function totalResolvedOptions(options: ResolvedOption[]): MacroVector {
  return options.reduce<MacroVector>(
    (acc, option) => addVector(acc, option.resolved.totals),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function scoreResolvedDay(options: ResolvedOption[], dailyTarget: MacroVector): number {
  const nutritionScore = scoreDailyTotals(totalResolvedOptions(options), dailyTarget);
  const realismScore = options.reduce(
    (sum, option) => sum + mealRealismPenalty(option.resolved.components),
    0
  );
  return nutritionScore + 0.05 * realismScore;
}

/**
 * Coordinate descent can perfect portions inside a chosen template set, but it
 * cannot replace a structurally carb-heavy snack with a protein/fat-heavier one.
 * This deterministic local search tries one template replacement per slot and
 * re-runs portion refinement, keeping a replacement only when the whole day's
 * macro score improves.
 */
function refineDailyTemplates(
  initial: ResolvedOption[],
  optionsBySlot: ResolvedOption[][],
  targets: MacroTargets
): ResolvedOption[] {
  const dailyTarget: MacroVector = {
    kcal: targets.targetCalories,
    protein: targets.proteinGrams,
    carbs: targets.carbGrams,
    fat: targets.fatGrams,
  };

  let best = refineDailyPortions(initial, targets);
  let bestScore = scoreResolvedDay(best, dailyTarget);

  for (let pass = 0; pass < 2; pass++) {
    let changed = false;

    for (let slotIndex = 0; slotIndex < optionsBySlot.length; slotIndex++) {
      let slotBest = best;
      let slotBestScore = bestScore;

      for (const replacement of optionsBySlot[slotIndex]) {
        if (replacement.template.id === best[slotIndex].template.id) continue;
        const candidateBase = best.map((option, index) =>
          index === slotIndex ? replacement : option
        );
        const candidate = refineDailyPortions(candidateBase, targets);
        const candidateScore = scoreResolvedDay(candidate, dailyTarget);

        if (candidateScore + 1e-9 < slotBestScore) {
          slotBest = candidate;
          slotBestScore = candidateScore;
        }
      }

      if (slotBest !== best) {
        best = slotBest;
        bestScore = slotBestScore;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return best;
}


function resolvedComponents(options: ResolvedOption[]): MealComponent[] {
  return options.flatMap((option) => option.resolved.components);
}

function qualityPenaltyForResolvedDay(options: ResolvedOption[], targets: MacroTargets): number {
  return foodQualityPenalty(
    evaluateFoodQualityFromComponents(resolvedComponents(options), targets.targetCalories)
  );
}

function dailyDeviationSummary(options: ResolvedOption[], targets: MacroTargets) {
  const actual = totalResolvedOptions(options);
  return {
    actual,
    kcalSigned: (actual.kcal - targets.targetCalories) / Math.max(1, targets.targetCalories),
    protein: normalizedDeviation(actual.protein, targets.proteinGrams),
    carbs: normalizedDeviation(actual.carbs, targets.carbGrams),
    fat: normalizedDeviation(actual.fat, targets.fatGrams),
  };
}

function isDailyPlanFeasible(options: ResolvedOption[], targets: MacroTargets): boolean {
  const deviation = dailyDeviationSummary(options, targets);
  const macrosVeryClose =
    deviation.protein <= 0.03 &&
    deviation.carbs <= 0.03 &&
    deviation.fat <= 0.03;
  const minimumCalorieDeviation = macrosVeryClose ? -0.06 : -0.05;

  return (
    deviation.kcalSigned <= 0.03 &&
    deviation.kcalSigned >= minimumCalorieDeviation &&
    deviation.protein <= 0.10 &&
    deviation.carbs <= 0.10 &&
    deviation.fat <= 0.10
  );
}

/**
 * Secondary food-quality repair pass.
 *
 * Nutrition v2 remains authoritative. We only accept a higher-fiber / higher-
 * quality template choice when the existing calorie/macro feasibility gates
 * still pass and the nutrition score does not materially deteriorate.
 */
function repairDailyQuality(
  initial: ResolvedOption[],
  optionsBySlot: ResolvedOption[][],
  targets: MacroTargets
): ResolvedOption[] {
  const dailyTarget: MacroVector = {
    kcal: targets.targetCalories,
    protein: targets.proteinGrams,
    carbs: targets.carbGrams,
    fat: targets.fatGrams,
  };

  let best = initial;
  let bestQualityPenalty = qualityPenaltyForResolvedDay(best, targets);
  let bestNutritionScore = scoreDailyTotals(totalResolvedOptions(best), dailyTarget);

  for (let pass = 0; pass < 2; pass++) {
    let changed = false;

    for (let slotIndex = 0; slotIndex < optionsBySlot.length; slotIndex++) {
      let slotBest = best;
      let slotBestQuality = bestQualityPenalty;
      let slotBestNutrition = bestNutritionScore;

      for (const replacement of optionsBySlot[slotIndex]) {
        if (replacement.template.id === best[slotIndex].template.id) continue;

        const candidateBase = best.map((option, index) =>
          index === slotIndex ? replacement : option
        );
        const candidate = refineDailyPortions(candidateBase, targets);
        if (!isDailyPlanFeasible(candidate, targets)) continue;

        const candidateQuality = qualityPenaltyForResolvedDay(candidate, targets);
        if (candidateQuality >= slotBestQuality - 0.015) continue;

        const candidateNutrition = scoreDailyTotals(totalResolvedOptions(candidate), dailyTarget);
        // Quality is secondary: do not trade a meaningfully better macro fit
        // for a cosmetic quality gain. Small rounding-level changes are fine.
        const allowedNutritionScore = Math.max(slotBestNutrition + 0.08, slotBestNutrition * 1.20);
        if (candidateNutrition > allowedNutritionScore) continue;

        slotBest = candidate;
        slotBestQuality = candidateQuality;
        slotBestNutrition = candidateNutrition;
      }

      if (slotBest !== best) {
        best = slotBest;
        bestQualityPenalty = slotBestQuality;
        bestNutritionScore = slotBestNutrition;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return best;
}

function assertDailyPlanFeasible(options: ResolvedOption[], targets: MacroTargets): void {
  if (isDailyPlanFeasible(options, targets)) return;
  const actual = totalResolvedOptions(options);
  const target: MacroVector = {
    kcal: targets.targetCalories,
    protein: targets.proteinGrams,
    carbs: targets.carbGrams,
    fat: targets.fatGrams,
  };
  throw new MealPlanFeasibilityError(target, actual);
}

// ============================================================================
// 8 - MAIN ENTRY POINT
// ============================================================================

export function generateDailyMealPlan(
  targets: MacroTargets,
  _weightKg: number,
  preferences: DietaryPreferencesJson,
  isWorkoutDay: boolean,
  date: string = new Date().toISOString().slice(0, 10)
): DailyMealPlan {
  const seed = dateSeed(date);

  const optionsBySlot: ResolvedOption[][] = SLOT_ORDER.map((slot) => {
    const share = SLOT_DISTRIBUTION[slot];
    const slotTargets: MacroVector = {
      kcal: targets.targetCalories * share.kcal,
      protein: targets.proteinGrams * share.protein,
      carbs: targets.carbGrams * share.carbs,
      fat: targets.fatGrams * share.fat,
    };

    const eligible = requireNutritionCatalog().mealTemplates.filter(
      (template) => template.slot === slot && isTemplateEligible(template, preferences, isWorkoutDay)
    );

    if (eligible.length === 0) {
      throw new MealPlanGenerationError(
        slot,
        `هیچ ترکیب غذایی امنی برای ${MEAL_SLOT_LABELS[slot]} با محدودیت‌های انتخاب‌شده پیدا نشد.`
      );
    }

    return getResolvedOptions(slot, eligible, slotTargets);
  });

  const chosen = chooseDailyCombination(optionsBySlot, targets, seed);
  const macroRefined = refineDailyTemplates(chosen, optionsBySlot, targets);
  const refined = repairDailyQuality(macroRefined, optionsBySlot, targets);
  assertDailyPlanFeasible(refined, targets);
  const meals = refined.map(buildMeal);

  return { date, isWorkoutDay, targets, meals };
}

// ============================================================================
// 9 - SWAPS
// ============================================================================

export function getSwapCandidatesForComponent(
  component: MealComponent,
  preferences: DietaryPreferencesJson
): FoodItem[] {
  return getSubstitutesFor(component.foodItem.id).filter((food) => isFoodAllowed(food, preferences));
}

function allRealisticPortionCandidates(food: FoodItem): number[] {
  const rule = portionRuleFor(food);
  return range(rule.minUnits, rule.hardMaxUnits, rule.step);
}

function signedDeviation(actual: number, target: number): number {
  return (actual - target) / Math.max(1, target);
}

function swapEquivalenceScore(original: MealComponent, candidate: MealComponent): number {
  const role = original.foodItem.role;
  const kcalDev = Math.abs(signedDeviation(candidate.kcal, original.kcal));
  const proteinDev = Math.abs(candidate.protein - original.protein) / Math.max(5, original.protein);
  const carbDev = Math.abs(candidate.carbs - original.carbs) / Math.max(10, original.carbs);
  const fatDev = Math.abs(candidate.fat - original.fat) / Math.max(5, original.fat);

  if (role === 'protein') return 6 * proteinDev + 2.5 * kcalDev + 1.2 * fatDev + 0.4 * carbDev;
  if (role === 'starch') return 6 * carbDev + 2.5 * kcalDev + 0.6 * proteinDev + 0.5 * fatDev;
  if (role === 'fat') return 6 * fatDev + 2.5 * kcalDev + 0.5 * proteinDev + 0.5 * carbDev;
  if (role === 'dairy') return 3.5 * proteinDev + 2.5 * kcalDev + 1.5 * carbDev + 1.2 * fatDev;
  if (role === 'fruit') return 5 * carbDev + 2.5 * kcalDev + 0.5 * proteinDev;
  return 3 * carbDev + 2.5 * kcalDev + proteinDev + fatDev;
}

function isMacroEquivalentSwap(original: MealComponent, candidate: MealComponent): boolean {
  const role = original.foodItem.role;
  const kcalDev = Math.abs(signedDeviation(candidate.kcal, original.kcal));
  const proteinDev = Math.abs(candidate.protein - original.protein) / Math.max(5, original.protein);
  const carbDev = Math.abs(candidate.carbs - original.carbs) / Math.max(10, original.carbs);
  const fatDev = Math.abs(candidate.fat - original.fat) / Math.max(5, original.fat);
  const fatDeltaGrams = Math.abs(candidate.fat - original.fat);
  const sameSwapGroup = original.foodItem.swapGroup === candidate.foodItem.swapGroup;

  // The role-defining macro is the hard invariant. Calories are a second
  // invariant so a lean protein cannot silently become a calorie/fat bomb.
  if (role === 'protein') {
    return proteinDev <= 0.12 && kcalDev <= 0.35 && fatDeltaGrams <= 8;
  }
  if (role === 'starch') {
    // Bread-to-bread swaps are allowed a slightly wider carb tolerance because
    // countable slices are discrete. Example: 50 g Sangak -> 2 whole-grain
    // toast slices keeps calories close but cannot land on an exact carb gram.
    return sameSwapGroup
      ? carbDev <= 0.20 && kcalDev <= 0.15
      : carbDev <= 0.12 && kcalDev <= 0.25;
  }
  if (role === 'fat') {
    return fatDev <= 0.15 && kcalDev <= 0.25;
  }
  if (role === 'dairy') {
    return proteinDev <= 0.20 && kcalDev <= 0.35 && carbDev <= 0.30 && fatDeltaGrams <= 5;
  }
  if (role === 'fruit') {
    return carbDev <= 0.15 && kcalDev <= 0.25;
  }
  return carbDev <= 0.35 && kcalDev <= 0.40;
}

function swapFailureReason(original: MealComponent, candidate: MealComponent): string {
  const role = original.foodItem.role;
  if (role === 'protein') {
    const proteinDev = Math.abs(candidate.protein - original.protein) / Math.max(5, original.protein);
    const kcalDev = Math.abs(signedDeviation(candidate.kcal, original.kcal));
    const fatDelta = candidate.fat - original.fat;
    if (proteinDev > 0.12) return 'با مقدار واقع‌بینانه، پروتئین معادل این ماده تأمین نمی‌شود.';
    if (fatDelta > 8) return 'برای پروتئین مشابه، چربی این جایگزین بیش از حد افزایش می‌یابد.';
    if (kcalDev > 0.35) return 'برای مقدار معادل، اختلاف کالری این جایگزین بیش از حد است.';
  }
  return 'این ماده در محدودهٔ مصرف واقع‌بینانه، معادل ماکرویی مستقیم مناسبی نیست.';
}

function mealWithReplacement(meal: Meal, componentIndex: number, replacement: MealComponent): Meal {
  const components = meal.components.map((component, index) =>
    index === componentIndex ? replacement : component
  );
  const totals = components.reduce<MacroVector>(
    (acc, component) => addTotals(acc, component),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  return {
    ...meal,
    components,
    totalKcal: Math.round(totals.kcal),
    totalProtein: round1(totals.protein),
    totalCarbs: round1(totals.carbs),
    totalFat: round1(totals.fat),
    totalFiber: round1(components.reduce((sum, component) => sum + component.fiber, 0)),
  };
}

function isSwapAllowedForMeal(food: FoodItem, slot: MealSlot): boolean {
  return food.swapAllowedMeals.includes(slot);
}

function swapContextPenalty(original: FoodItem, replacement: FoodItem): number {
  const groupPenalty = original.swapGroup === replacement.swapGroup ? 0 : 0.75;
  // Priority is deliberately a small tie-breaker. Macro safety always dominates.
  return groupPenalty + replacement.swapPriority * 0.001;
}

function buildSwapOption(meal: Meal, componentIndex: number, replacement: FoodItem): FoodSwapOption {
  const original = meal.components[componentIndex];
  let bestComponent = componentFromUnits(replacement, portionRuleFor(replacement).minUnits);
  let bestScore = Number.POSITIVE_INFINITY;

  for (const units of allRealisticPortionCandidates(replacement)) {
    const candidate = componentFromUnits(replacement, units);
    const score =
      swapEquivalenceScore(original, candidate) +
      0.05 * portionRealismPenalty(replacement, units) +
      swapContextPenalty(original.foodItem, replacement);
    if (score < bestScore) {
      bestScore = score;
      bestComponent = candidate;
    }
  }

  const isEquivalent = isMacroEquivalentSwap(original, bestComponent);
  return {
    foodItem: replacement,
    replacementComponent: bestComponent,
    updatedMeal: mealWithReplacement(meal, componentIndex, bestComponent),
    isEquivalent,
    reason: isEquivalent ? undefined : swapFailureReason(original, bestComponent),
    score: bestScore,
    kcalDeviationPct: signedDeviation(bestComponent.kcal, original.kcal) * 100,
    proteinDeviationPct: signedDeviation(bestComponent.protein, original.protein) * 100,
    carbDeviationPct: signedDeviation(bestComponent.carbs, original.carbs) * 100,
    fatDeviationPct: signedDeviation(bestComponent.fat, original.fat) * 100,
  };
}

/**
 * Returns pre-calculated swap options for one component. A swap is applied only
 * when the replacement is appropriate for the current meal context AND can
 * preserve the original component's defining macro/calories within explicit
 * tolerances. Other foods in the meal are intentionally NOT changed behind
 * the user's back.
 */
export function getSwapOptionsForMeal(
  meal: Meal,
  componentIndex: number,
  preferences: DietaryPreferencesJson
): FoodSwapOption[] {
  if (componentIndex < 0 || componentIndex >= meal.components.length) return [];
  const current = meal.components[componentIndex];
  return getSubstitutesFor(current.foodItem.id)
    .filter((food) => food.role === current.foodItem.role)
    .filter((food) => isFoodAllowed(food, preferences))
    .filter((food) => isSwapAllowedForMeal(food, meal.slot))
    .map((food) => buildSwapOption(meal, componentIndex, food))
    .sort((a, b) => Number(b.isEquivalent) - Number(a.isEquivalent) || a.score - b.score);
}

/** Backwards-compatible safe wrapper used by older call sites/tests. */
export function swapComponentInMeal(
  meal: Meal,
  componentIndex: number,
  replacement: FoodItem,
  _slotTargets: MacroVector
): Meal {
  if (componentIndex < 0 || componentIndex >= meal.components.length) return meal;
  const option = buildSwapOption(meal, componentIndex, replacement);
  return option.isEquivalent ? option.updatedMeal : meal;
}

export function getSlotTargets(slot: MealSlot, targets: MacroTargets): MacroVector {
  const share = SLOT_DISTRIBUTION[slot];
  return {
    kcal: targets.targetCalories * share.kcal,
    protein: targets.proteinGrams * share.protein,
    carbs: targets.carbGrams * share.carbs,
    fat: targets.fatGrams * share.fat,
  };
}
