import type { DailyMealPlan, FoodItem, Meal, MealComponent, MealSlot } from '../types/index.ts';

export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'night_snack', 'post_workout'];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 500;
export const finiteNonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const positive = (v: unknown): v is number => finiteNonnegative(v) && v > 0;
const within = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance + 1e-8;
const nutrients = ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const;
const totals = ['totalKcal', 'totalProtein', 'totalCarbs', 'totalFat', 'totalFiber'] as const;

/** Snapshot validation uses its recorded composition, never today's mutable catalog. */
export function isFoodSnapshot(value: unknown): value is FoodItem {
  if (!record(value) || !text(value.id) || !text(value.name) || !text(value.unitLabel) ||
    !['protein', 'starch', 'vegetable', 'fat', 'dairy', 'fruit'].includes(String(value.role)) || !positive(value.gramsPerUnit)) return false;
  return nutrients.every(key => finiteNonnegative(value[`${key}PerUnit`])) &&
    ['allergyFlags', 'excludedForVegetarian', 'qualityTags', 'swapAllowedMeals'].every(key =>
      Array.isArray(value[key]) && value[key].length <= 30 && value[key].every(item => typeof item === 'string' && item.length <= 80));
}
export function isMealComponent(value: unknown): value is MealComponent {
  if (!record(value) || !isFoodSnapshot(value.foodItem) || !positive(value.units) || !positive(value.grams) ||
    !nutrients.every(key => finiteNonnegative(value[key]))) return false;
  const c = value as unknown as MealComponent;
  // Existing engine rounds units to 0.01, grams/kcal to integers and macros to 0.1.
  if (!within(c.grams, c.units * c.foodItem.gramsPerUnit, .51 + .005 * c.foodItem.gramsPerUnit)) return false;
  return nutrients.every(key => within(c[key], c.units * c.foodItem[`${key}PerUnit`],
    (key === 'kcal' ? .51 : .051) + .005 * c.foodItem[`${key}PerUnit`]));
}
export function isMealSnapshot(value: unknown, expectedSlot?: MealSlot): value is Meal {
  if (!record(value) || !MEAL_SLOTS.includes(value.slot as MealSlot) || (expectedSlot && value.slot !== expectedSlot) ||
    !text(value.label) || !text(value.templateId) || !text(value.templateName) || typeof value.consumed !== 'boolean' ||
    (value.source !== undefined && value.source !== 'manual' && value.source !== 'food_scan') ||
    !Array.isArray(value.components) || value.components.length < 1 || value.components.length > 20 ||
    !value.components.every(isMealComponent) || !totals.every(key => finiteNonnegative(value[key]))) return false;
  const meal = value as unknown as Meal;
  return nutrients.every((key, i) => within(meal[totals[i]], meal.components.reduce((sum, c) => sum + c[key], 0), key === 'kcal' ? .51 : .051));
}
export function isMealPlan(value: unknown): value is DailyMealPlan {
  if (!record(value) || !text(value.date) || value.date.length > 80 || typeof value.isWorkoutDay !== 'boolean' ||
    !record(value.targets) || !positive(value.targets.targetCalories) ||
    !['proteinGrams', 'carbGrams', 'fatGrams', 'proteinCal', 'carbCal', 'fatCal'].every(key => finiteNonnegative((value.targets as Record<string, unknown>)[key])) ||
    !Array.isArray(value.meals) || !value.meals.length || value.meals.length > MEAL_SLOTS.length || !value.meals.every(m => isMealSnapshot(m))) return false;
  if (new Set(value.meals.map(m => (m as Meal).slot)).size !== value.meals.length) return false;
  // Persisted swap/rotation references are also executable inputs after reopening.
  for (const key of ['swapBaselineMeals', 'mealRotationAnchors']) {
    const meals = value[key];
    if (meals !== undefined && (!Array.isArray(meals) || meals.length > MEAL_SLOTS.length ||
      !meals.every(m => isMealSnapshot(m)) || new Set(meals.map(m => (m as Meal).slot)).size !== meals.length)) return false;
  }
  return true;
}

export function isPrescriptionPlan(value: unknown): value is DailyMealPlan {
  return isMealPlan(value) && value.meals.every(meal => !meal.consumed && !meal.source);
}
