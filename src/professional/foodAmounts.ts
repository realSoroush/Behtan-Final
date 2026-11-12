import type { FoodItem, MealComponent } from '../types/index.ts';

// Saved catalog snapshots from before the preparation metadata migration can
// omit the field. These are the same weight bases recorded in migration 038.
const cookedFoods = new Set([
  'chicken_breast', 'grilled_fish', 'lean_beef', 'ground_beef_lean', 'lentils_cooked',
  'brown_rice_cooked', 'white_rice_cooked', 'quinoa_cooked', 'boiled_potato', 'steamed_vegetables',
]);
const dryFoods = new Set(['soy_chunks', 'oats_dry', 'whey_protein', 'pea_protein']);
const basisLabels = { raw: 'خام', cooked: 'پخته', dry: 'خشک', ready: 'آماده مصرف' };

export function foodWeightBasis(food: FoodItem): string | undefined {
  const state = food.preparationState ?? (cookedFoods.has(food.id) ? 'cooked' : dryFoods.has(food.id) ? 'dry' : undefined);
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
