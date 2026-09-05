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
export function isStoredMealSnapshot(value: unknown, expectedSlot: MealSlot): value is Meal {
  if (!value || typeof value !== 'object') return false;
  const meal = value as Partial<Meal>;
  return meal.slot === expectedSlot && typeof meal.label === 'string' && typeof meal.templateId === 'string' && typeof meal.templateName === 'string' && Array.isArray(meal.components) && typeof meal.totalKcal === 'number' && typeof meal.totalProtein === 'number' && typeof meal.totalCarbs === 'number' && typeof meal.totalFat === 'number';
}
