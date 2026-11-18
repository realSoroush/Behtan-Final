import type { Meal } from '../types/index.ts';
import { historyOfMeals } from './mealExperience.ts';
export interface ScheduledMeals { date: string; meals: Meal[] }
/** Maximum existing uses in any rolling seven-day window containing this date. */
export function weeklyScheduleContext(date: string, days: readonly ScheduledMeals[]) {
  const stamp = Date.parse(date + 'T12:00:00Z');
  const counts = new Map<string, number>();
  for (let start = -6; start <= 0; start++) {
    const window = new Map<string, number>();
    for (const day of days) {
      const age = (Date.parse(day.date + 'T12:00:00Z') - stamp) / 86400000;
      if (day.date === date || age < start || age > start + 6) continue;
      for (const meal of day.meals) {
        const id = meal.templateId.split('~')[0];
        window.set(id, (window.get(id) ?? 0) + 1);
      }
    }
    for (const [id, value] of window) counts.set(id, Math.max(counts.get(id) ?? 0, value));
  }
  return { templateUsesThisWeek: counts,
    previousWeek: days.filter(day => day.date !== date).flatMap(day => historyOfMeals(day.meals)) };
}
