import type { DailyMealPlan, Meal } from '../types/index.ts';
import { generateDailyMealPlan } from './mealPlanEngine.ts';
import { prescriptionForSchedule } from './mealPresentation.ts';

/** Keep an independent prescription underneath factual intake, including after undo/reopen. */
export function generateMemberPrescription(...args: Parameters<typeof generateDailyMealPlan>): DailyMealPlan {
  const context = args[5];
  if (!context?.lockedMeals?.length) return generateDailyMealPlan(...args);
  const baselineArgs: Parameters<typeof generateDailyMealPlan> = [...args];
  baselineArgs[5] = { ...context, lockedMeals: [] };
  const baseline = generateDailyMealPlan(...baselineArgs);
  const withIntake = generateDailyMealPlan(...args);
  return prescriptionForSchedule(withIntake, baseline);
}

/** Updating the displayed intake must not turn a previously hydrated lock into a proposal. */
export function currentIntakeLocks(previous: Meal[], snapshots: Partial<Record<Meal['slot'], Meal>>): Meal[] {
  return previous.filter(meal => Boolean(snapshots[meal.slot])).map(meal => snapshots[meal.slot]!);
}
