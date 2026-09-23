import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidNutritionCatalog, buildNutritionCatalog } from '../src/utils/nutritionCatalog.ts';
import { TEST_NUTRITION_CATALOG } from './setup-test-nutrition-catalog.mjs';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assertValidNutritionCatalog(TEST_NUTRITION_CATALOG);

// Supabase returns Postgres empty text[] columns as JavaScript []. Empty means
// "no restriction", not "restricted to nobody". This regression caught a
// production bug where every ordinary template was filtered out.
const emptyArrayCatalog = buildNutritionCatalog({
  foodRows: [{
    id: 'test_food', name: 'غذای تست', role: 'starch', emoji: null, unit_label: 'واحد',
    grams_per_unit: 50, kcal_per_unit: 100, protein_per_unit: 2, carbs_per_unit: 20, fat_per_unit: 1,
    fiber_g_per_unit: 2, quality_tags: ['whole_grain'], fruit_veg_grams_per_unit: 0,
    allergy_flags: [], excluded_for_vegetarian: [],
    swap_allowed_meals: ['breakfast'], swap_group: 'bread', swap_priority: 10,
    portion_min_units: 1, portion_typical_units: 1, portion_soft_max_units: 2, portion_hard_max_units: 3, portion_step: 1,
    is_active: true, sort_order: 0,
  }],
  substituteRows: [],
  templateRows: [{
    id: 'test_breakfast', slot: 'breakfast', display_name: 'صبحانه تست',
    is_workout_day_only: false, is_rest_day_only: false, max_per_week: null,
    restricted_diet_only: false, vegetarian_statuses_only: [], goal_tags: [],
    is_active: true, sort_order: 0,
  }],
  slotRows: [{
    template_id: 'test_breakfast', position: 0, role: 'starch',
    primary_food_item_id: 'test_food', dynamic_units: true, fixed_units: null,
  }],
});
assert(
  emptyArrayCatalog.mealTemplates[0].vegetarianStatusesOnly === undefined,
  'Empty Supabase vegetarian_statuses_only array must normalize to unrestricted'
);

assert(TEST_NUTRITION_CATALOG.foods.length === 31, 'Expected 31 seeded foods');
assert(TEST_NUTRITION_CATALOG.mealTemplates.length === 57, 'Expected 57 active templates after mobile meal migration');
assert(Object.keys(TEST_NUTRITION_CATALOG.portionRules).length === 31, 'Every food must have a portion rule');
for (const food of TEST_NUTRITION_CATALOG.foods) {
  assert(Number.isFinite(food.fiberPerUnit) && food.fiberPerUnit >= 0, `Fiber missing for ${food.id}`);
  assert(Array.isArray(food.qualityTags), `Quality tags missing for ${food.id}`);
  assert(food.fruitVegGramsPerUnit >= 0 && food.fruitVegGramsPerUnit <= food.gramsPerUnit, `Invalid fruit/veg contribution for ${food.id}`);
}

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const engineSource = readFileSync(resolve(projectRoot, 'src/utils/mealPlanEngine.ts'), 'utf8');
const appSource = readFileSync(resolve(projectRoot, 'src/App.tsx'), 'utf8');
const authSource = readFileSync(resolve(projectRoot, 'src/hooks/useAuth.ts'), 'utf8');
const migrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260825_001_nutrition_catalog.sql'),
  'utf8'
);
const seedSource = readFileSync(resolve(projectRoot, 'supabase/seed_nutrition_catalog.sql'), 'utf8') + readFileSync(resolve(projectRoot, 'supabase/migrations/20260923_020_mobile_meal_catalog.sql'),'utf8');
const mealAwareMigrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260831_003_meal_aware_food_swaps.sql'),
  'utf8'
);

const diagnosticsMigrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260901_004_nutrition_diagnostics_bodyfat_policy.sql'),
  'utf8'
);

const qualityMigrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260902_005_fiber_food_quality_layer.sql'),
  'utf8'
);

const activityProfileMigrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260902_006_activity_profile_ux.sql'),
  'utf8'
);

const allergySeparationMigrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260904_007_split_peanut_tree_nut_allergy.sql'),
  'utf8'
);

const proteinPolicyMigrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260905_008_protein_engine_runtime_policy.sql'),
  'utf8'
);
const proteinPolicyHookSource = readFileSync(
  resolve(projectRoot, 'src/hooks/useProteinEnginePolicy.ts'),
  'utf8'
);
const subscriptionMigrationSource = readFileSync(
  resolve(projectRoot, 'supabase/migrations/20260907_013_subscription_plans.sql'),
  'utf8'
);
const subscriptionHookSource = readFileSync(
  resolve(projectRoot, 'src/hooks/useSubscriptionPlans.ts'),
  'utf8'
);

assert(!/const\s+FOOD_ITEMS\s*:/.test(engineSource), 'Production engine still contains hard-coded FOOD_ITEMS');
assert(!/const\s+MEAL_TEMPLATES\s*:/.test(engineSource), 'Production engine still contains hard-coded MEAL_TEMPLATES');
assert(!/const\s+PORTION_RULES\s*:/.test(engineSource), 'Production engine still contains hard-coded PORTION_RULES');
assert(engineSource.includes('configureNutritionCatalog'), 'Engine catalog injection missing');

for (const table of ['food_items', 'food_substitutes', 'meal_templates', 'meal_template_slots']) {
  assert(migrationSource.includes(`public.${table}`), `Migration missing ${table}`);
}
assert(migrationSource.includes('onboarding_completed'), 'Migration missing onboarding_completed');
assert(appSource.includes('profile.onboarding_completed !== true'), 'App routing is not using onboarding_completed');
assert(mealAwareMigrationSource.includes('swap_allowed_meals'), 'Meal-aware migration missing swap_allowed_meals');
assert(mealAwareMigrationSource.includes('swap_group'), 'Meal-aware migration missing swap_group');
assert(mealAwareMigrationSource.includes('swap_priority'), 'Meal-aware migration missing swap_priority');
assert(diagnosticsMigrationSource.includes('body_fat_source'), 'Diagnostics migration missing body_fat_source');
assert(diagnosticsMigrationSource.includes('ai_visual'), 'Diagnostics migration missing AI-visual provenance');
assert(qualityMigrationSource.includes('fiber_g_per_unit'), 'Quality migration missing fiber_g_per_unit');
assert(qualityMigrationSource.includes('quality_tags'), 'Quality migration missing quality_tags');
assert(qualityMigrationSource.includes('fruit_veg_grams_per_unit'), 'Quality migration missing fruit/veg contribution');
assert(activityProfileMigrationSource.includes('activity_profile_json'), 'Activity UX migration missing activity_profile_json');
assert(allergySeparationMigrationSource.includes("'peanut','tree_nut'"), 'Allergy migration must separate peanut and tree_nut');
assert(allergySeparationMigrationSource.includes("id in ('walnut', 'mixed_nuts')"), 'Allergy migration must re-tag known tree nuts');
assert(proteinPolicyMigrationSource.includes('public.nutrition_protein_policy'), 'Protein runtime-policy migration missing');
assert(proteinPolicyMigrationSource.includes('weight_loss_rt'), 'Protein runtime policy missing weight_loss_rt');
assert(proteinPolicyMigrationSource.includes('max_protein_calorie_fraction'), 'Protein runtime policy missing calorie guardrail');
assert(proteinPolicyHookSource.includes(".from('nutrition_protein_policy')"), 'App is not loading protein policy from Supabase');
assert(subscriptionMigrationSource.includes('public.subscription_plans'), 'Subscription plans migration missing');
assert(subscriptionMigrationSource.includes('price_toman'), 'Subscription plans need an authoritative toman price');
assert(subscriptionHookSource.includes(".from('subscription_plans')"), 'Paywall is not loading subscription plans from Supabase');

// The old anonymous user_profiles lookup is incompatible with the table's RLS.
assert(
  !authSource.includes(".from('user_profiles')\n        .select('id')"),
  'Auth still performs an anonymous user_profiles existence lookup'
);

for (const food of TEST_NUTRITION_CATALOG.foods) {
  assert(seedSource.includes(`'${food.id}'`), `Seed missing food ${food.id}`);
}
for (const template of TEST_NUTRITION_CATALOG.mealTemplates) {
  assert(seedSource.includes(`'${template.id}'`), `Seed missing template ${template.id}`);
}

console.log('✅ Behtan Supabase/data-contract smoke test passed');
console.log(`   Seeded foods: ${TEST_NUTRITION_CATALOG.foods.length}`);
console.log(`   Seeded meal templates: ${TEST_NUTRITION_CATALOG.mealTemplates.length}`);
console.log('   Production nutrition source: Supabase catalog');
console.log('   Onboarding routing: explicit completion flag');
console.log('   Anonymous profile lookup before Auth: removed');
console.log('   Empty Supabase restriction arrays: normalized safely');
