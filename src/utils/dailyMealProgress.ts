import type { DailyMealPlan, Meal, MealSlot } from '@/types';
export type DailyMealSnapshots = Partial<Record<MealSlot, Meal>>;
export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear(); const m = String(date.getMonth()+1).padStart(2,'0'); const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
export function applyDailyMealSnapshots(plan: DailyMealPlan | null, snapshots: DailyMealSnapshots): DailyMealPlan | null {
  if (!plan) return null;
  return { ...plan, meals: plan.meals.map((meal) => snapshots[meal.slot] ? { ...snapshots[meal.slot]!, consumed: true } : { ...meal, consumed: false }) };
}
export { isMealSnapshot as isStoredMealSnapshot } from './mealValidation.ts';
