import type { FoodItem, MealComponent } from '../types/index.ts';
import { foodPreparationState } from '../utils/foodReference.ts';
const basisLabels = { raw: 'خام', cooked: 'پخته', dry: 'خشک', ready: 'آماده مصرف' };

export function foodWeightBasis(food: FoodItem): string | undefined {
  const state = foodPreparationState(food);
  return state && basisLabels[state];
}

export function professionalFoodAmount({ foodItem: food, grams, units }: MealComponent): string {
  const format = (value: number) => value.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
  const basis = foodWeightBasis(food);
  const unit = food.unitLabel.trim();
  const measures: string[] = [];
  if (basis && basis !== 'آماده مصرف' && !food.name.includes(basis)) measures.push(`وزن ${basis}`);
  if (unit && !['گرم', 'g', 'gram'].includes(unit)) {
    const label = food.id === 'olive_oil' && unit === 'قاشق' && food.gramsPerUnit === 14 ? 'قاشق غذاخوری' : unit;
    measures.push(`${format(units)} ${label}`);
  }
  return `${format(grams)} گرم${measures.length ? ` (${measures.join('، ')})` : ''}`;
}
