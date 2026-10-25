import type { UserProfile, ProteinEnginePolicy } from "../types/index.ts";
import {
  calculateAge,
  calculateFullNutritionPlanWithTrace,
} from "../utils/nutritionHelpers.ts";
import {
  evaluateProfileMedicalEligibility,
  resolveSafeWeightLossSpeed,
} from "../utils/medicalEligibility.ts";
export function memberNutrition(
  profile: UserProfile,
  policy: ProteinEnginePolicy,
  workout: boolean,
) {
  const eligibility = evaluateProfileMedicalEligibility(profile);
  if (
    !eligibility.canGenerateAutomaticPlan ||
    !profile.weight ||
    !profile.height ||
    !profile.birth_date ||
    !profile.gender ||
    !profile.goal ||
    !profile.activity_level
  )
    throw Error("اطلاعات یا ارزیابی ایمنی برنامه کامل نیست.");
  return calculateFullNutritionPlanWithTrace({
    weightKg: profile.weight,
    heightCm: profile.height,
    birthDateISO: profile.birth_date,
    gender: profile.gender,
    activityLevel: profile.activity_level,
    goal: profile.goal,
    weightLossSpeed: resolveSafeWeightLossSpeed(
      profile.weight_loss_speed,
      eligibility,
    ),
    bodyFatPercentage: profile.body_fat_pct,
    bodyFatSource: profile.body_fat_source,
    isWorkoutDay: workout,
    trainingType: profile.activity_profile_json?.trainingType ?? null,
    proteinBudgetPreference: profile.protein_budget_preference ?? "performance",
    proteinPolicy: policy,
  });
}
export function workoutForDate(
  date: string,
  days: number[] | null | undefined,
  count: number,
) {
  const day = (new Date(date + "T12:00:00").getDay() + 1) % 7;
  return (
    days?.length
      ? days
      : [0, 2, 4, 1, 3, 5, 6].slice(0, Math.max(0, Math.min(7, count)))
  ).includes(day);
}

/** Conservative baseline scope; the exercise form still checks symptoms and equipment. */
export function memberTrainingEligible(
  profile: UserProfile,
  referenceDate = new Date(),
) {
  let age: number;
  try {
    age = calculateAge(profile.birth_date ?? "", referenceDate);
  } catch {
    return false;
  }
  const m = profile.medical_conditions_json;
  return (
    age >= 18 &&
    age <= 64 &&
    Boolean(m?.safetyAnswersConfirmed) &&
    !m?.conditions?.length &&
    !m?.medications?.trim() &&
    !m?.injuries?.trim() &&
    m?.eatingDisorderStatus === "none" &&
    (profile.gender === "male"
      ? m.pregnancyStatus === "not_applicable"
      : m?.pregnancyStatus === "not_pregnant")
  );
}
