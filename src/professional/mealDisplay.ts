import type { Meal } from '../types/index.ts';
import { professionalFoodAmount } from './foodAmounts.ts';

export const roundFa = (n: number) => Math.round(n).toLocaleString("fa-IR");
export function mealDescription(m: Meal): string {
  return m.components.map(component => `${component.foodItem.name} ${professionalFoodAmount(component)}`).join(' + ');
}
