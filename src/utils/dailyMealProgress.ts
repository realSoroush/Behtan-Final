import type { DailyMealPlan, Meal, MealSlot } from '@/types';
export type DailyMealSnapshots = Partial<Record<MealSlot, Meal>>;
export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear(); const m = String(date.getMonth()+1).padStart(2,'0'); const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
export const MEMBER_TIME_ZONE = 'Asia/Tehran';
const memberDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: MEMBER_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
export function getTehranDateKey(date: Date = new Date()): string {
  const parts = memberDate.formatToParts(date);
  return ['year', 'month', 'day'].map(part => parts.find(value => value.type === part)?.value).join('-');
}
export function applyDailyMealSnapshots(plan: DailyMealPlan | null, snapshots: DailyMealSnapshots): DailyMealPlan | null {
  if (!plan) return null;
  return { ...plan, meals: plan.meals.map((meal) => snapshots[meal.slot] ? { ...snapshots[meal.slot]!, consumed: true } : { ...meal, consumed: false }) };
}
export { isMealSnapshot as isStoredMealSnapshot } from './mealValidation.ts';
