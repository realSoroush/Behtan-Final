/**
 * nutritionHelpers.ts
 * ----------------------------------------------------------------------------
 * PURE, DETERMINISTIC MATH ONLY. No AI, no network calls, no randomness.
 * Every function here must be a pure function: same input -> same output,
 * always. This file is the single source of truth for all calorie/macro
 * math in the app so that nutrition numbers can NEVER hallucinate.
 * ----------------------------------------------------------------------------
 */

import type {
  ActivityLevel,
  Gender,
  Goal,
  MacroTargets,
  WeightLossSpeed,
} from '@/types';

// ============================================================================
// AGE
// ============================================================================

/** Calculates whole-number age in years from an ISO birth date string. */
export function calculateAge(birthDateISO: string): number {
  const birthDate = new Date(birthDateISO);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
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
}

/**
 * Calculates BMR (kcal/day).
 * - If bodyFatPercentage is known: Katch-McArdle formula (most accurate,
 *   based on Lean Body Mass).
 * - Otherwise: Mifflin-St Jeor formula (population-average fallback).
 */
export function calculateBMR({
  weightKg,
  heightCm,
  age,
  gender,
  bodyFatPercentage,
}: BmrInput): number {
  if (bodyFatPercentage != null && bodyFatPercentage > 0 && bodyFatPercentage < 70) {
    // Katch-McArdle
    const leanBodyMass = weightKg * (1 - bodyFatPercentage / 100);
    const bmr = 370 + 21.6 * leanBodyMass;
    return Math.round(bmr);
  }

  // Mifflin-St Jeor
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr = gender === 'male' ? base + 5 : base - 161;
  return Math.round(bmr);
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
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  return Math.round(bmr * multiplier);
}

// ============================================================================
// TARGET CALORIES — TDEE + goal-based adjustment
// ============================================================================
//
// Adjustment is PERCENTAGE-based (relative to the user's own TDEE) rather
// than a flat kcal number. A flat -500 kcal deficit is too aggressive for
// a small person close to their TDEE floor, and too mild for someone with
// a very high TDEE — percentage scales correctly with body size.
//
// BUT a pure percentage with no ceiling is dangerous at the high end: a
// 140kg active man can have a TDEE above 4000 kcal, where a 20% deficit
// alone is >800 kcal/day — well past the ~500-750 kcal/day range considered
// safe regardless of body size. So every deficit/surplus percentage is
// ALSO capped by an absolute kcal/day limit, whichever is reached first.
// ============================================================================

interface CalorieAdjustmentRule {
  /** Fraction of TDEE to deduct/add, e.g. 0.20 = 20% deficit. */
  percentage: number;
  /** Hard ceiling on the adjustment in kcal/day, regardless of percentage. */
  maxAbsoluteKcal: number;
}

const CALORIE_ADJUSTMENT_RULES: Record<
  'weight_gain' | 'maintenance' | WeightLossSpeed,
  CalorieAdjustmentRule
> = {
  weight_gain:  { percentage: 0.15, maxAbsoluteKcal: 500 },
  maintenance:  { percentage: 0,    maxAbsoluteKcal: 0 },
  mild:         { percentage: 0.10, maxAbsoluteKcal: 350 },
  standard:     { percentage: 0.20, maxAbsoluteKcal: 600 },
  fast:         { percentage: 0.25, maxAbsoluteKcal: 750 },
};

/**
 * Resolves the goal (+ weight-loss speed) into a signed kcal/day
 * adjustment, computed as a percentage of THIS user's TDEE and then
 * clamped to a safe absolute ceiling — whichever is smaller.
 */
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
  const percentageAmount = tdee * rule.percentage;
  const cappedAmount = Math.min(percentageAmount, rule.maxAbsoluteKcal);

  const sign = goal === 'weight_gain' ? 1 : goal === 'maintenance' ? 0 : -1;
  return sign * cappedAmount;
}

export function calculateTargetCalories(
  tdee: number,
  goal: Goal,
  weightLossSpeed?: WeightLossSpeed
): number {
  const adjustment = resolveCalorieAdjustment(tdee, goal, weightLossSpeed);
  const target = tdee + adjustment;

  // Safety floor: never recommend under 1200 kcal/day regardless of inputs.
  return Math.max(1200, Math.round(target));
}

// ============================================================================
// MACROS
// ============================================================================

const KCAL_PER_GRAM_PROTEIN = 4;
const KCAL_PER_GRAM_FAT = 9;
const KCAL_PER_GRAM_CARB = 4;

const FAT_PERCENTAGE_OF_CALORIES = 0.25;
const FAT_PERCENTAGE_CAP = 0.3;

/**
 * Protein target (g/kg bodyweight) by goal. Deliberately kept in a
 * conservative 1.4-1.6 range rather than bodybuilding-cut numbers
 * (2.0-2.4g/kg) — a higher ceiling was tried before and directly caused
 * unrealistic portion sizes in the meal-plan engine (e.g. 16 egg whites
 * at breakfast for a single user). 1.4-1.6g/kg is well-supported for
 * general fat loss / maintenance / lean gain without inflating portions.
 */
const PROTEIN_G_PER_KG_BY_GOAL: Record<Goal, number> = {
  weight_loss: 1.6, // slightly higher to help preserve muscle in a deficit
  maintenance: 1.4,
  weight_gain: 1.6, // slightly higher to support muscle building
};

/**
 * Calculates final macro targets (grams + calorie breakdown) from a
 * target calorie budget, body weight, and goal.
 *
 * Protein: goal-dependent g/kg (see PROTEIN_G_PER_KG_BY_GOAL above).
 * Fat: 25% of target calories, hard-capped at 30% of target calories.
 * Carbs: remainder of calories after protein + fat are subtracted.
 */
export function calculateMacros(
  targetCalories: number,
  weightKg: number,
  goal: Goal
): MacroTargets {
  // --- Protein ---
  const proteinGPerKg = PROTEIN_G_PER_KG_BY_GOAL[goal];
  const proteinGrams = Math.round(weightKg * proteinGPerKg);
  const proteinCal = proteinGrams * KCAL_PER_GRAM_PROTEIN;

  // --- Fat (25% base, capped at 30% of total calories) ---
  const fatPercentage = Math.min(FAT_PERCENTAGE_OF_CALORIES, FAT_PERCENTAGE_CAP);
  const fatCal = Math.round(targetCalories * fatPercentage);
  const fatGrams = Math.round(fatCal / KCAL_PER_GRAM_FAT);

  // --- Carbs (remainder) ---
  const remainingCal = Math.max(0, targetCalories - proteinCal - fatCal);
  const carbGrams = Math.round(remainingCal / KCAL_PER_GRAM_CARB);
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
// ORCHESTRATOR — runs the full deterministic pipeline in one call
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
  isWorkoutDay?: boolean;
}

/** Small deterministic bump for workout days: +150 kcal (mostly carbs handled downstream). */
const WORKOUT_DAY_CALORIE_BONUS = 150;

export function calculateFullNutritionPlan(input: FullNutritionCalcInput): MacroTargets {
  const age = calculateAge(input.birthDateISO);

  const bmr = calculateBMR({
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    age,
    gender: input.gender,
    bodyFatPercentage: input.bodyFatPercentage,
  });

  const tdee = calculateTDEE(bmr, input.activityLevel);

  let targetCalories = calculateTargetCalories(tdee, input.goal, input.weightLossSpeed);

  if (input.isWorkoutDay) {
    targetCalories += WORKOUT_DAY_CALORIE_BONUS;
  }

  return calculateMacros(targetCalories, input.weightKg, input.goal);
}

// ============================================================================
// FORMATTING HELPERS (Persian digits)
// ============================================================================

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Converts a number/numeric string to Persian (Farsi) digit glyphs. */
export function toPersianDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/** Formats grams for display, e.g. 145 -> "۱۴۵ گرم". */
export function formatGrams(grams: number): string {
  return `${toPersianDigits(Math.round(grams))} گرم`;
}

/** Formats kcal for display, e.g. 1850 -> "۱٬۸۵۰ کالری". */
export function formatKcal(kcal: number): string {
  const formatted = Math.round(kcal).toLocaleString('en-US');
  return `${toPersianDigits(formatted)} کالری`;
}
