import type { MealSlot } from '../types/index.ts';
import type { MealStructure } from './mealExperience.ts';

const layouts: Record<number, readonly Exclude<MealSlot, 'post_workout'>[]> = {
  3: ['breakfast', 'lunch', 'dinner'],
  4: ['breakfast', 'lunch', 'afternoon_snack', 'dinner'],
  5: ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner'],
  6: ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'night_snack'],
};
export interface MealSettings { regularMeals: number; includePostWorkout: boolean }
export const DEFAULT_MEAL_SETTINGS: MealSettings = { regularMeals: 6, includePostWorkout: true };
export function parseMealSettings(value: unknown): MealSettings {
  if (value == null) return { ...DEFAULT_MEAL_SETTINGS };
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_MEAL_SETTINGS');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 2 || !Number.isInteger(v.regularMeals) || !layouts[v.regularMeals as number] ||
      typeof v.includePostWorkout !== 'boolean') throw Error('INVALID_MEAL_SETTINGS');
  return { regularMeals: v.regularMeals as number, includePostWorkout: v.includePostWorkout };
}
export function mealStructureFor(value: unknown): MealStructure {
  const settings = parseMealSettings(value);
  return { regularSlots: layouts[settings.regularMeals], includePostWorkout: settings.includePostWorkout };
}
