import type { DailyMealPlan, DietaryPreferencesJson, MacroTargets, Meal } from '../types/index.ts';
import type { MealExperienceContext } from './mealExperience.ts';
import { generateDailyMealPlan, type MealPlanEngine } from './mealPlanEngine.ts';
import { prescriptionForSchedule } from './mealPresentation.ts';

/** Keep an independent prescription underneath factual intake, including after undo/reopen. */
export function generateMemberPrescription(
  targets: MacroTargets, weight: number, preferences: DietaryPreferencesJson, workout: boolean,
  date?: string, context?: MealExperienceContext, engine?: Pick<MealPlanEngine, 'generateDailyMealPlan'>,
): DailyMealPlan {
  const generate = engine?.generateDailyMealPlan ?? generateDailyMealPlan;
  if (!context?.lockedMeals?.length) return generate(targets, weight, preferences, workout, date, context);
  const baseline = generate(targets, weight, preferences, workout, date, { ...context, lockedMeals: [] });
  const withIntake = generate(targets, weight, preferences, workout, date, context);
  return prescriptionForSchedule(withIntake, baseline);
}

/** Updating the displayed intake must not turn a previously hydrated lock into a proposal. */
export function currentIntakeLocks(previous: Meal[], snapshots: Partial<Record<Meal['slot'], Meal>>): Meal[] {
  return previous.filter(meal => Boolean(snapshots[meal.slot])).map(meal => snapshots[meal.slot]!);
}
