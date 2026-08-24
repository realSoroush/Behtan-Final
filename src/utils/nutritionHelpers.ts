/**
 * nutritionHelpers.ts
 * -----------------------------------------------------------------------------
 * Pure, deterministic nutrition math. No AI, network calls, or randomness.
 *
 * Design rules:
 * 1) Core calorie math must not depend on an unverified visual body-fat estimate.
 * 2) Protein must remain feasible inside the calorie budget.
 * 3) Returned gram values and returned macro calories must agree with each other.
 * 4) Invalid numeric inputs fail early instead of producing plausible-looking junk.
 * -----------------------------------------------------------------------------
 */

import type {
  ActivityLevel,
  Gender,
  Goal,
  MacroTargets,
  WeightLossSpeed,
} from '@/types';

// ============================================================================
// CONSTANTS
// ============================================================================

const KCAL_PER_GRAM_PROTEIN = 4;
const KCAL_PER_GRAM_FAT = 9;
const KCAL_PER_GRAM_CARB = 4;

/**
 * Upper product guardrail for protein. The 35% calorie cap below is the primary
 * constraint; this absolute cap prevents very-high-calorie / very-high-weight
 * profiles from producing impractical consumer meal plans.
 */
const MAX_PROTEIN_GRAMS_PER_DAY = 220;
const MAX_PROTEIN_CALORIE_FRACTION = 0.35;
const FAT_CALORIE_FRACTION = 0.25;
const WORKOUT_DAY_CALORIE_BONUS = 150;

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`[nutritionHelpers] ${name} must be a finite positive number.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ============================================================================
// AGE
// ============================================================================

export const MIN_SUPPORTED_AGE = 18;
export const MAX_SUPPORTED_AGE = 70;

function parseIsoBirthDate(birthDateISO: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateISO);
  if (!match) {
    throw new Error('[nutritionHelpers] Invalid birth date.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birthDate = new Date(year, month - 1, day);

  // Date() normalizes impossible dates (for example 2026-02-31), so verify
  // each calendar component after construction instead of accepting normalization.
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    throw new Error('[nutritionHelpers] Invalid birth date.');
  }

  return birthDate;
}

/**
 * Calculates whole-number age in years from an ISO birth date string.
 * Behtan currently supports adults aged 18 through 70, inclusive.
 */
export function calculateAge(birthDateISO: string, referenceDate: Date = new Date()): number {
  const birthDate = parseIsoBirthDate(birthDateISO);
  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error('[nutritionHelpers] Invalid reference date.');
  }

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  const dayDiff = referenceDate.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  if (age < MIN_SUPPORTED_AGE || age > MAX_SUPPORTED_AGE) {
    throw new Error(
      `[nutritionHelpers] Calculated age must be between ${MIN_SUPPORTED_AGE} and ${MAX_SUPPORTED_AGE}.`
    );
  }

  return age;
}

/** Safe UI wrapper: invalid/unsupported birth dates return null instead of throwing. */
export function tryCalculateAge(
  birthDateISO: string,
  referenceDate: Date = new Date()
): number | null {
  try {
    return calculateAge(birthDateISO, referenceDate);
  } catch {
    return null;
  }
}

// ============================================================================
// BMR — Basal Metabolic Rate
// ============================================================================

export interface BmrInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  bodyFatPercentage?: number | null;
  /**
   * Opt-in only. A visual/AI body-fat estimate should not silently change the
   * calorie prescription. Set this to true only when the caller has a body-fat
   * value it intentionally considers suitable for Katch-McArdle.
   */
  useBodyFatFormula?: boolean;
}

/**
 * Calculates BMR (kcal/day).
 * - Default: Mifflin-St Jeor.
 * - Optional: Katch-McArdle only when useBodyFatFormula=true and body fat is valid.
 */
export function calculateBMR({
  weightKg,
  heightCm,
  age,
  gender,
  bodyFatPercentage,
  useBodyFatFormula = false,
}: BmrInput): number {
  assertFinitePositive(weightKg, 'weightKg');
  assertFinitePositive(heightCm, 'heightCm');
  assertFinitePositive(age, 'age');

  if (
    useBodyFatFormula &&
    bodyFatPercentage != null &&
    Number.isFinite(bodyFatPercentage) &&
    bodyFatPercentage > 2 &&
    bodyFatPercentage < 70
  ) {
    const leanBodyMass = weightKg * (1 - bodyFatPercentage / 100);
    return Math.round(370 + 21.6 * leanBodyMass);
  }

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === 'male' ? base + 5 : base - 161);
}

// ============================================================================
// TDEE — Total Daily Energy Expenditure
// ============================================================================

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderate: 1.55,
  active: 1.725,
};

/** Applies the activity multiplier to BMR to get maintenance calories. */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  assertFinitePositive(bmr, 'bmr');
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  if (!multiplier) {
    throw new Error(`[nutritionHelpers] Unsupported activity level: ${String(activityLevel)}`);
  }
  return Math.round(bmr * multiplier);
}

// ============================================================================
// TARGET CALORIES — TDEE + goal-based adjustment
// ============================================================================

export interface CalorieAdjustmentRule {
  /** Fraction of TDEE to deduct/add. */
  percentage: number;
  /** Hard ceiling for that adjustment in kcal/day. */
  maxAbsoluteKcal: number;
}

/**
 * Single source of truth for the three weight-loss speeds.
 * Step8Speed imports this object directly, so the copy shown to the user can
 * never silently drift away from the formula used by the nutrition engine.
 */
export const WEIGHT_LOSS_SPEED_POLICY: Readonly<Record<WeightLossSpeed, CalorieAdjustmentRule>> = {
  mild: { percentage: 0.10, maxAbsoluteKcal: 350 },
  standard: { percentage: 0.20, maxAbsoluteKcal: 600 },
  fast: { percentage: 0.25, maxAbsoluteKcal: 750 },
};

const CALORIE_ADJUSTMENT_RULES: Record<
  'weight_gain' | 'maintenance' | WeightLossSpeed,
  CalorieAdjustmentRule
> = {
  weight_gain: { percentage: 0.15, maxAbsoluteKcal: 500 },
  maintenance: { percentage: 0, maxAbsoluteKcal: 0 },
  ...WEIGHT_LOSS_SPEED_POLICY,
};

function resolveCalorieAdjustment(
  tdee: number,
  goal: Goal,
  weightLossSpeed?: WeightLossSpeed
): number {
  const ruleKey: 'weight_gain' | 'maintenance' | WeightLossSpeed =
    goal === 'weight_gain'
      ? 'weight_gain'
      : goal === 'maintenance'
        ? 'maintenance'
        : (weightLossSpeed ?? 'standard');

  const rule = CALORIE_ADJUSTMENT_RULES[ruleKey];
  const magnitude = Math.min(tdee * rule.percentage, rule.maxAbsoluteKcal);
  const sign = goal === 'weight_gain' ? 1 : goal === 'maintenance' ? 0 : -1;
  return sign * magnitude;
}

export function calculateTargetCalories(
  tdee: number,
  goal: Goal,
  weightLossSpeed?: WeightLossSpeed
): number {
  assertFinitePositive(tdee, 'tdee');

  const adjustment = resolveCalorieAdjustment(tdee, goal, weightLossSpeed);
  const target = tdee + adjustment;

  // Product-level emergency floor. Clinical plans below this threshold should
  // not be generated automatically by a general-purpose consumer app.
  return Math.max(1200, Math.round(target));
}

// ============================================================================
// MACROS
// ============================================================================

/**
 * Starting protein target (g/kg protein-reference weight) by goal. For BMI <30
 * the reference is actual body weight; for BMI >=30 the reference is adjusted
 * before these multipliers are applied.
 */
const PROTEIN_G_PER_KG_BY_GOAL: Record<Goal, number> = {
  weight_loss: 1.6,
  maintenance: 1.4,
  weight_gain: 1.6,
};

/**
 * Calculates a feasible macro budget.
 *
 * Protein:
 *   uses actual body weight below BMI 30, and an adjusted reference weight
 *   above BMI 30 so adipose mass cannot linearly inflate the protein target;
 *   then applies the 35%-of-calories and 220 g/day product guardrails.
 * Fat:
 *   ~25% of calories
 * Carbohydrate:
 *   exact remainder after rounded protein/fat grams
 *
 * The returned macro calorie fields are always derived from the returned grams,
 * eliminating the old rounding mismatch between fatGrams and fatCal.
 */
function proteinReferenceWeightKg(weightKg: number, heightCm?: number): number {
  if (!heightCm || !Number.isFinite(heightCm) || heightCm <= 0) return weightKg;

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  if (bmi < 30) return weightKg;

  // Product heuristic for obesity-range BMI: do not let protein scale 1:1
  // with total body weight. Use BMI-25 reference weight plus 40% of the excess.
  // The absolute and calorie-share caps below remain the final guardrails.
  const bmi25Weight = 25 * heightM * heightM;
  const adjustedWeight = bmi25Weight + 0.4 * (weightKg - bmi25Weight);
  return clamp(adjustedWeight, bmi25Weight, weightKg);
}

export function calculateMacros(
  targetCalories: number,
  weightKg: number,
  goal: Goal,
  heightCm?: number
): MacroTargets {
  assertFinitePositive(targetCalories, 'targetCalories');
  assertFinitePositive(weightKg, 'weightKg');

  const referenceWeightKg = proteinReferenceWeightKg(weightKg, heightCm);
  const rawProteinGrams = referenceWeightKg * PROTEIN_G_PER_KG_BY_GOAL[goal];
  const calorieLimitedProteinGrams =
    (targetCalories * MAX_PROTEIN_CALORIE_FRACTION) / KCAL_PER_GRAM_PROTEIN;

  const proteinGrams = Math.max(
    1,
    Math.round(
      Math.min(rawProteinGrams, calorieLimitedProteinGrams, MAX_PROTEIN_GRAMS_PER_DAY)
    )
  );
  const proteinCal = proteinGrams * KCAL_PER_GRAM_PROTEIN;

  // Keep fat close to 25%, but make sure protein + fat cannot consume the
  // entire calorie budget after integer rounding.
  const desiredFatGrams = Math.round(
    (targetCalories * FAT_CALORIE_FRACTION) / KCAL_PER_GRAM_FAT
  );
  const maxFeasibleFatGrams = Math.max(
    1,
    Math.floor((targetCalories - proteinCal - 4) / KCAL_PER_GRAM_FAT)
  );
  const fatGrams = clamp(desiredFatGrams, 1, maxFeasibleFatGrams);
  const fatCal = fatGrams * KCAL_PER_GRAM_FAT;

  const remainingCalories = Math.max(0, targetCalories - proteinCal - fatCal);
  const carbGrams = Math.max(0, Math.round(remainingCalories / KCAL_PER_GRAM_CARB));
  const carbCal = carbGrams * KCAL_PER_GRAM_CARB;

  return {
    targetCalories,
    proteinGrams,
    fatGrams,
    carbGrams,
    proteinCal,
    fatCal,
    carbCal,
  };
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export interface FullNutritionCalcInput {
  weightKg: number;
  heightCm: number;
  birthDateISO: string;
  gender: Gender;
  activityLevel: ActivityLevel;
  goal: Goal;
  weightLossSpeed?: WeightLossSpeed;
  bodyFatPercentage?: number | null;
  /** See calculateBMR. Defaults to false. */
  useBodyFatFormula?: boolean;
  isWorkoutDay?: boolean;
}

export function calculateFullNutritionPlan(input: FullNutritionCalcInput): MacroTargets {
  const age = calculateAge(input.birthDateISO);

  const bmr = calculateBMR({
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    age,
    gender: input.gender,
    bodyFatPercentage: input.bodyFatPercentage,
    useBodyFatFormula: input.useBodyFatFormula ?? false,
  });

  const tdee = calculateTDEE(bmr, input.activityLevel);
  let targetCalories = calculateTargetCalories(tdee, input.goal, input.weightLossSpeed);

  if (input.isWorkoutDay) {
    targetCalories += WORKOUT_DAY_CALORIE_BONUS;
  }

  return calculateMacros(targetCalories, input.weightKg, input.goal, input.heightCm);
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

export function formatGrams(grams: number): string {
  return `${toPersianDigits(Math.round(grams))} گرم`;
}

export function formatKcal(kcal: number): string {
  const formatted = Math.round(kcal).toLocaleString('en-US');
  return `${toPersianDigits(formatted)} کالری`;
}
