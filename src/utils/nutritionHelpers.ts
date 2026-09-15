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
  BodyFatSource,
  TrainingType,
  ProteinBudgetPreference,
  ProteinEnginePolicy,
} from '@/types';
import { DEFAULT_PROTEIN_ENGINE_POLICY } from './proteinPolicy.ts';

// ============================================================================
// CONSTANTS
// ============================================================================

const KCAL_PER_GRAM_PROTEIN = 4;
const KCAL_PER_GRAM_FAT = 9;
const KCAL_PER_GRAM_CARB = 4;

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

export type BmrFormula = 'mifflin_st_jeor' | 'katch_mcardle';

export interface BmrInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  bodyFatPercentage?: number | null;
  bodyFatSource?: BodyFatSource | null;
}

function isValidBodyFatPercentage(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 2 && value < 70;
}

/**
 * Formula selection is automatic and source-based; there is no user toggle.
 * - AI/photo estimate -> Mifflin-St Jeor (body fat remains informational).
 * - Measured body fat -> Katch-McArdle when the value is valid.
 */
export function resolveBmrFormula(input: Pick<BmrInput, 'bodyFatPercentage' | 'bodyFatSource'>): BmrFormula {
  if (input.bodyFatSource === 'measured' && isValidBodyFatPercentage(input.bodyFatPercentage)) {
    return 'katch_mcardle';
  }
  return 'mifflin_st_jeor';
}

/** Calculates BMR (kcal/day) using the automatically resolved formula. */
export function calculateBMR(input: BmrInput): number {
  const {
    weightKg,
    heightCm,
    age,
    gender,
    bodyFatPercentage,
  } = input;

  assertFinitePositive(weightKg, 'weightKg');
  assertFinitePositive(heightCm, 'heightCm');
  assertFinitePositive(age, 'age');

  const formula = resolveBmrFormula(input);
  if (formula === 'katch_mcardle' && isValidBodyFatPercentage(bodyFatPercentage)) {
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

/** Automatic energy adjustment; legacy speed values no longer affect targets. */
export const AUTOMATIC_CALORIE_POLICY: Readonly<CalorieAdjustmentRule> = {
  percentage: 0.22,
  maxAbsoluteKcal: 1200,
};

/** Compatibility for older imports; all former speeds use the same policy. */
export const WEIGHT_LOSS_SPEED_POLICY: Readonly<Record<WeightLossSpeed, CalorieAdjustmentRule>> = {
  mild: AUTOMATIC_CALORIE_POLICY,
  standard: AUTOMATIC_CALORIE_POLICY,
  fast: AUTOMATIC_CALORIE_POLICY,
};

function resolveCalorieAdjustment(tdee: number, goal: Goal): number {
  const magnitude = Math.min(
    tdee * AUTOMATIC_CALORIE_POLICY.percentage,
    AUTOMATIC_CALORIE_POLICY.maxAbsoluteKcal
  );
  return goal === 'weight_gain' ? magnitude : goal === 'maintenance' ? 0 : -magnitude;
}

export function calculateTargetCalories(
  tdee: number,
  goal: Goal,
  _weightLossSpeed?: WeightLossSpeed
): number {
  assertFinitePositive(tdee, 'tdee');

  const adjustment = resolveCalorieAdjustment(tdee, goal);
  const target = tdee + adjustment;

  // Product-level emergency floor. Clinical plans below this threshold should
  // not be generated automatically by a general-purpose consumer app.
  return Math.max(1200, Math.round(target));
}

// ============================================================================
// MACROS
// ============================================================================

/**
 * Protein Engine v3 — phase 1.
 *
 * The multiplier depends on goal + whether the user performs resistance
 * training. Cardio-only users stay on the non-resistance branch because the
 * higher target is intended primarily for lean-mass preservation/gain under a
 * resistance stimulus.
 *
 * These factors are applied to protein reference weight, not blindly to total
 * body weight in obesity-range BMI.
 */
export const PROTEIN_G_PER_KG_POLICY: Readonly<Record<Goal, {
  noResistanceTraining: number;
  resistanceTraining: number;
}>> = {
  maintenance: {
    noResistanceTraining: DEFAULT_PROTEIN_ENGINE_POLICY.maintenanceNoResistanceTraining,
    resistanceTraining: DEFAULT_PROTEIN_ENGINE_POLICY.maintenanceResistanceTraining,
  },
  weight_loss: {
    noResistanceTraining: DEFAULT_PROTEIN_ENGINE_POLICY.weightLossNoResistanceTraining,
    resistanceTraining: DEFAULT_PROTEIN_ENGINE_POLICY.weightLossResistanceTraining,
  },
  weight_gain: {
    noResistanceTraining: DEFAULT_PROTEIN_ENGINE_POLICY.weightGainNoResistanceTraining,
    resistanceTraining: DEFAULT_PROTEIN_ENGINE_POLICY.weightGainResistanceTraining,
  },
};

export function isResistanceTraining(trainingType?: TrainingType | null): boolean {
  return trainingType === 'resistance' || trainingType === 'mixed';
}

export interface ProteinFactorRange {
  /** Behtan practical floor, not the physiological minimum/RDA. */
  minimum: number;
  preferred: number;
}

export function resolveProteinFactorRangeGPerKg(
  goal: Goal,
  trainingType?: TrainingType | null,
  policy: ProteinEnginePolicy = DEFAULT_PROTEIN_ENGINE_POLICY
): ProteinFactorRange {
  const resistance = isResistanceTraining(trainingType);
  switch (goal) {
    case 'maintenance':
      return resistance
        ? { minimum: policy.maintenanceResistanceTrainingMinimum, preferred: policy.maintenanceResistanceTraining }
        : { minimum: policy.maintenanceNoResistanceTrainingMinimum, preferred: policy.maintenanceNoResistanceTraining };
    case 'weight_loss':
      return resistance
        ? { minimum: policy.weightLossResistanceTrainingMinimum, preferred: policy.weightLossResistanceTraining }
        : { minimum: policy.weightLossNoResistanceTrainingMinimum, preferred: policy.weightLossNoResistanceTraining };
    case 'weight_gain':
      return resistance
        ? { minimum: policy.weightGainResistanceTrainingMinimum, preferred: policy.weightGainResistanceTraining }
        : { minimum: policy.weightGainNoResistanceTrainingMinimum, preferred: policy.weightGainNoResistanceTraining };
  }
}

export function resolveProteinBudgetPosition(
  preference: ProteinBudgetPreference = 'performance',
  policy: ProteinEnginePolicy = DEFAULT_PROTEIN_ENGINE_POLICY
): number {
  switch (preference) {
    case 'economic':
      return policy.economicProteinRangePosition;
    case 'balanced':
      return policy.balancedProteinRangePosition;
    case 'performance':
      return policy.performanceProteinRangePosition;
  }
}

export function resolveProteinFactorGPerKg(
  goal: Goal,
  trainingType?: TrainingType | null,
  policy: ProteinEnginePolicy = DEFAULT_PROTEIN_ENGINE_POLICY,
  budgetPreference: ProteinBudgetPreference = 'performance'
): number {
  const range = resolveProteinFactorRangeGPerKg(goal, trainingType, policy);
  const position = resolveProteinBudgetPosition(budgetPreference, policy);
  return range.minimum + (range.preferred - range.minimum) * position;
}

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
export function calculateProteinReferenceWeightKg(
  weightKg: number,
  heightCm?: number,
  policy: ProteinEnginePolicy = DEFAULT_PROTEIN_ENGINE_POLICY
): number {
  if (!heightCm || !Number.isFinite(heightCm) || heightCm <= 0) return weightKg;

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  if (bmi < policy.obesityBmiThreshold) return weightKg;

  // Runtime-configurable obesity curve: reference-BMI weight plus a fraction
  // of weight above that reference. Supabase is the production source of truth.
  const referenceWeight = policy.referenceBmi * heightM * heightM;
  const adjustedWeight = referenceWeight
    + policy.excessWeightFraction * (weightKg - referenceWeight);
  return clamp(adjustedWeight, referenceWeight, weightKg);
}

export function calculateMacros(
  targetCalories: number,
  weightKg: number,
  goal: Goal,
  heightCm?: number,
  trainingType?: TrainingType | null,
  proteinPolicy: ProteinEnginePolicy = DEFAULT_PROTEIN_ENGINE_POLICY,
  proteinBudgetPreference: ProteinBudgetPreference = 'performance'
): MacroTargets {
  assertFinitePositive(targetCalories, 'targetCalories');
  assertFinitePositive(weightKg, 'weightKg');

  const referenceWeightKg = calculateProteinReferenceWeightKg(weightKg, heightCm, proteinPolicy);
  const proteinFactor = resolveProteinFactorGPerKg(
    goal,
    trainingType,
    proteinPolicy,
    proteinBudgetPreference
  );
  const rawProteinGrams = referenceWeightKg * proteinFactor;
  const calorieLimitedProteinGrams =
    (targetCalories * proteinPolicy.maxProteinCalorieFraction) / KCAL_PER_GRAM_PROTEIN;

  const proteinGrams = Math.max(
    1,
    Math.round(
      Math.min(rawProteinGrams, calorieLimitedProteinGrams, proteinPolicy.maxProteinGramsPerDay)
    )
  );
  const proteinCal = proteinGrams * KCAL_PER_GRAM_PROTEIN;

  // Keep fat close to 25%, but make sure protein + fat cannot consume the
  // entire calorie budget after integer rounding.
  const desiredFatGrams = Math.round(
    (targetCalories * proteinPolicy.fatCalorieFraction) / KCAL_PER_GRAM_FAT
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
  bodyFatSource?: BodyFatSource | null;
  isWorkoutDay?: boolean;
  /** Protein targeting uses this separately from the TDEE activity bucket. */
  trainingType?: TrainingType | null;
  /** User-selected affordability/performance position. Legacy callers default to performance to preserve prior output. */
  proteinBudgetPreference?: ProteinBudgetPreference | null;
  /** Supabase-backed runtime policy in production; deterministic defaults in tests/tools. */
  proteinPolicy?: ProteinEnginePolicy;
  /** Test/diagnostic override only. Production callers normally omit this. */
  referenceDate?: Date;
}

export interface NutritionCalculationTrace {
  chronologicalAgeUsed: number;
  bmrFormula: BmrFormula;
  bodyFatPercentage: number | null;
  bodyFatSource: BodyFatSource | null;
  bodyFatUsedInBmr: boolean;
  biologicalAgeUsedInNutrition: false;
  bmr: number;
  activityLevel: ActivityLevel;
  activityMultiplier: number;
  tdee: number;
  goal: Goal;
  weightLossSpeed: WeightLossSpeed | null;
  calorieAdjustmentKcal: number;
  workoutBonusKcal: number;
  targetCalories: number;
  trainingType: TrainingType | null;
  resistanceTrainingUsedForProtein: boolean;
  proteinPolicyId: string;
  proteinPolicyUpdatedAt: string | null;
  proteinObesityBmiThreshold: number;
  proteinReferenceBmi: number;
  proteinExcessWeightFraction: number;
  proteinMaxGramsPerDay: number;
  proteinMaxCalorieFraction: number;
  fatCalorieFraction: number;
  proteinReferenceWeightKg: number;
  proteinMinimumFactorGPerKg: number;
  proteinPreferredFactorGPerKg: number;
  proteinMinimumTargetGrams: number;
  proteinPreferredTargetGrams: number;
  proteinBudgetPreference: ProteinBudgetPreference;
  proteinBudgetPosition: number;
  /** Active factor selected inside the minimum↔preferred range. */
  proteinFactorGPerKg: number;
  rawProteinTargetGrams: number;
  finalProteinTargetGrams: number;
  proteinCalorieShare: number;
  proteinCappedByCalories: boolean;
  proteinCappedByAbsoluteLimit: boolean;
}

export interface FullNutritionPlanWithTrace {
  targets: MacroTargets;
  trace: NutritionCalculationTrace;
}

/**
 * Creates a transparent trace of every value that can change calorie targets.
 * Biological age is intentionally absent from the inputs and can never affect
 * the prescription.
 */
export function calculateFullNutritionPlanWithTrace(
  input: FullNutritionCalcInput
): FullNutritionPlanWithTrace {
  const age = calculateAge(input.birthDateISO, input.referenceDate ?? new Date());
  const bmrFormula = resolveBmrFormula({
    bodyFatPercentage: input.bodyFatPercentage,
    bodyFatSource: input.bodyFatSource,
  });

  const bmr = calculateBMR({
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    age,
    gender: input.gender,
    bodyFatPercentage: input.bodyFatPercentage,
    bodyFatSource: input.bodyFatSource,
  });

  const activityMultiplier = ACTIVITY_MULTIPLIERS[input.activityLevel];
  if (!activityMultiplier) {
    throw new Error(`[nutritionHelpers] Unsupported activity level: ${String(input.activityLevel)}`);
  }

  const tdee = calculateTDEE(bmr, input.activityLevel);
  const baseTargetCalories = calculateTargetCalories(tdee, input.goal, input.weightLossSpeed);
  // Derive the displayed adjustment from the actual rounded/floored target so
  // the trace always reconciles exactly: TDEE + adjustment + workout = target.
  const calorieAdjustmentKcal = baseTargetCalories - tdee;
  const workoutBonusKcal = input.goal === 'maintenance' && input.isWorkoutDay ? WORKOUT_DAY_CALORIE_BONUS : 0;
  const targetCalories = baseTargetCalories + workoutBonusKcal;

  const proteinPolicy = input.proteinPolicy ?? DEFAULT_PROTEIN_ENGINE_POLICY;
  const proteinReferenceWeight = calculateProteinReferenceWeightKg(
    input.weightKg,
    input.heightCm,
    proteinPolicy
  );
  const proteinFactorRange = resolveProteinFactorRangeGPerKg(
    input.goal,
    input.trainingType,
    proteinPolicy
  );
  const proteinBudgetPreference = input.proteinBudgetPreference ?? 'performance';
  const proteinBudgetPosition = resolveProteinBudgetPosition(
    proteinBudgetPreference,
    proteinPolicy
  );
  const proteinFactorGPerKg = resolveProteinFactorGPerKg(
    input.goal,
    input.trainingType,
    proteinPolicy,
    proteinBudgetPreference
  );
  const proteinMinimumTargetRaw = proteinReferenceWeight * proteinFactorRange.minimum;
  const proteinPreferredTargetRaw = proteinReferenceWeight * proteinFactorRange.preferred;
  const rawProteinTargetGrams = proteinReferenceWeight * proteinFactorGPerKg;
  const calorieProteinCapGrams =
    (targetCalories * proteinPolicy.maxProteinCalorieFraction) / KCAL_PER_GRAM_PROTEIN;
  const targets = calculateMacros(
    targetCalories,
    input.weightKg,
    input.goal,
    input.heightCm,
    input.trainingType,
    proteinPolicy,
    proteinBudgetPreference
  );
  return {
    targets,
    trace: {
      chronologicalAgeUsed: age,
      bmrFormula,
      bodyFatPercentage: input.bodyFatPercentage ?? null,
      bodyFatSource: input.bodyFatSource ?? null,
      bodyFatUsedInBmr: bmrFormula === 'katch_mcardle',
      biologicalAgeUsedInNutrition: false,
      bmr,
      activityLevel: input.activityLevel,
      activityMultiplier,
      tdee,
      goal: input.goal,
      weightLossSpeed: null,
      calorieAdjustmentKcal,
      workoutBonusKcal,
      targetCalories,
      trainingType: input.trainingType ?? null,
      resistanceTrainingUsedForProtein: isResistanceTraining(input.trainingType),
      proteinPolicyId: proteinPolicy.id,
      proteinPolicyUpdatedAt: proteinPolicy.updatedAt,
      proteinObesityBmiThreshold: proteinPolicy.obesityBmiThreshold,
      proteinReferenceBmi: proteinPolicy.referenceBmi,
      proteinExcessWeightFraction: proteinPolicy.excessWeightFraction,
      proteinMaxGramsPerDay: proteinPolicy.maxProteinGramsPerDay,
      proteinMaxCalorieFraction: proteinPolicy.maxProteinCalorieFraction,
      fatCalorieFraction: proteinPolicy.fatCalorieFraction,
      proteinReferenceWeightKg: Number(proteinReferenceWeight.toFixed(1)),
      proteinMinimumFactorGPerKg: proteinFactorRange.minimum,
      proteinPreferredFactorGPerKg: proteinFactorRange.preferred,
      proteinFactorGPerKg,
      proteinMinimumTargetGrams: Number(proteinMinimumTargetRaw.toFixed(1)),
      proteinPreferredTargetGrams: Number(proteinPreferredTargetRaw.toFixed(1)),
      proteinBudgetPreference,
      proteinBudgetPosition: Number(proteinBudgetPosition.toFixed(3)),
      rawProteinTargetGrams: Number(rawProteinTargetGrams.toFixed(1)),
      finalProteinTargetGrams: targets.proteinGrams,
      proteinCalorieShare: Number((targets.proteinCal / Math.max(1, targetCalories)).toFixed(3)),
      proteinCappedByCalories: rawProteinTargetGrams > calorieProteinCapGrams + 0.5,
      proteinCappedByAbsoluteLimit: rawProteinTargetGrams > proteinPolicy.maxProteinGramsPerDay + 0.5,
    },
  };
}

export function calculateFullNutritionPlan(input: FullNutritionCalcInput): MacroTargets {
  return calculateFullNutritionPlanWithTrace(input).targets;
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
