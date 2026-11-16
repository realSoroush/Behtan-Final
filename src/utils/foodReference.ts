import type { FoodItem, FoodReference } from '../types/index.ts';

const cookedFoods = new Set([
  'chicken_breast', 'grilled_fish', 'lean_beef', 'ground_beef_lean', 'boiled_potato', 'steamed_vegetables',
]);
const dryFoods = new Set(['soy_chunks', 'oats_dry', 'whey_protein', 'pea_protein']);

/** Fallback for snapshots recorded before migration 038. */
export function foodPreparationState(food: Pick<FoodItem, 'id' | 'preparationState'>): FoodItem['preparationState'] {
  if (food.preparationState) return food.preparationState;
  if (cookedFoods.has(food.id) || food.id.endsWith('_cooked')) return 'cooked';
  if (dryFoods.has(food.id)) return 'dry';
  return undefined;
}

export function recipeReferenceLabel(reference?: FoodReference): string {
  const recipe = reference?.recipe;
  if (typeof recipe?.version !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(recipe.version)) return '';
  const number = (value: number) => value.toLocaleString('fa-IR');
  const batch = recipe.batch;
  return [
    typeof reference?.name === 'string' ? reference.name : '',
    'نسخه ' + recipe.version,
    batch && Number.isSafeInteger(batch.cookedGrams) && batch.cookedGrams > 0 &&
      Number.isSafeInteger(batch.servings) && batch.servings > 0 &&
      `حدود ${number(batch.cookedGrams)} گرم پخته برای ${number(batch.servings)} سهم مرجع`,
  ].filter(Boolean).join(' · ');
}
