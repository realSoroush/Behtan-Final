import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureNutritionCatalog } from '../src/utils/mealPlanEngine.ts';
import { assertValidNutritionCatalog } from '../src/utils/nutritionCatalog.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, 'fixtures', 'nutrition-catalog.fixture.json');
const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));

export const TEST_NUTRITION_CATALOG = {
  foods: raw.FOOD_ITEMS,
  substitutes: raw.FOOD_SUBSTITUTES,
  mealTemplates: raw.MEAL_TEMPLATES,
  portionRules: raw.PORTION_RULES,
};

export function installTestNutritionCatalog() {
  assertValidNutritionCatalog(TEST_NUTRITION_CATALOG);
  configureNutritionCatalog(TEST_NUTRITION_CATALOG);
  return TEST_NUTRITION_CATALOG;
}
