import type { NutritionCatalog, ProteinEnginePolicy, UserProfile } from '../types/index.ts';
import { MEAL_POLICY_VERSION } from './mealExperience.ts';
import { contentFingerprint } from './planProvenance.ts';

export function memberScheduleContext(profile: UserProfile, catalog: NutritionCatalog, proteinPolicy: ProteinEnginePolicy) {
  return contentFingerprint({
    profile: {
      weight: profile.weight, height: profile.height, birth_date: profile.birth_date, gender: profile.gender,
      activity_level: profile.activity_level, activity: profile.activity_profile_json, goal: profile.goal,
      workout_days: profile.workout_days, workout_weekdays: profile.workout_weekdays,
      diet: profile.dietary_preferences_json, medical: profile.medical_conditions_json,
      protein: profile.protein_budget_preference,
      measured_fat: profile.body_fat_source === 'measured' ? profile.body_fat_pct : null,
    },
    catalog, proteinPolicy, presentationVersion: 1, engineVersion: MEAL_POLICY_VERSION,
  });
}
