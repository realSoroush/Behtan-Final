import type { FoodItem, Meal, MealSlot } from '../types/index.ts';

const normalizeFoodName = (name: string) => name.normalize('NFKC')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069ـ]+/g, '').toLowerCase();

const supplement = (food: FoodItem) => food.qualityTags.includes('protein_supplement');
const meatOrFish = (food: FoodItem) => food.swapGroup === 'main_protein' ||
  food.id === 'whole_wheat_beef_pasta_cooked' || food.id === 'chicken_curry_brown_rice_cooked';

/** A catalog alias, different ingredient order or portion change adds no recipe. */
export function professionalMenuIdentity(meal: Meal): string {
  return JSON.stringify([...new Set(meal.components.map(({ foodItem }) =>
    normalizeFoodName(foodItem.name) || foodItem.id,
  ))].sort());
}

/** Specialist menu expansion must not make a mixed meat/fish dish or stack powders. */
export function professionalRecipeAllowed(foods: FoodItem[]): boolean {
  const mains = foods.filter(meatOrFish).length;
  return mains <= 1 && !(mains && foods.some(food => food.swapGroup === 'egg')) &&
    foods.filter(supplement).length <= 1;
}

function proteinSource(food: FoodItem): string {
  if (['lean_beef', 'ground_beef_lean', 'whole_wheat_beef_pasta_cooked'].includes(food.id)) return 'beef';
  if (['chicken_breast', 'chicken_curry_brown_rice_cooked'].includes(food.id)) return 'chicken';
  if (food.swapGroup === 'egg') return 'egg';
  return normalizeFoodName(food.name);
}

type RecipeChoice = { wholeFoods: string; usesPowder: boolean; primaryProtein: string | undefined };

export function describeProfessionalRecipe(meal: Meal): RecipeChoice {
  const foods = meal.components.map(c => c.foodItem);
  const whole = foods.filter(food => !supplement(food));
  const primary = whole.find(food => food.role === 'protein') ?? whole.find(food => food.role === 'dairy');
  return {
    wholeFoods: JSON.stringify(whole.map(food => normalizeFoodName(food.name)).sort()),
    usesPowder: whole.length < foods.length,
    primaryProtein: primary && proteinSource(primary),
  };
}

function varietyPenalty(count: number, powders: number, bases: number, proteinChoices: number, proteins: number, slot: MealSlot) {
  if (count < 2) return 0;
  const mainMeal = slot === 'breakfast' || slot === 'lunch' || slot === 'dinner';
  return .025 * (count - bases) + .004 * powders + (powders === count ? .12 : 0) +
    (slot === 'post_workout' && proteins < 2 ? .12 : 0) +
    (mainMeal ? .035 * (Math.min(3, proteinChoices) - Math.min(3, proteins)) : 0);
}

function summarizeChoices(choices: RecipeChoice[]) {
  let powders = 0, proteinChoices = 0;
  const bases = new Set<string>(), proteins = new Set<string>();
  for (const choice of choices) {
    powders += Number(choice.usesPowder);
    bases.add(choice.wholeFoods);
    if (choice.primaryProtein) {
      proteinChoices++;
      proteins.add(choice.primaryProtein);
    }
  }
  return { powders, bases, proteinChoices, proteins };
}

/** Preferences influence ranking only. The daily nutrition envelope is still mandatory. */
export function professionalMenuVarietyPenalty(choices: RecipeChoice[], slot: MealSlot): number {
  const { powders, bases, proteinChoices, proteins } = summarizeChoices(choices);
  return varietyPenalty(choices.length, powders, bases.size, proteinChoices, proteins.size, slot);
}

/** Reuse the same selected recipes while scoring each possible addition. */
export function rankProfessionalRecipeAddition(choices: RecipeChoice[], slot: MealSlot) {
  const { powders, bases, proteinChoices, proteins } = summarizeChoices(choices);
  return (candidate: RecipeChoice) => {
    const protein = candidate.primaryProtein;
    return varietyPenalty(
      choices.length + 1,
      powders + Number(candidate.usesPowder),
      bases.size + Number(!bases.has(candidate.wholeFoods)),
      proteinChoices + Number(Boolean(protein)),
      proteins.size + Number(Boolean(protein && !proteins.has(protein))),
      slot,
    );
  };
}
