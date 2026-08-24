/**
 * mealPlanEngine.ts
 * ─────────────────────────────────────────────────────────────────────────
 * DYNAMIC, deterministic meal-plan generation. No AI, no invented numbers.
 *
 * Architecture (bottom to top):
 *   1. FOOD_ITEMS            - atomic foods with real per-unit macros
 *   2. FOOD_SUBSTITUTES      - swap groups (e.g. برنج قهوه‌ای <-> برنج سفید/کینوا)
 *   3. MEAL_TEMPLATES        - meal *structure* (roles, not fixed grams)
 *   4. SLOT_DISTRIBUTION     - reverse-engineered from a real, verified
 *                              professional diet plan (see below)
 *   5. generateDailyMealPlan - fills each template dynamically per user
 *
 * Every user gets the SAME templates but DIFFERENT gram amounts, because
 * amounts are computed live from that user's own MacroTargets. Two users
 * with different weight/goal/gender will see different portion sizes for
 * the exact same meal structure - that's the point.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  Allergy,
  DailyMealPlan,
  DietaryPreferencesJson,
  FoodItem,
  FoodSubstituteGroup,
  MacroTargets,
  Meal,
  MealComponent,
  MealSlot,
  MealTemplate,
} from '@/types';

// ============================================================================
// 1 - FOOD ITEMS (atomic building blocks)
// ─────────────────────────────────────────────────────────────────────────
// Real per-unit macros. Anything with gramsPerUnit=100 is a "per-100g" food
// (rice, chicken, fish, meat) so units directly represent hundreds of grams.
// Countable foods (eggs, walnuts, bread slices) use their natural unit.
// ============================================================================

const FOOD_ITEMS: FoodItem[] = [
  // -- Protein sources ------------------------------------------------------
  { id: 'egg_white', name: 'سفیده تخم‌مرغ', role: 'protein', emoji: '🥚',
    unitLabel: 'عدد', gramsPerUnit: 33, kcalPerUnit: 17, proteinPerUnit: 3.6, carbsPerUnit: 0.2, fatPerUnit: 0.1,
    allergyFlags: [], excludedForVegetarian: ['vegan'] },

  { id: 'egg_whole', name: 'تخم‌مرغ کامل', role: 'protein', emoji: '🥚',
    unitLabel: 'عدد', gramsPerUnit: 50, kcalPerUnit: 78, proteinPerUnit: 6.3, carbsPerUnit: 0.6, fatPerUnit: 5.3,
    allergyFlags: [], excludedForVegetarian: ['vegan'] },

  { id: 'chicken_breast', name: 'سینه مرغ پخته', role: 'protein', emoji: '🍗',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 165, proteinPerUnit: 31, carbsPerUnit: 0, fatPerUnit: 3.6,
    allergyFlags: [], excludedForVegetarian: ['vegan', 'lacto_ovo', 'raw'] },

  { id: 'grilled_fish', name: 'ماهی کبابی', role: 'protein', emoji: '🐟',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 128, proteinPerUnit: 20, carbsPerUnit: 0, fatPerUnit: 5,
    allergyFlags: ['seafood'], excludedForVegetarian: ['vegan', 'lacto_ovo', 'raw'] },

  { id: 'lean_beef', name: 'گوشت گاو کم‌چرب', role: 'protein', emoji: '🥩',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 175, proteinPerUnit: 26, carbsPerUnit: 0, fatPerUnit: 7,
    allergyFlags: [], excludedForVegetarian: ['vegan', 'lacto_ovo', 'pescatarian', 'raw'] },

  { id: 'ground_beef_lean', name: 'گوشت چرخ‌کرده کم‌چرب', role: 'protein', emoji: '🥩',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 160, proteinPerUnit: 22, carbsPerUnit: 0, fatPerUnit: 8,
    allergyFlags: [], excludedForVegetarian: ['vegan', 'lacto_ovo', 'pescatarian', 'raw'] },

  { id: 'whey_protein', name: 'پودر پروتئین وی', role: 'protein', emoji: '🥤',
    unitLabel: 'اسکوپ', gramsPerUnit: 30, kcalPerUnit: 120, proteinPerUnit: 24, carbsPerUnit: 3, fatPerUnit: 2,
    allergyFlags: ['dairy'], excludedForVegetarian: ['vegan', 'raw'] },

  // Generic pea-protein isolate profile. Kept as a separate plant-based
  // building block so vegan + soy-free plans have a dense protein source
  // instead of violating dietary constraints or exploding calories with legumes.
  { id: 'pea_protein', name: 'پروتئین نخود', role: 'protein', emoji: '🥤',
    unitLabel: 'اسکوپ', gramsPerUnit: 30, kcalPerUnit: 110, proteinPerUnit: 24, carbsPerUnit: 2, fatPerUnit: 1.5,
    allergyFlags: [], excludedForVegetarian: [] },

  { id: 'soy_chunks', name: 'سویا', role: 'protein', emoji: '🫘',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 345, proteinPerUnit: 47, carbsPerUnit: 30, fatPerUnit: 1,
    allergyFlags: ['soy'], excludedForVegetarian: [] },

  { id: 'lentils_cooked', name: 'عدس پخته', role: 'protein', emoji: '🍲',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 116, proteinPerUnit: 9, carbsPerUnit: 20, fatPerUnit: 0.4,
    allergyFlags: [], excludedForVegetarian: [] },

  // -- Starch / carb sources (mutually substitutable) -----------------------
  { id: 'brown_rice_cooked', name: 'برنج قهوه‌ای پخته', role: 'starch', emoji: '🍚',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 112, proteinPerUnit: 2.6, carbsPerUnit: 23, fatPerUnit: 0.9,
    allergyFlags: [], excludedForVegetarian: [] },

  { id: 'white_rice_cooked', name: 'برنج سفید پخته', role: 'starch', emoji: '🍚',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 130, proteinPerUnit: 2.4, carbsPerUnit: 28, fatPerUnit: 0.2,
    allergyFlags: [], excludedForVegetarian: [] },

  { id: 'quinoa_cooked', name: 'کینوا پخته', role: 'starch', emoji: '🍚',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 120, proteinPerUnit: 4.4, carbsPerUnit: 21, fatPerUnit: 1.9,
    allergyFlags: [], excludedForVegetarian: [] },

  { id: 'oats_dry', name: 'جو پرک', role: 'starch', emoji: '🥣',
    unitLabel: 'گرم', gramsPerUnit: 50, kcalPerUnit: 188, proteinPerUnit: 6.5, carbsPerUnit: 32, fatPerUnit: 3.5,
    allergyFlags: ['gluten'], excludedForVegetarian: [] },

  { id: 'whole_grain_toast', name: 'نان تست سبوس‌دار', role: 'starch', emoji: '🍞',
    unitLabel: 'برش', gramsPerUnit: 30, kcalPerUnit: 70, proteinPerUnit: 3, carbsPerUnit: 12, fatPerUnit: 1,
    allergyFlags: ['gluten'], excludedForVegetarian: [] },

  { id: 'boiled_potato', name: 'سیب‌زمینی آب‌پز', role: 'starch', emoji: '🥔',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 87, proteinPerUnit: 2, carbsPerUnit: 20, fatPerUnit: 0.1,
    allergyFlags: [], excludedForVegetarian: [] },

  // -- Vegetables (fixed, low-impact) -----------------------------------------
  { id: 'mixed_salad', name: 'سالاد سبزیجات', role: 'vegetable', emoji: '🥗',
    unitLabel: 'کاسه', gramsPerUnit: 150, kcalPerUnit: 30, proteinPerUnit: 1.5, carbsPerUnit: 6, fatPerUnit: 0.2,
    allergyFlags: [], excludedForVegetarian: [] },

  { id: 'steamed_vegetables', name: 'سبزیجات بخارپز', role: 'vegetable', emoji: '🥦',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 30, proteinPerUnit: 2, carbsPerUnit: 6, fatPerUnit: 0.2,
    allergyFlags: [], excludedForVegetarian: [] },

  { id: 'spinach_borani', name: 'بورانی اسفناج', role: 'vegetable', emoji: '🥬',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 73, proteinPerUnit: 3, carbsPerUnit: 6, fatPerUnit: 4,
    allergyFlags: ['dairy'], excludedForVegetarian: [] },

  // -- Fats --------------------------------------------------------------------
  { id: 'olive_oil', name: 'روغن زیتون', role: 'fat', emoji: '🫒',
    unitLabel: 'قاشق', gramsPerUnit: 14, kcalPerUnit: 119, proteinPerUnit: 0, carbsPerUnit: 0, fatPerUnit: 14,
    allergyFlags: [], excludedForVegetarian: [] },

  { id: 'walnut', name: 'گردو', role: 'fat', emoji: '🌰',
    unitLabel: 'عدد', gramsPerUnit: 6, kcalPerUnit: 39, proteinPerUnit: 0.9, carbsPerUnit: 0.8, fatPerUnit: 3.9,
    allergyFlags: ['peanut'], excludedForVegetarian: [] },

  { id: 'mixed_nuts', name: 'آجیل خام', role: 'fat', emoji: '🥜',
    unitLabel: 'گرم', gramsPerUnit: 25, kcalPerUnit: 157, proteinPerUnit: 5, carbsPerUnit: 5, fatPerUnit: 13,
    allergyFlags: ['peanut'], excludedForVegetarian: [] },

  { id: 'avocado_half', name: 'آووکادو', role: 'fat', emoji: '🥑',
    unitLabel: 'عدد', gramsPerUnit: 75, kcalPerUnit: 120, proteinPerUnit: 1.5, carbsPerUnit: 6, fatPerUnit: 11,
    allergyFlags: [], excludedForVegetarian: [] },

  // -- Dairy ---------------------------------------------------------------
  { id: 'low_fat_cheese', name: 'پنیر کم‌چرب', role: 'dairy', emoji: '🧀',
    unitLabel: 'گرم', gramsPerUnit: 30, kcalPerUnit: 46, proteinPerUnit: 6, carbsPerUnit: 1, fatPerUnit: 2,
    allergyFlags: ['dairy'], excludedForVegetarian: ['vegan'] },

  { id: 'low_fat_milk', name: 'شیر کم‌چرب', role: 'dairy', emoji: '🥛',
    unitLabel: 'لیوان', gramsPerUnit: 250, kcalPerUnit: 102, proteinPerUnit: 8, carbsPerUnit: 12, fatPerUnit: 2,
    allergyFlags: ['dairy'], excludedForVegetarian: ['vegan'] },

  { id: 'low_fat_yogurt', name: 'ماست کم‌چرب', role: 'dairy', emoji: '🥣',
    unitLabel: 'گرم', gramsPerUnit: 100, kcalPerUnit: 45, proteinPerUnit: 5, carbsPerUnit: 6, fatPerUnit: 0.5,
    allergyFlags: ['dairy'], excludedForVegetarian: ['vegan'] },

  // -- Fruit -----------------------------------------------------------------
  { id: 'apple', name: 'سیب', role: 'fruit', emoji: '🍎',
    unitLabel: 'عدد', gramsPerUnit: 150, kcalPerUnit: 78, proteinPerUnit: 0.4, carbsPerUnit: 21, fatPerUnit: 0.3,
    allergyFlags: [], excludedForVegetarian: [] },

  { id: 'banana', name: 'موز', role: 'fruit', emoji: '🍌',
    unitLabel: 'عدد', gramsPerUnit: 120, kcalPerUnit: 107, proteinPerUnit: 1.3, carbsPerUnit: 27, fatPerUnit: 0.4,
    allergyFlags: [], excludedForVegetarian: [] },
];

const foodById = (id: string): FoodItem => {
  const f = FOOD_ITEMS.find((x) => x.id === id);
  if (!f) throw new Error(`[mealPlanEngine] Unknown food item id: ${id}`);
  return f;
};

// ============================================================================
// 2 - SUBSTITUTION GROUPS
// ─────────────────────────────────────────────────────────────────────────
// Swapping stays within the same FoodRole so the meal's balance barely
// shifts. This is the exact mechanism the user asked for: "برنج قهوه‌ای
// نخوره، پس باید معادلش رو بهش بده".
// ============================================================================

export const FOOD_SUBSTITUTES: FoodSubstituteGroup[] = [
  { foodItemId: 'brown_rice_cooked', substituteIds: ['white_rice_cooked', 'quinoa_cooked', 'boiled_potato'] },
  { foodItemId: 'white_rice_cooked', substituteIds: ['brown_rice_cooked', 'quinoa_cooked', 'boiled_potato'] },
  { foodItemId: 'quinoa_cooked', substituteIds: ['brown_rice_cooked', 'white_rice_cooked'] },
  { foodItemId: 'chicken_breast', substituteIds: ['grilled_fish', 'lean_beef', 'ground_beef_lean'] },
  { foodItemId: 'grilled_fish', substituteIds: ['chicken_breast', 'lean_beef'] },
  { foodItemId: 'lean_beef', substituteIds: ['chicken_breast', 'grilled_fish', 'ground_beef_lean'] },
  { foodItemId: 'whey_protein', substituteIds: ['pea_protein'] },
  { foodItemId: 'pea_protein', substituteIds: ['whey_protein'] },
  { foodItemId: 'egg_white', substituteIds: ['egg_whole'] },
  { foodItemId: 'egg_whole', substituteIds: ['egg_white'] },
  { foodItemId: 'low_fat_milk', substituteIds: ['low_fat_yogurt'] },
  { foodItemId: 'low_fat_yogurt', substituteIds: ['low_fat_milk'] },
  { foodItemId: 'walnut', substituteIds: ['mixed_nuts', 'avocado_half'] },
  { foodItemId: 'mixed_nuts', substituteIds: ['walnut', 'avocado_half'] },
  { foodItemId: 'apple', substituteIds: ['banana'] },
  { foodItemId: 'banana', substituteIds: ['apple'] },
];

export function getSubstitutesFor(foodItemId: string): FoodItem[] {
  const group = FOOD_SUBSTITUTES.find((g) => g.foodItemId === foodItemId);
  if (!group) return [];
  return group.substituteIds.map(foodById);
}

// ============================================================================
// 3 - MEAL TEMPLATES
// ============================================================================
// Templates define meal composition, not final portion sizes. In v2 every
// component is portion-optimized against the meal's calorie + macro budget.
// `dynamicUnits` and `fixedUnits` are retained for compatibility and as a
// nominal portion hint, but fixed foods are no longer scaled by body weight.

const MEAL_TEMPLATES: MealTemplate[] = [
  // Breakfast
  {
    id: 'bk_eggs_toast', slot: 'breakfast', displayName: 'تخم‌مرغ و نان تست سبوس‌دار',
    slots: [
      { role: 'protein', primaryFoodItemId: 'egg_white', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'whole_grain_toast', dynamicUnits: false, fixedUnits: 2 },
      { role: 'dairy', primaryFoodItemId: 'low_fat_cheese', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'walnut', dynamicUnits: false, fixedUnits: 2 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'bk_oats_banana', slot: 'breakfast', displayName: 'جو پرک با موز و شیر',
    slots: [
      { role: 'starch', primaryFoodItemId: 'oats_dry', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fruit', primaryFoodItemId: 'banana', dynamicUnits: false, fixedUnits: 1 },
      { role: 'dairy', primaryFoodItemId: 'low_fat_milk', dynamicUnits: false, fixedUnits: 1 },
      { role: 'protein', primaryFoodItemId: 'whey_protein', dynamicUnits: true },
      { role: 'fat', primaryFoodItemId: 'walnut', dynamicUnits: false, fixedUnits: 2 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  // Universal allergy-friendly / vegan-safe fallback
  {
    id: 'bk_lentil_apple', slot: 'breakfast', displayName: 'عدسی و سیب',
    slots: [
      { role: 'protein', primaryFoodItemId: 'lentils_cooked', dynamicUnits: true },
      { role: 'fruit', primaryFoodItemId: 'apple', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'avocado_half', dynamicUnits: false, fixedUnits: 0.5 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  {
    id: 'bk_pea_banana', slot: 'breakfast', displayName: 'شیک پروتئین نخود با موز',
    slots: [
      { role: 'protein', primaryFoodItemId: 'pea_protein', dynamicUnits: true },
      { role: 'fruit', primaryFoodItemId: 'banana', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'avocado_half', dynamicUnits: false, fixedUnits: 0.5 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  // Morning snack
  {
    id: 'ms_whey_milk', slot: 'morning_snack', displayName: 'پروتئین وی با شیر کم‌چرب',
    slots: [
      { role: 'protein', primaryFoodItemId: 'whey_protein', dynamicUnits: true },
      { role: 'dairy', primaryFoodItemId: 'low_fat_milk', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: true, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'ms_lentil_apple', slot: 'morning_snack', displayName: 'عدسی و سیب',
    slots: [
      { role: 'protein', primaryFoodItemId: 'lentils_cooked', dynamicUnits: true },
      { role: 'fruit', primaryFoodItemId: 'apple', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  {
    id: 'ms_pea_apple', slot: 'morning_snack', displayName: 'پروتئین نخود و سیب',
    slots: [
      { role: 'protein', primaryFoodItemId: 'pea_protein', dynamicUnits: true },
      { role: 'fruit', primaryFoodItemId: 'apple', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  // Lunch
  {
    id: 'ln_chicken_rice', slot: 'lunch', displayName: 'سینه مرغ با برنج قهوه‌ای',
    slots: [
      { role: 'protein', primaryFoodItemId: 'chicken_breast', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'brown_rice_cooked', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'mixed_salad', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'olive_oil', dynamicUnits: false, fixedUnits: 0.5 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'ln_fish_rice', slot: 'lunch', displayName: 'ماهی کبابی با برنج قهوه‌ای',
    slots: [
      { role: 'protein', primaryFoodItemId: 'grilled_fish', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'brown_rice_cooked', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'mixed_salad', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'ln_beef_lentil_rice', slot: 'lunch', displayName: 'عدس‌پلو با گوشت چرخ‌کرده',
    slots: [
      { role: 'protein', primaryFoodItemId: 'ground_beef_lean', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'brown_rice_cooked', dynamicUnits: false, fixedUnits: 1 },
      { role: 'vegetable', primaryFoodItemId: 'steamed_vegetables', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'ln_soy_rice', slot: 'lunch', displayName: 'برنج با سویا',
    slots: [
      { role: 'protein', primaryFoodItemId: 'soy_chunks', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'white_rice_cooked', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'mixed_salad', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, maxPerWeek: 2, goalTags: [],
  },
  {
    id: 'ln_lentil_rice', slot: 'lunch', displayName: 'عدس و برنج با سالاد',
    slots: [
      { role: 'protein', primaryFoodItemId: 'pea_protein', dynamicUnits: true },
      { role: 'protein', primaryFoodItemId: 'lentils_cooked', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'brown_rice_cooked', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'mixed_salad', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'olive_oil', dynamicUnits: false, fixedUnits: 0.5 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  // Afternoon snack
  {
    id: 'as_potato_chicken', slot: 'afternoon_snack', displayName: 'سیب‌زمینی و فیله مرغ',
    slots: [
      { role: 'starch', primaryFoodItemId: 'boiled_potato', dynamicUnits: true },
      { role: 'protein', primaryFoodItemId: 'chicken_breast', dynamicUnits: true },
    ],
    isWorkoutDayOnly: true, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'as_whey_nuts', slot: 'afternoon_snack', displayName: 'پروتئین وی و آجیل',
    slots: [
      { role: 'protein', primaryFoodItemId: 'whey_protein', dynamicUnits: true },
      { role: 'fat', primaryFoodItemId: 'mixed_nuts', dynamicUnits: false, fixedUnits: 0.5 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: true, goalTags: [],
  },
  {
    id: 'as_potato_lentil', slot: 'afternoon_snack', displayName: 'سیب‌زمینی و عدسی',
    slots: [
      { role: 'starch', primaryFoodItemId: 'boiled_potato', dynamicUnits: true },
      { role: 'protein', primaryFoodItemId: 'lentils_cooked', dynamicUnits: true },
      { role: 'fat', primaryFoodItemId: 'olive_oil', dynamicUnits: false, fixedUnits: 0.25 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  {
    id: 'as_pea_potato', slot: 'afternoon_snack', displayName: 'پروتئین نخود و سیب‌زمینی',
    slots: [
      { role: 'protein', primaryFoodItemId: 'pea_protein', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'boiled_potato', dynamicUnits: true },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  // Dinner
  {
    id: 'dn_chicken_veg', slot: 'dinner', displayName: 'سینه مرغ با سبزیجات و نان تست',
    slots: [
      { role: 'protein', primaryFoodItemId: 'chicken_breast', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'steamed_vegetables', dynamicUnits: false, fixedUnits: 1 },
      { role: 'starch', primaryFoodItemId: 'whole_grain_toast', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'olive_oil', dynamicUnits: false, fixedUnits: 0.5 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'dn_beef_cheese', slot: 'dinner', displayName: 'استیک گوشت با پنیر کم‌چرب',
    slots: [
      { role: 'protein', primaryFoodItemId: 'lean_beef', dynamicUnits: true },
      { role: 'dairy', primaryFoodItemId: 'low_fat_cheese', dynamicUnits: false, fixedUnits: 1 },
      { role: 'starch', primaryFoodItemId: 'whole_grain_toast', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'dn_chicken_spinach_yogurt', slot: 'dinner', displayName: 'فیله مرغ با بورانی اسفناج و ماست',
    slots: [
      { role: 'protein', primaryFoodItemId: 'chicken_breast', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'spinach_borani', dynamicUnits: false, fixedUnits: 1 },
      { role: 'dairy', primaryFoodItemId: 'low_fat_yogurt', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'dn_fish_potato', slot: 'dinner', displayName: 'ماهی کبابی با سیب‌زمینی',
    slots: [
      { role: 'protein', primaryFoodItemId: 'grilled_fish', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'boiled_potato', dynamicUnits: true },
      { role: 'fat', primaryFoodItemId: 'mixed_nuts', dynamicUnits: false, fixedUnits: 0.5 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'dn_lentil_rice_veg', slot: 'dinner', displayName: 'عدس و برنج با سبزیجات',
    slots: [
      { role: 'protein', primaryFoodItemId: 'pea_protein', dynamicUnits: true },
      { role: 'protein', primaryFoodItemId: 'lentils_cooked', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'brown_rice_cooked', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'steamed_vegetables', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'olive_oil', dynamicUnits: false, fixedUnits: 0.25 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  // Night snack
  {
    id: 'ns_milk', slot: 'night_snack', displayName: 'شیر کم‌چرب',
    slots: [
      { role: 'dairy', primaryFoodItemId: 'low_fat_milk', dynamicUnits: true },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'ns_apple', slot: 'night_snack', displayName: 'سیب',
    slots: [
      { role: 'fruit', primaryFoodItemId: 'apple', dynamicUnits: true },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'ns_pea', slot: 'night_snack', displayName: 'نیم‌اسکوپ پروتئین نخود',
    slots: [
      { role: 'protein', primaryFoodItemId: 'pea_protein', dynamicUnits: true },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
];

// ============================================================================
// 4 - SLOT DISTRIBUTION
// ============================================================================

interface SlotShare {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const SLOT_DISTRIBUTION: Record<MealSlot, SlotShare> = {
  breakfast:        { kcal: 0.20, protein: 0.21, carbs: 0.14, fat: 0.26 },
  morning_snack:    { kcal: 0.11, protein: 0.15, carbs: 0.08, fat: 0.08 },
  lunch:            { kcal: 0.34, protein: 0.26, carbs: 0.40, fat: 0.38 },
  afternoon_snack:  { kcal: 0.12, protein: 0.12, carbs: 0.18, fat: 0.04 },
  dinner:           { kcal: 0.18, protein: 0.22, carbs: 0.14, fat: 0.20 },
  night_snack:      { kcal: 0.05, protein: 0.04, carbs: 0.06, fat: 0.04 },
};

const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'صبحانه',
  morning_snack: 'میان‌وعده صبح',
  lunch: 'ناهار',
  afternoon_snack: 'میان‌وعده عصر',
  dinner: 'شام',
  night_snack: 'قبل از خواب',
};

const SLOT_ORDER: MealSlot[] = [
  'breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'night_snack',
];

// ============================================================================
// 5 - DIETARY FILTERING — fail closed
// ============================================================================

function isFoodAllowed(food: FoodItem, preferences: DietaryPreferencesJson): boolean {
  return (
    !food.allergyFlags.some((a: Allergy) => preferences.allergies.includes(a)) &&
    !food.excludedForVegetarian.includes(preferences.vegetarianStatus)
  );
}

function isTemplateEligible(
  template: MealTemplate,
  preferences: DietaryPreferencesJson,
  isWorkoutDay: boolean
): boolean {
  if (template.isWorkoutDayOnly && !isWorkoutDay) return false;
  if (template.isRestDayOnly && isWorkoutDay) return false;
  return template.slots.every((slotFill) => isFoodAllowed(foodById(slotFill.primaryFoodItemId), preferences));
}

export class MealPlanGenerationError extends Error {
  slot: MealSlot;

  constructor(slot: MealSlot, message: string) {
    super(message);
    this.name = 'MealPlanGenerationError';
    this.slot = slot;
  }
}

// ============================================================================
// 6 - PORTION OPTIMIZER
// ============================================================================

type MacroVector = { kcal: number; protein: number; carbs: number; fat: number };

type ResolvedTemplate = {
  components: MealComponent[];
  totals: MacroVector;
  score: number;
  kcalDeviation: number;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function componentFromUnits(food: FoodItem, units: number): MealComponent {
  return {
    foodItem: food,
    units: round2(units),
    grams: Math.round(units * food.gramsPerUnit),
    kcal: Math.round(units * food.kcalPerUnit),
    protein: round1(units * food.proteinPerUnit),
    carbs: round1(units * food.carbsPerUnit),
    fat: round1(units * food.fatPerUnit),
  };
}

function addTotals(a: MacroVector, b: MealComponent): MacroVector {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

function range(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let value = min; value <= max + 1e-9; value += step) {
    out.push(round2(value));
  }
  return out;
}

/**
 * Plausible portion candidates. These bounds are intentionally conservative:
 * the optimizer may choose among them, but cannot invent a 600g steak or 12
 * scoops of whey simply to satisfy a macro target.
 */
function portionCandidates(food: FoodItem, target?: MacroVector): number[] {
  let min = 0.5;
  let baseMax = 2;
  let hardMax = 3;
  let step = 0.5;

  switch (food.id) {
    case 'egg_white': min = 1; baseMax = 8; hardMax = 12; step = 1; break;
    case 'egg_whole': min = 1; baseMax = 3; hardMax = 5; step = 1; break;
    case 'whole_grain_toast': min = 1; baseMax = 3; hardMax = 6; step = 1; break;
    case 'walnut': min = 1; baseMax = 4; hardMax = 8; step = 1; break;
    case 'apple':
    case 'banana':
      min = 0.5; baseMax = 1.5; hardMax = 2.5; step = 0.5; break;
    case 'avocado_half': min = 0.5; baseMax = 1.5; hardMax = 3; step = 0.5; break;
    case 'olive_oil': min = 0.25; baseMax = 1; hardMax = 3; step = 0.25; break;
    case 'whey_protein':
    case 'pea_protein': min = 0.25; baseMax = 2; hardMax = 3; step = 0.25; break;
    case 'low_fat_milk': min = 0.5; baseMax = 1.5; hardMax = 3; step = 0.5; break;
    case 'mixed_nuts': min = 0.25; baseMax = 1; hardMax = 2; step = 0.25; break;
    case 'oats_dry': min = 0.5; baseMax = 1.5; hardMax = 3; step = 0.25; break;
    case 'low_fat_cheese': min = 0.5; baseMax = 1.5; hardMax = 3; step = 0.5; break;
    case 'soy_chunks': min = 0.25; baseMax = 1; hardMax = 2.5; step = 0.25; break;
    case 'lentils_cooked': min = 0.25; baseMax = 2.5; hardMax = 5; step = 0.25; break;
    case 'low_fat_yogurt': min = 0.5; baseMax = 2; hardMax = 4; step = 0.5; break;
    case 'spinach_borani': min = 0.5; baseMax = 1.5; hardMax = 3; step = 0.5; break;
    default:
      if (food.role === 'protein') { min = 0.25; baseMax = 2; hardMax = 4; step = 0.25; }
      else if (food.role === 'starch') { min = 0.5; baseMax = 2.5; hardMax = 7; step = 0.25; }
      else if (food.role === 'vegetable') { min = 0.5; baseMax = 2; hardMax = 4; step = 0.5; }
      else if (food.role === 'dairy') { min = 0.5; baseMax = 2; hardMax = 4; step = 0.5; }
      else if (food.role === 'fat') { min = 0.25; baseMax = 1; hardMax = 3; step = 0.25; }
      else { min = 0.5; baseMax = 1.5; hardMax = 2.5; step = 0.5; }
  }

  if (!target) return range(min, baseMax, step);

  let desiredUnits = baseMax;
  if (food.role === 'starch' && food.carbsPerUnit > 0) {
    desiredUnits = target.carbs / food.carbsPerUnit;
  } else if (food.role === 'fat' && food.fatPerUnit > 0) {
    desiredUnits = target.fat / food.fatPerUnit;
  } else if (food.role === 'protein' && food.proteinPerUnit > 0) {
    desiredUnits = target.protein / food.proteinPerUnit;
  } else if (food.role === 'dairy' && food.proteinPerUnit > 0) {
    desiredUnits = target.protein / food.proteinPerUnit;
  } else if (food.role === 'fruit' && food.carbsPerUnit > 0) {
    desiredUnits = target.carbs / food.carbsPerUnit;
  }

  const adaptiveMax = Math.min(hardMax, Math.max(baseMax, desiredUnits * 1.25));
  const snappedMax = Math.max(min, Math.floor(adaptiveMax / step) * step);
  return range(min, snappedMax, step);
}

function normalizedDeviation(actual: number, target: number): number {
  return Math.abs(actual - target) / Math.max(1, target);
}

/**
 * Energy gets the strongest weight. Macro targets guide composition, but an
 * individual meal is never allowed to chase protein/carbs by blowing through
 * its calorie budget. A sharp overshoot penalty begins above +5%.
 */
function scoreTotals(actual: MacroVector, target: MacroVector): number {
  const kcalDev = normalizedDeviation(actual.kcal, target.kcal);
  const proteinDev = normalizedDeviation(actual.protein, target.protein);
  const carbDev = normalizedDeviation(actual.carbs, target.carbs);
  const fatDev = normalizedDeviation(actual.fat, target.fat);

  const kcalOverRatio = Math.max(0, actual.kcal / Math.max(1, target.kcal) - 1);
  const severeOver = Math.max(0, kcalOverRatio - 0.05);
  const proteinUnder = Math.max(0, target.protein - actual.protein) / Math.max(1, target.protein);

  return (
    7 * kcalDev +
    2.25 * proteinDev +
    1.1 * carbDev +
    1.1 * fatDev +
    20 * kcalOverRatio * kcalOverRatio +
    60 * severeOver * severeOver +
    0.75 * proteinUnder
  );
}

function resolveTemplate(template: MealTemplate, slotTargets: MacroVector): ResolvedTemplate {
  const foods = template.slots.map((slotFill) => foodById(slotFill.primaryFoodItemId));
  const candidateSets = foods.map((food) => portionCandidates(food, slotTargets));

  type Bounds = { min: MacroVector; max: MacroVector };
  const remainingBounds: Bounds[] = Array.from({ length: foods.length + 1 }, () => ({
    min: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    max: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  }));

  // For each suffix, compute the independent min/max contribution still
  // available. This lets the beam keep states that can still reach the target
  // instead of greedily preferring whichever food appears first.
  for (let i = foods.length - 1; i >= 0; i--) {
    const components = candidateSets[i].map((units) => componentFromUnits(foods[i], units));
    const minComp: MacroVector = {
      kcal: Math.min(...components.map((c) => c.kcal)),
      protein: Math.min(...components.map((c) => c.protein)),
      carbs: Math.min(...components.map((c) => c.carbs)),
      fat: Math.min(...components.map((c) => c.fat)),
    };
    const maxComp: MacroVector = {
      kcal: Math.max(...components.map((c) => c.kcal)),
      protein: Math.max(...components.map((c) => c.protein)),
      carbs: Math.max(...components.map((c) => c.carbs)),
      fat: Math.max(...components.map((c) => c.fat)),
    };
    remainingBounds[i] = {
      min: {
        kcal: minComp.kcal + remainingBounds[i + 1].min.kcal,
        protein: minComp.protein + remainingBounds[i + 1].min.protein,
        carbs: minComp.carbs + remainingBounds[i + 1].min.carbs,
        fat: minComp.fat + remainingBounds[i + 1].min.fat,
      },
      max: {
        kcal: maxComp.kcal + remainingBounds[i + 1].max.kcal,
        protein: maxComp.protein + remainingBounds[i + 1].max.protein,
        carbs: maxComp.carbs + remainingBounds[i + 1].max.carbs,
        fat: maxComp.fat + remainingBounds[i + 1].max.fat,
      },
    };
  }

  const boundDeviation = (current: number, minRemaining: number, maxRemaining: number, target: number) => {
    const minPossible = current + minRemaining;
    const maxPossible = current + maxRemaining;
    if (target < minPossible) return (minPossible - target) / Math.max(1, target);
    if (target > maxPossible) return (target - maxPossible) / Math.max(1, target);
    return 0;
  };

  const lowerBoundScore = (totals: MacroVector, remaining: Bounds): number => {
    const kcalDev = boundDeviation(totals.kcal, remaining.min.kcal, remaining.max.kcal, slotTargets.kcal);
    const proteinDev = boundDeviation(totals.protein, remaining.min.protein, remaining.max.protein, slotTargets.protein);
    const carbDev = boundDeviation(totals.carbs, remaining.min.carbs, remaining.max.carbs, slotTargets.carbs);
    const fatDev = boundDeviation(totals.fat, remaining.min.fat, remaining.max.fat, slotTargets.fat);
    const alreadyOver = Math.max(0, totals.kcal / Math.max(1, slotTargets.kcal) - 1.05);
    return 7 * kcalDev + 2.25 * proteinDev + 1.1 * carbDev + 1.1 * fatDev + 50 * alreadyOver * alreadyOver;
  };

  type BeamState = { components: MealComponent[]; totals: MacroVector };
  const BEAM_WIDTH = 120;
  let beam: BeamState[] = [{ components: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } }];

  for (let index = 0; index < foods.length; index++) {
    const food = foods[index];
    const expanded: BeamState[] = [];

    for (const state of beam) {
      for (const units of candidateSets[index]) {
        const component = componentFromUnits(food, units);
        const totals = addTotals(state.totals, component);

        // Remaining components only add positive calories; branches already far
        // above the slot budget cannot recover.
        if (totals.kcal > slotTargets.kcal * 1.35 && index < foods.length - 1) continue;
        expanded.push({ components: [...state.components, component], totals });
      }
    }

    const remaining = remainingBounds[index + 1];
    expanded.sort((a, b) => lowerBoundScore(a.totals, remaining) - lowerBoundScore(b.totals, remaining));
    beam = expanded.slice(0, BEAM_WIDTH);
  }

  if (beam.length === 0) {
    throw new Error(`[mealPlanEngine] Could not resolve template ${template.id}`);
  }

  beam.sort((a, b) => {
    const aOver = a.totals.kcal > slotTargets.kcal * 1.05 ? 1 : 0;
    const bOver = b.totals.kcal > slotTargets.kcal * 1.05 ? 1 : 0;
    if (aOver !== bOver) return aOver - bOver;
    return scoreTotals(a.totals, slotTargets) - scoreTotals(b.totals, slotTargets);
  });

  const best = beam[0];
  const bestScore = scoreTotals(best.totals, slotTargets);

  return {
    components: best.components,
    totals: {
      kcal: Math.round(best.totals.kcal),
      protein: round1(best.totals.protein),
      carbs: round1(best.totals.carbs),
      fat: round1(best.totals.fat),
    },
    score: bestScore,
    kcalDeviation: normalizedDeviation(best.totals.kcal, slotTargets.kcal),
  };
}

// ============================================================================
// 7 - DETERMINISTIC VARIETY
// ============================================================================

function dateSeed(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

type ResolvedOption = {
  slot: MealSlot;
  template: MealTemplate;
  resolved: ResolvedTemplate;
};

function getResolvedOptions(
  slot: MealSlot,
  candidates: MealTemplate[],
  slotTargets: MacroVector
): ResolvedOption[] {
  const ranked = candidates
    .map((template) => ({ slot, template, resolved: resolveTemplate(template, slotTargets) }))
    .sort((a, b) => a.resolved.score - b.resolved.score);

  if (ranked.length === 0) {
    throw new Error('[mealPlanEngine] No candidate templates to rank.');
  }

  // Keep every eligible template in the day-level frontier. Some options are
  // intentionally a poor fit for the slot in isolation (for example a lean
  // protein night snack), but can be exactly what the whole day needs after
  // global portion refinement. With the current catalog this is at most five
  // options per slot, so the search remains bounded.
  return ranked;
}

function buildMeal(option: ResolvedOption): Meal {
  const { slot, template, resolved } = option;
  return {
    slot,
    label: MEAL_SLOT_LABELS[slot],
    templateId: template.id,
    templateName: template.displayName,
    components: resolved.components,
    totalKcal: resolved.totals.kcal,
    totalProtein: resolved.totals.protein,
    totalCarbs: resolved.totals.carbs,
    totalFat: resolved.totals.fat,
    consumed: false,
  };
}

function scoreDailyTotals(actual: MacroVector, target: MacroVector): number {
  const kcalDev = normalizedDeviation(actual.kcal, target.kcal);
  const proteinDev = normalizedDeviation(actual.protein, target.protein);
  const carbDev = normalizedDeviation(actual.carbs, target.carbs);
  const fatDev = normalizedDeviation(actual.fat, target.fat);
  const kcalOverRatio = Math.max(0, actual.kcal / Math.max(1, target.kcal) - 1);
  const severeOver = Math.max(0, kcalOverRatio - 0.03);
  const proteinUnder = Math.max(0, target.protein - actual.protein) / Math.max(1, target.protein);

  return (
    8.5 * kcalDev +
    4 * proteinDev +
    4 * carbDev +
    3 * fatDev +
    24 * kcalOverRatio * kcalOverRatio +
    80 * severeOver * severeOver +
    1.5 * proteinUnder
  );
}

function chooseDailyCombination(
  optionsBySlot: ResolvedOption[][],
  targets: MacroTargets,
  seed: number
): ResolvedOption[] {
  const dailyTarget: MacroVector = {
    kcal: targets.targetCalories,
    protein: targets.proteinGrams,
    carbs: targets.carbGrams,
    fat: targets.fatGrams,
  };

  type CandidateDay = {
    options: ResolvedOption[];
    totals: MacroVector;
    score: number;
  };

  const candidates: CandidateDay[] = [];

  const walk = (
    slotIndex: number,
    chosen: ResolvedOption[],
    totals: MacroVector,
    localScoreSum: number
  ) => {
    if (slotIndex === optionsBySlot.length) {
      const dailyScore = scoreDailyTotals(totals, dailyTarget);
      // Daily fit dominates. The small local term prevents pathological meal
      // composition when two day-level solutions are nearly identical.
      const score = dailyScore + 0.02 * localScoreSum;
      candidates.push({ options: chosen, totals, score });
      return;
    }

    for (const option of optionsBySlot[slotIndex]) {
      const nextTotals: MacroVector = {
        kcal: totals.kcal + option.resolved.totals.kcal,
        protein: totals.protein + option.resolved.totals.protein,
        carbs: totals.carbs + option.resolved.totals.carbs,
        fat: totals.fat + option.resolved.totals.fat,
      };
      walk(
        slotIndex + 1,
        [...chosen, option],
        nextTotals,
        localScoreSum + option.resolved.score
      );
    }
  };

  walk(0, [], { kcal: 0, protein: 0, carbs: 0, fat: 0 }, 0);
  candidates.sort((a, b) => a.score - b.score);

  const best = candidates[0];
  if (!best) throw new Error('[mealPlanEngine] Could not build a daily combination.');

  // Correctness beats variety. Only rotate among effectively tied solutions;
  // otherwise always choose the mathematically best day.
  const tied = candidates.filter((candidate) =>
    Math.abs(candidate.score - best.score) < 0.005 &&
    candidate.totals.kcal <= dailyTarget.kcal * 1.03
  );

  return (tied.length > 0 ? tied[seed % tied.length] : best).options;
}

function subtractComponent(total: MacroVector, component: MealComponent): MacroVector {
  return {
    kcal: total.kcal - component.kcal,
    protein: total.protein - component.protein,
    carbs: total.carbs - component.carbs,
    fat: total.fat - component.fat,
  };
}

function addVector(a: MacroVector, b: MacroVector): MacroVector {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

/**
 * Second-stage day-wide portion refinement.
 *
 * The template resolver optimizes each meal against its own slot budget. That is
 * necessary for meal quality, but small per-slot rounding/food-composition errors
 * can stack in the same direction over six meals. This pass keeps the selected
 * foods/templates fixed and only nudges legal portion sizes to improve the whole
 * day's calorie + macro fit.
 */
function refineDailyPortions(
  chosen: ResolvedOption[],
  targets: MacroTargets
): ResolvedOption[] {
  const dailyTarget: MacroVector = {
    kcal: targets.targetCalories,
    protein: targets.proteinGrams,
    carbs: targets.carbGrams,
    fat: targets.fatGrams,
  };

  const refined = chosen.map((option) => ({
    ...option,
    resolved: {
      ...option.resolved,
      components: option.resolved.components.map((component) => ({ ...component })),
      totals: { ...option.resolved.totals },
    },
  }));

  let dailyTotals = refined.reduce<MacroVector>(
    (acc, option) => addVector(acc, option.resolved.totals),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const combinedScore = (
    candidateDaily: MacroVector,
    candidateMeal: MacroVector,
    slotTarget: MacroVector
  ) => {
    const kcalRatio = candidateMeal.kcal / Math.max(1, slotTarget.kcal);
    if (kcalRatio < 0.55 || kcalRatio > 1.35) return Number.POSITIVE_INFINITY;
    return scoreDailyTotals(candidateDaily, dailyTarget) + 0.035 * scoreTotals(candidateMeal, slotTarget);
  };

  // Coordinate descent is deterministic and cheap here: ~20 components × a
  // small candidate list × four passes. Stop early when a full pass is stable.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;

    for (const option of refined) {
      const share = SLOT_DISTRIBUTION[option.slot];
      const slotTarget: MacroVector = {
        kcal: dailyTarget.kcal * share.kcal,
        protein: dailyTarget.protein * share.protein,
        carbs: dailyTarget.carbs * share.carbs,
        fat: dailyTarget.fat * share.fat,
      };

      for (let index = 0; index < option.resolved.components.length; index++) {
        const current = option.resolved.components[index];
        const withoutCurrentMeal = subtractComponent(option.resolved.totals, current);
        const withoutCurrentDay = subtractComponent(dailyTotals, current);

        let bestComponent = current;
        let bestMeal = option.resolved.totals;
        let bestDay = dailyTotals;
        let bestScore = combinedScore(dailyTotals, option.resolved.totals, slotTarget);

        for (const units of portionCandidates(current.foodItem, slotTarget)) {
          const candidateComponent = componentFromUnits(current.foodItem, units);
          const candidateMeal = addTotals(withoutCurrentMeal, candidateComponent);
          const candidateDay = addTotals(withoutCurrentDay, candidateComponent);
          const candidateScore = combinedScore(candidateDay, candidateMeal, slotTarget);

          if (candidateScore + 1e-9 < bestScore) {
            bestScore = candidateScore;
            bestComponent = candidateComponent;
            bestMeal = candidateMeal;
            bestDay = candidateDay;
          }
        }

        if (bestComponent.units !== current.units) {
          option.resolved.components[index] = bestComponent;
          option.resolved.totals = bestMeal;
          dailyTotals = bestDay;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  for (const option of refined) {
    option.resolved.totals = {
      kcal: Math.round(option.resolved.totals.kcal),
      protein: round1(option.resolved.totals.protein),
      carbs: round1(option.resolved.totals.carbs),
      fat: round1(option.resolved.totals.fat),
    };
  }

  return refined;
}

function totalResolvedOptions(options: ResolvedOption[]): MacroVector {
  return options.reduce<MacroVector>(
    (acc, option) => addVector(acc, option.resolved.totals),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/**
 * Coordinate descent can perfect portions inside a chosen template set, but it
 * cannot replace a structurally carb-heavy snack with a protein/fat-heavier one.
 * This deterministic local search tries one template replacement per slot and
 * re-runs portion refinement, keeping a replacement only when the whole day's
 * macro score improves.
 */
function refineDailyTemplates(
  initial: ResolvedOption[],
  optionsBySlot: ResolvedOption[][],
  targets: MacroTargets
): ResolvedOption[] {
  const dailyTarget: MacroVector = {
    kcal: targets.targetCalories,
    protein: targets.proteinGrams,
    carbs: targets.carbGrams,
    fat: targets.fatGrams,
  };

  let best = refineDailyPortions(initial, targets);
  let bestScore = scoreDailyTotals(totalResolvedOptions(best), dailyTarget);

  for (let pass = 0; pass < 2; pass++) {
    let changed = false;

    for (let slotIndex = 0; slotIndex < optionsBySlot.length; slotIndex++) {
      let slotBest = best;
      let slotBestScore = bestScore;

      for (const replacement of optionsBySlot[slotIndex]) {
        if (replacement.template.id === best[slotIndex].template.id) continue;
        const candidateBase = best.map((option, index) =>
          index === slotIndex ? replacement : option
        );
        const candidate = refineDailyPortions(candidateBase, targets);
        const candidateScore = scoreDailyTotals(totalResolvedOptions(candidate), dailyTarget);

        if (candidateScore + 1e-9 < slotBestScore) {
          slotBest = candidate;
          slotBestScore = candidateScore;
        }
      }

      if (slotBest !== best) {
        best = slotBest;
        bestScore = slotBestScore;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return best;
}

// ============================================================================
// 8 - MAIN ENTRY POINT
// ============================================================================

export function generateDailyMealPlan(
  targets: MacroTargets,
  _weightKg: number,
  preferences: DietaryPreferencesJson,
  isWorkoutDay: boolean,
  date: string = new Date().toISOString().slice(0, 10)
): DailyMealPlan {
  const seed = dateSeed(date);

  const optionsBySlot: ResolvedOption[][] = SLOT_ORDER.map((slot) => {
    const share = SLOT_DISTRIBUTION[slot];
    const slotTargets: MacroVector = {
      kcal: targets.targetCalories * share.kcal,
      protein: targets.proteinGrams * share.protein,
      carbs: targets.carbGrams * share.carbs,
      fat: targets.fatGrams * share.fat,
    };

    const eligible = MEAL_TEMPLATES.filter(
      (template) => template.slot === slot && isTemplateEligible(template, preferences, isWorkoutDay)
    );

    if (eligible.length === 0) {
      throw new MealPlanGenerationError(
        slot,
        `هیچ ترکیب غذایی امنی برای ${MEAL_SLOT_LABELS[slot]} با محدودیت‌های انتخاب‌شده پیدا نشد.`
      );
    }

    return getResolvedOptions(slot, eligible, slotTargets);
  });

  const chosen = chooseDailyCombination(optionsBySlot, targets, seed);
  const refined = refineDailyTemplates(chosen, optionsBySlot, targets);
  const meals = refined.map(buildMeal);

  return { date, isWorkoutDay, targets, meals };
}

// ============================================================================
// 9 - SWAPS
// ============================================================================

export function getSwapCandidatesForComponent(
  component: MealComponent,
  preferences: DietaryPreferencesJson
): FoodItem[] {
  return getSubstitutesFor(component.foodItem.id).filter((food) => isFoodAllowed(food, preferences));
}

export function swapComponentInMeal(
  meal: Meal,
  componentIndex: number,
  replacement: FoodItem,
  slotTargets: MacroVector
): Meal {
  if (componentIndex < 0 || componentIndex >= meal.components.length) return meal;

  const others = meal.components.filter((_, index) => index !== componentIndex);
  const otherTotals = others.reduce<MacroVector>(
    (acc, component) => addTotals(acc, component),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  let bestComponent: MealComponent | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestOverClass = Number.POSITIVE_INFINITY;

  for (const units of portionCandidates(replacement, slotTargets)) {
    const component = componentFromUnits(replacement, units);
    const totals = addTotals(otherTotals, component);
    const overClass = totals.kcal > slotTargets.kcal * 1.05 ? 1 : 0;
    const score = scoreTotals(totals, slotTargets);

    if (overClass < bestOverClass || (overClass === bestOverClass && score < bestScore)) {
      bestOverClass = overClass;
      bestScore = score;
      bestComponent = component;
    }
  }

  if (!bestComponent) return meal;

  const newComponents = meal.components.map((component, index) =>
    index === componentIndex ? bestComponent! : component
  );

  const totals = newComponents.reduce<MacroVector>(
    (acc, component) => addTotals(acc, component),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    ...meal,
    components: newComponents,
    totalKcal: Math.round(totals.kcal),
    totalProtein: round1(totals.protein),
    totalCarbs: round1(totals.carbs),
    totalFat: round1(totals.fat),
  };
}

export function getSlotTargets(slot: MealSlot, targets: MacroTargets): MacroVector {
  const share = SLOT_DISTRIBUTION[slot];
  return {
    kcal: targets.targetCalories * share.kcal,
    protein: targets.proteinGrams * share.protein,
    carbs: targets.carbGrams * share.carbs,
    fat: targets.fatGrams * share.fat,
  };
}
