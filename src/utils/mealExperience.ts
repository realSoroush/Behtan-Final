import type { Meal, MealComponent, MealSlot, ProteinBudgetPreference } from '../types/index.ts';

export const MEAL_POLICY_VERSION = 'mobile-meals-v2';
// Product allocation, not a clinical prescription. Each macro uses the same
// split so the energy assigned to a slot is consistent with its macro budget.
export const MEAL_SHARES: Record<MealSlot, number> = {
  breakfast: .20, morning_snack: .10, lunch: .30,
  afternoon_snack: .10, dinner: .25, night_snack: .05, post_workout: 0,
};
export interface MealHistoryItem { slot: MealSlot; foodIds: string[] }
export interface MealExperienceContext {
  previousDay?: MealHistoryItem[];
  avoidMeals?: MealHistoryItem[];
  lockedMeals?: Meal[];
  proteinBudgetPreference?: ProteinBudgetPreference;
}
interface ExperienceMeal { slot: MealSlot; components: MealComponent[] }
export const mealFingerprint = (ids: string[]) => [...new Set(ids)].sort().join('|');
export const historyOfMeals = (meals: ExperienceMeal[]): MealHistoryItem[] =>
  meals.map(m => ({slot: m.slot, foodIds: m.components.map(c => c.foodItem.id)}));

/** Lower is better. Never bypasses eligibility, portions or macro feasibility. */
export function mealExperiencePenalty(meals: ExperienceMeal[], context: MealExperienceContext = {}): number {
  let penalty = 0;
  const signatures = meals.map(m => mealFingerprint(m.components.map(c => c.foodItem.id)));
  const anchors = (m: ExperienceMeal) => m.components.filter(c =>
    c.foodItem.role === 'protein' || c.foodItem.role === 'fruit' || c.foodItem.role === 'dairy'
  ).map(c => c.foodItem.id);
  for (let i = 0; i < meals.length; i++) {
    const meal = meals[i];
    if (i > 0) {
      if (signatures[i] === signatures[i-1]) penalty += 6;
      else if (anchors(meal).some(id => anchors(meals[i-1]).includes(id))) penalty += 1.5;
    }
    const previous = context.previousDay?.find(m => m.slot === meal.slot);
    if (previous && mealFingerprint(previous.foodIds) === signatures[i]) penalty += 2;
    const avoided = context.avoidMeals?.find(m => m.slot === meal.slot);
    if (avoided && mealFingerprint(avoided.foodIds) === signatures[i]) penalty += 4;
    if (meal.slot === 'morning_snack' || meal.slot === 'afternoon_snack') {
      // Whole fruit with a meaningful portion; dates alone should not crowd out
      // fresh fruit. Uses catalog metadata, not invented nutrient values.
      const fruit = meal.components.some(c => c.foodItem.role === 'fruit' &&
        c.foodItem.qualityTags.includes('whole_fruit') && c.grams >= 60);
      const fiber = meal.components.reduce((sum,c) => sum + c.fiber, 0);
      if (!fruit) penalty += 2;
      penalty += Math.max(0, 2 - fiber); // ranking preference, not a health claim
    }
  }
  for (const pair of [['lunch','dinner'],['morning_snack','afternoon_snack']] as const) {
    const a = meals.findIndex(m => m.slot === pair[0]);
    const b = meals.findIndex(m => m.slot === pair[1]);
    if (a >= 0 && b >= 0) {
      if (signatures[a] === signatures[b]) penalty += 5;
      else if (anchors(meals[a]).some(id => anchors(meals[b]).includes(id))) penalty += 2;
    }
  }
  return penalty;
}
