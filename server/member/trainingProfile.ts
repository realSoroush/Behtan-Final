import type { UserProfile } from "../../src/types/index.ts";
import { parseTrainingInput, trainingEligibility, usesConservativeTraining } from "../../src/training/engine.ts";
import type { TrainingPlan, TrainingProfile } from "../../src/training/types.ts";

export function trainingProfile(profile: UserProfile): TrainingProfile {
  const medical = profile.medical_conditions_json;
  return {
    display_name: profile.display_name || "عضو به‌تن",
    gender: profile.gender!,
    birth_date: profile.birth_date!,
    height_cm: profile.height!,
    weight_kg: profile.weight!,
    goal: profile.goal!,
    workout_days: profile.workout_days ?? 0,
    medical_conditions: medical?.conditions ?? [],
    medications_present: Boolean(medical?.medications?.trim()),
    injuries_present: Boolean(medical?.injuries?.trim()),
    pregnancy_status: medical?.pregnancyStatus ?? "not_applicable",
    eating_disorder_status: medical?.eatingDisorderStatus ?? "none",
    safety_confirmed: medical?.safetyAnswersConfirmed === true,
    screening_version: 1,
  };
}

/** The DB stores a legacy full-profile snapshot. Compare only training inputs
 * and recheck current eligibility. The write-side profile CAS still uses every field. */
export function canReuseMemberTraining(
  plan: TrainingPlan,
  savedProfile: string,
  profile: UserProfile,
  now = new Date(),
): boolean {
  try {
    const previous = JSON.parse(savedProfile) as UserProfile | null;
    if (!previous || typeof previous.height !== "number" || typeof previous.weight !== "number"
        || !Number.isFinite(previous.height) || !Number.isFinite(previous.weight)
        || previous.height <= 0 || previous.weight <= 0) return false;
    const input = parseTrainingInput(plan.input);
    const current = trainingProfile(profile);
    trainingEligibility(current, input, now);

    const days = [...(profile.workout_weekdays ?? [])].sort((a, b) => a - b);
    if (current.workout_days !== input.days.length
        || days.length !== input.days.length
        || days.some((day, index) => day !== input.days[index])) return false;
    if (previous.birth_date !== profile.birth_date || previous.gender !== profile.gender) return false;
    return usesConservativeTraining(trainingProfile(previous), input) === usesConservativeTraining(current, input);
  } catch {
    return false;
  }
}
