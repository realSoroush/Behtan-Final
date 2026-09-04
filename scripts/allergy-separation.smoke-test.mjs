import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installTestNutritionCatalog, TEST_NUTRITION_CATALOG } from './setup-test-nutrition-catalog.mjs';
import { calculateFullNutritionPlan } from '../src/utils/nutritionHelpers.ts';
import { generateDailyMealPlan } from '../src/utils/mealPlanEngine.ts';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

installTestNutritionCatalog();

const food = (id) => TEST_NUTRITION_CATALOG.foods.find((item) => item.id === id);
const walnut = food('walnut');
const mixedNuts = food('mixed_nuts');

assert(walnut, 'walnut missing from fixture');
assert(mixedNuts, 'mixed_nuts missing from fixture');
assert(walnut.allergyFlags.includes('tree_nut'), 'walnut must be tagged tree_nut');
assert(!walnut.allergyFlags.includes('peanut'), 'walnut must not be tagged peanut');
assert(mixedNuts.allergyFlags.includes('tree_nut'), 'mixed_nuts must be tagged tree_nut');
assert(!mixedNuts.allergyFlags.includes('peanut'), 'mixed_nuts must not be tagged peanut');
assert(mixedNuts.name.includes('بدون بادام‌زمینی'), 'mixed_nuts label must explicitly exclude peanuts');

const targets = calculateFullNutritionPlan({
  weightKg: 90,
  heightCm: 175,
  birthDateISO: '1990-05-15',
  gender: 'male',
  activityLevel: 'moderate',
  goal: 'weight_loss',
  weightLossSpeed: 'standard',
  isWorkoutDay: false,
});

const treeNutFreePlan = generateDailyMealPlan(
  targets,
  90,
  { vegetarianStatus: 'none', allergies: ['tree_nut'] },
  false,
  '2026-09-04-tree-nut-free'
);

for (const meal of treeNutFreePlan.meals) {
  for (const component of meal.components) {
    assert(
      !component.foodItem.allergyFlags.includes('tree_nut'),
      `Tree-nut allergy leaked food: ${component.foodItem.id}`
    );
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const typesSource = readFileSync(resolve(projectRoot, 'src/types/index.ts'), 'utf8');
const dietaryStepSource = readFileSync(resolve(projectRoot, 'src/components/onboarding/Step7Dietary.tsx'), 'utf8');
const migrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260904_007_split_peanut_tree_nut_allergy.sql'),
  'utf8'
);

assert(typesSource.includes("'peanut' | 'tree_nut'"), 'Allergy union does not separate peanut/tree_nut');
assert(dietaryStepSource.includes("value: 'peanut'"), 'Peanut option missing from onboarding');
assert(dietaryStepSource.includes("value: 'tree_nut'"), 'Tree-nut option missing from onboarding');
assert(migrationSource.includes("'peanut','tree_nut'"), 'DB constraint does not allow both allergen categories');
assert(migrationSource.includes("array_replace(allergy_flags, 'peanut', 'tree_nut')"), 'Legacy tree-nut rows are not migrated');

console.log('✅ Behtan peanut/tree-nut allergy separation smoke test passed');
console.log('   Peanut and tree nuts: independent onboarding choices');
console.log('   Walnut + mixed nuts: tree_nut only');
console.log('   Tree-nut-free plan: no tree_nut-tagged food leaked');
