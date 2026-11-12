import type { MacroTargets, Meal } from '../types/index.ts';
import type { MenuDay, PrintedPlan } from './menuPlan.ts';

export const nutritionDayLabel = (workout: boolean) => workout ? 'روزهای تمرین' : 'روزهای استراحت';

function mealPortions(meal: Meal) {
  return JSON.stringify(meal.components.map(c => [c.foodItem.id, c.foodItem.name, c.grams, c.units]).sort());
}

function sameMenus(a: Meal[], b: Meal[]): boolean {
  if (a.length !== b.length) return false;
  const portions = b.map(mealPortions).sort();
  return a.map(mealPortions).sort().every((key, index) => key === portions[index]);
}

/** The snapshots retain both day totals. Display a meal's menu list just once
 * when both days prescribe the same portions. */
export function nutritionMealSections(plan: PrintedPlan) {
  const schedule = plan.days.find(day => day.workout) ?? plan.days[0];
  const rest = plan.days.find(day => !day.workout);
  const workout = plan.days.find(day => day.workout);
  const sections = new Map(schedule?.slots.map(slot => [slot.slot, slot.label]));
  for (const slot of rest?.slots ?? []) if (!sections.has(slot.slot)) sections.set(slot.slot, slot.label);
  return [...sections].map(([slot, label]) => {
    const normal = rest?.slots.find(item => item.slot === slot);
    const training = workout?.slots.find(item => item.slot === slot);
    const shared = normal && (!workout || (training && sameMenus(normal.options, training.options)));
    const groups: { label?: string; options: Meal[] }[] = [];
    if (shared) groups.push({ options: normal.options });
    else {
      if (normal) groups.push({ label: nutritionDayLabel(false), options: normal.options });
      if (training) groups.push({ label: normal ? nutritionDayLabel(true) : 'فقط روزهای تمرین', options: training.options });
    }
    return { slot, label, groups };
  });
}

export function nutritionTargetRows(days: MenuDay[]): { label?: string; targets: MacroTargets }[] {
  const first = days[0];
  const keys = ['targetCalories', 'proteinGrams', 'carbGrams', 'fatGrams'] as const;
  if (first && days.every(day => keys.every(key => day.targets[key] === first.targets[key]))) {
    return [{ targets: first.targets }];
  }
  return days.map(day => ({ label: nutritionDayLabel(day.workout), targets: day.targets }));
}
