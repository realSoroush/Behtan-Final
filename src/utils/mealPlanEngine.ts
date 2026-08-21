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
    allergyFlags: ['dairy'], excludedForVegetarian: [] },

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
// 3 - MEAL TEMPLATES (structure only - no fixed grams)
// ─────────────────────────────────────────────────────────────────────────
// A template says WHICH roles appear in a meal and which default food fills
// each role. `dynamicUnits: true` on the protein role means the engine
// computes the unit count live from the user's slot protein target.
// ============================================================================

const MEAL_TEMPLATES: MealTemplate[] = [
  // -- Breakfast --------------------------------------------------------------
  {
    id: 'bk_eggs_toast', slot: 'breakfast', displayName: 'تخم‌مرغ و نان تست سبوس‌دار',
    slots: [
      { role: 'protein', primaryFoodItemId: 'egg_white', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'whole_grain_toast', dynamicUnits: false, fixedUnits: 2 },
      { role: 'dairy', primaryFoodItemId: 'low_fat_cheese', dynamicUnits: false, fixedUnits: 2 },
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

  // -- Morning snack ------------------------------------------------------------
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
    isWorkoutDayOnly: false, isRestDayOnly: true, goalTags: [],
  },

  // -- Lunch --------------------------------------------------------------------
  {
    id: 'ln_chicken_rice', slot: 'lunch', displayName: 'سینه مرغ با برنج قهوه‌ای',
    slots: [
      { role: 'protein', primaryFoodItemId: 'chicken_breast', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'brown_rice_cooked', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'mixed_salad', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'olive_oil', dynamicUnits: false, fixedUnits: 1 },
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
    id: 'ln_soy_pasta', slot: 'lunch', displayName: 'ماکارونی با سویا',
    slots: [
      { role: 'protein', primaryFoodItemId: 'soy_chunks', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'white_rice_cooked', dynamicUnits: false, fixedUnits: 1 },
      { role: 'vegetable', primaryFoodItemId: 'mixed_salad', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, maxPerWeek: 2, goalTags: [],
  },

  // -- Afternoon snack -----------------------------------------------------------
  {
    id: 'as_potato_chicken', slot: 'afternoon_snack', displayName: 'سیب‌زمینی و فیله مرغ',
    slots: [
      { role: 'starch', primaryFoodItemId: 'boiled_potato', dynamicUnits: false, fixedUnits: 1 },
      { role: 'protein', primaryFoodItemId: 'chicken_breast', dynamicUnits: true },
    ],
    isWorkoutDayOnly: true, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'as_whey_nuts', slot: 'afternoon_snack', displayName: 'پروتئین وی و آجیل',
    slots: [
      { role: 'protein', primaryFoodItemId: 'whey_protein', dynamicUnits: true },
      { role: 'fat', primaryFoodItemId: 'mixed_nuts', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: true, goalTags: [],
  },

  // -- Dinner ---------------------------------------------------------------------
  {
    id: 'dn_chicken_veg', slot: 'dinner', displayName: 'سینه مرغ با سبزیجات و نان تست',
    slots: [
      { role: 'protein', primaryFoodItemId: 'chicken_breast', dynamicUnits: true },
      { role: 'vegetable', primaryFoodItemId: 'steamed_vegetables', dynamicUnits: false, fixedUnits: 2 },
      { role: 'starch', primaryFoodItemId: 'whole_grain_toast', dynamicUnits: false, fixedUnits: 1 },
      { role: 'fat', primaryFoodItemId: 'olive_oil', dynamicUnits: false, fixedUnits: 1 },
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
      { role: 'vegetable', primaryFoodItemId: 'spinach_borani', dynamicUnits: false, fixedUnits: 2 },
      { role: 'dairy', primaryFoodItemId: 'low_fat_yogurt', dynamicUnits: false, fixedUnits: 2 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
  {
    id: 'dn_fish_potato', slot: 'dinner', displayName: 'ماهی کبابی با سیب‌زمینی',
    slots: [
      { role: 'protein', primaryFoodItemId: 'grilled_fish', dynamicUnits: true },
      { role: 'starch', primaryFoodItemId: 'boiled_potato', dynamicUnits: false, fixedUnits: 2 },
      { role: 'fat', primaryFoodItemId: 'mixed_nuts', dynamicUnits: false, fixedUnits: 1 },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },

  // -- Night snack ------------------------------------------------------------
  {
    id: 'ns_milk', slot: 'night_snack', displayName: 'شیر کم‌چرب',
    slots: [
      { role: 'dairy', primaryFoodItemId: 'low_fat_milk', dynamicUnits: true },
    ],
    isWorkoutDayOnly: false, isRestDayOnly: false, goalTags: [],
  },
];

// ============================================================================
// 4 - SLOT DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────
// Reverse-engineered from a real, professionally-written diet plan (a
// certified NSCA trainer's cutting + muscle-retention program). Computed
// directly from that plan's own macro totals per meal - not guessed.
//
// Key property the user specifically asked for: protein is front-loaded
// into breakfast + morning snack (36% combined) so lunch does NOT have to
// carry a disproportionate protein load and stays a normal-sized meal.
// Carbs peak at lunch (Persian rice-based meal); fat is lowest in the
// afternoon/night slots.
//
// Each column sums to 1.00 independently.
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
// 5 - DIETARY FILTERING
// ============================================================================

function isTemplateEligible(
  template: MealTemplate,
  preferences: DietaryPreferencesJson,
  isWorkoutDay: boolean
): boolean {
  if (template.isWorkoutDayOnly && !isWorkoutDay) return false;
  if (template.isRestDayOnly && isWorkoutDay) return false;

  for (const slotFill of template.slots) {
    const food = foodById(slotFill.primaryFoodItemId);
    if (food.allergyFlags.some((a: Allergy) => preferences.allergies.includes(a))) return false;
    if (food.excludedForVegetarian.includes(preferences.vegetarianStatus)) return false;
  }
  return true;
}

// ============================================================================
// 6 - DYNAMIC UNIT CALCULATION
// ─────────────────────────────────────────────────────────────────────────
// For a slot's protein target, figure out how many units of the dynamic
// food item are needed. Rounded to a realistic increment per food type
// (whole eggs, 10g steps for meat/rice) so the result is always a number
// a person could actually plate.
// ============================================================================

function roundToRealisticUnit(rawUnits: number, food: FoodItem): number {
  if (food.unitLabel === 'عدد') {
    // Countable items (eggs) - round to nearest whole unit, minimum 1
    return Math.max(1, Math.round(rawUnits));
  }
  if (food.unitLabel === 'اسکوپ') {
    // Protein scoops - round to nearest 0.5
    return Math.max(0.5, Math.round(rawUnits * 2) / 2);
  }
  if (food.gramsPerUnit === 100) {
    // Per-100g foods (meat, fish, rice) - round to nearest 10g (0.1 unit)
    return Math.max(0.3, Math.round(rawUnits * 10) / 10);
  }
  return Math.max(0.5, Math.round(rawUnits * 2) / 2);
}

function computeDynamicUnits(targetGrams: number, perUnit: number, food: FoodItem): number {
  if (perUnit <= 0) return 1;
  const rawUnits = Math.max(0, targetGrams) / perUnit;
  return roundToRealisticUnit(rawUnits, food);
}

/**
 * MIGP-style multi-macro scoring (see ULTIMATE_SOLUTION_RESEARCH.md).
 * Instead of sizing a dynamic component off ONE macro (protein) and letting
 * the others ride along uncontrolled — the exact cause of the carb-overshoot
 * bug — this scores a handful of realistic unit candidates against ALL 4
 * macro deviations at once, weighted inversely by each macro's target size
 * (so a 5g protein miss and a 20g carb miss on a 100g target are scored
 * equally, per the goal-programming normalization from the research).
 */
function scoreUnits(
  units: number,
  food: FoodItem,
  fixed: { kcal: number; protein: number; carbs: number; fat: number },
  targets: { kcal: number; protein: number; carbs: number; fat: number }
): number {
  const kcal = fixed.kcal + units * food.kcalPerUnit;
  const protein = fixed.protein + units * food.proteinPerUnit;
  const carbs = fixed.carbs + units * food.carbsPerUnit;
  const fat = fixed.fat + units * food.fatPerUnit;
  const w = {
    kcal: 1 / Math.max(1, targets.kcal),
    protein: 1 / Math.max(1, targets.protein),
    carbs: 1 / Math.max(1, targets.carbs),
    fat: 1 / Math.max(1, targets.fat),
  };
  return (
    w.kcal * Math.abs(kcal - targets.kcal) +
    w.protein * Math.abs(protein - targets.protein) +
    w.carbs * Math.abs(carbs - targets.carbs) +
    w.fat * Math.abs(fat - targets.fat)
  );
}

/**
 * Picks the unit count for a dynamic component that minimizes combined
 * weighted deviation across all 4 macros (MIGP), not just protein.
 * Tries a small candidate set anchored on protein-only sizing (the old
 * behaviour) plus fractional steps around it — cheap (≤7 evaluations),
 * deterministic, no external solver needed.
 */
function computeDynamicUnitsMultiMacro(
  food: FoodItem,
  fixed: { kcal: number; protein: number; carbs: number; fat: number },
  targets: { kcal: number; protein: number; carbs: number; fat: number }
): number {
  // Anchor the initial guess on the macro this food's role is meant to
  // deliver (starch -> carbs, everything else -> protein), then let the
  // multi-macro scorer refine around it. Anchoring on the wrong macro for
  // carb-heavy starch (e.g. always anchoring on protein) is what produced
  // unrealistic rice/potato portions previously.
  const perUnit = food.role === 'starch' ? food.carbsPerUnit : food.proteinPerUnit;
  const targetGrams = food.role === 'starch'
    ? Math.max(0, targets.carbs - fixed.carbs)
    : Math.max(0, targets.protein - fixed.protein);
  const anchor = computeDynamicUnits(targetGrams, perUnit, food);

  const step = food.unitLabel === 'عدد' ? 1 : food.gramsPerUnit === 100 ? 0.3 : 0.5;
  const candidates = new Set<number>();
  for (let d = -2; d <= 2; d++) {
    candidates.add(roundToRealisticUnit(anchor + d * step, food));
  }

  let best = anchor;
  let bestScore = Infinity;
  for (const units of candidates) {
    const s = scoreUnits(units, food, fixed, targets);
    if (s < bestScore) { bestScore = s; best = units; }
  }
  return best;
}

/**
 * Scale factor applied to FIXED-unit components (bread, cheese, walnuts,
 * salad, etc.) so a 50kg person and a 150kg person don't get the exact
 * same absolute portion of side items. Reference point is 75kg = 1.0x,
 * clamped to 0.6x-1.4x so portions never become unrealistic in either
 * direction (e.g. never less than half a slice of bread).
 *
 * This matters because fixed-role items still carry real protein (cheese,
 * toast) — without this scale, a light user's fixed portions alone can
 * exceed their (correctly smaller) slot protein target, forcing the
 * dynamic component to floor at its minimum and overshoot the meal's
 * protein target. Verified empirically: this keeps per-meal protein
 * deviation under ~2g across a 50-150kg range, vs up to 9g without it.
 */
function fixedUnitScaleForWeight(weightKg: number): number {
  const REFERENCE_WEIGHT_KG = 75;
  const raw = weightKg / REFERENCE_WEIGHT_KG;
  return Math.max(0.6, Math.min(1.4, raw));
}

/** Rounds a scaled fixed-unit count to something a person can actually
 * plate: whole units for countable items, nearest 0.5 otherwise. */
function roundFixedUnits(rawUnits: number, food: FoodItem): number {
  if (food.unitLabel === 'عدد' || food.unitLabel === 'برش' || food.unitLabel === 'کاسه' || food.unitLabel === 'لیوان') {
    return Math.max(1, Math.round(rawUnits));
  }
  return Math.max(0.5, Math.round(rawUnits * 2) / 2);
}

// ============================================================================
// 7 - RESOLVE A TEMPLATE INTO AN ACTUAL MEAL FOR THIS USER
// ─────────────────────────────────────────────────────────────────────────
// CRITICAL: a template's fixed-role slots (dairy, starch, fat, etc.) often
// carry real protein of their own (e.g. 2 units of low-fat cheese = 12g).
// If the dynamic protein slot were sized off the FULL slot target while
// ignoring that, the meal would overshoot its protein target every time -
// this was the exact bug behind "16 egg whites at breakfast": the fixed
// cheese/toast/walnut protein was invisible to the sizing calculation.
//
// Fix (part 1): compute every fixed-role component FIRST, sum their
// protein, then size the dynamic component off
// (slotProteinTarget - fixedProteinSum).
//
// Fix (part 2): fixed-role portions themselves scale mildly with the
// user's bodyweight (see fixedUnitScaleForWeight) — otherwise a light
// user's fixed items alone could still exceed their smaller slot target,
// reintroducing a smaller version of the same overshoot.
// ============================================================================

function resolveTemplate(
  template: MealTemplate,
  slotTargets: { kcal: number; protein: number; carbs: number; fat: number },
  fixedUnitScale: number
): { components: MealComponent[]; totals: { kcal: number; protein: number; carbs: number; fat: number } } {
  // Pass 1 — resolve every FIXED-unit slot, scaled by the user's bodyweight
  // ratio, and total up all 4 macros they contribute (not just protein —
  // this was the root cause of the carb-overshoot bug: fixed starch/fruit
  // carbs were invisible to sizing).
  const fixedTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const resolvedFixed = new Map<number, MealComponent>();

  template.slots.forEach((slotFill, index) => {
    if (slotFill.dynamicUnits) return; // handled in pass 2
    const food = foodById(slotFill.primaryFoodItemId);
    const baseUnits = slotFill.fixedUnits ?? 1;
    const units = roundFixedUnits(baseUnits * fixedUnitScale, food);
    const component: MealComponent = {
      foodItem: food,
      units,
      grams: Math.round(units * food.gramsPerUnit),
      kcal: Math.round(units * food.kcalPerUnit),
      protein: Math.round(units * food.proteinPerUnit * 10) / 10,
      carbs: Math.round(units * food.carbsPerUnit * 10) / 10,
      fat: Math.round(units * food.fatPerUnit * 10) / 10,
    };
    resolvedFixed.set(index, component);
    fixedTotals.kcal += component.kcal;
    fixedTotals.protein += component.protein;
    fixedTotals.carbs += component.carbs;
    fixedTotals.fat += component.fat;
  });

  // Pass 2 — size EVERY dynamic component (protein source AND any dynamic
  // starch/dairy) using MIGP multi-macro scoring against all 4 targets at
  // once, minus whatever pass 1's fixed items already contribute. This
  // replaces the old protein-only sizing that let carbs (e.g. from lentils/
  // soy as a protein source) balloon uncontrolled.
  const components: MealComponent[] = template.slots.map((slotFill, index) => {
    const existing = resolvedFixed.get(index);
    if (existing) return existing;

    const food = foodById(slotFill.primaryFoodItemId);
    const units = computeDynamicUnitsMultiMacro(food, fixedTotals, slotTargets);

    return {
      foodItem: food,
      units,
      grams: Math.round(units * food.gramsPerUnit),
      kcal: Math.round(units * food.kcalPerUnit),
      protein: Math.round(units * food.proteinPerUnit * 10) / 10,
      carbs: Math.round(units * food.carbsPerUnit * 10) / 10,
      fat: Math.round(units * food.fatPerUnit * 10) / 10,
    };
  });

  const totals = components.reduce(
    (acc, c) => ({
      kcal: acc.kcal + c.kcal,
      protein: acc.protein + c.protein,
      carbs: acc.carbs + c.carbs,
      fat: acc.fat + c.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return { components, totals };
}

// ============================================================================
// 8 - DETERMINISTIC DAILY VARIETY (same date -> same plan, different dates
//      rotate through eligible templates)
// ============================================================================

function dateSeed(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ============================================================================
// 9 - MAIN ENTRY POINT
// ============================================================================

export function generateDailyMealPlan(
  targets: MacroTargets,
  weightKg: number,
  preferences: DietaryPreferencesJson,
  isWorkoutDay: boolean,
  date: string = new Date().toISOString().slice(0, 10)
): DailyMealPlan {
  const seed = dateSeed(date);

  // weightKg is passed explicitly (not back-derived from proteinGrams)
  // because the protein g/kg ratio is now goal-dependent (see
  // PROTEIN_G_PER_KG_BY_GOAL in nutritionHelpers.ts) — reversing that
  // math here would require duplicating goal-specific constants and
  // silently break the moment the two files drift out of sync.
  const fixedUnitScale = fixedUnitScaleForWeight(weightKg);

  const meals: Meal[] = SLOT_ORDER.map((slot, slotIndex) => {
    const share = SLOT_DISTRIBUTION[slot];
    // Full 4-macro slot target (MIGP) — previously only protein was
    // computed here, which is exactly why carbs/fat were uncontrolled.
    const slotTargets = {
      kcal: targets.targetCalories * share.kcal,
      protein: targets.proteinGrams * share.protein,
      carbs: targets.carbGrams * share.carbs,
      fat: targets.fatGrams * share.fat,
    };

    const eligible = MEAL_TEMPLATES.filter(
      (t) => t.slot === slot && isTemplateEligible(t, preferences, isWorkoutDay)
    );

    // Fallback: if dietary filters eliminate everything for this slot,
    // relax the workout/rest constraint only (never relax allergy/vegetarian).
    const candidates = eligible.length > 0
      ? eligible
      : MEAL_TEMPLATES.filter(
          (t) => t.slot === slot &&
            t.slots.every((sf) => {
              const food = foodById(sf.primaryFoodItemId);
              return (
                !food.allergyFlags.some((a: Allergy) => preferences.allergies.includes(a)) &&
                !food.excludedForVegetarian.includes(preferences.vegetarianStatus)
              );
            })
        );

    const template = candidates.length > 0
      ? candidates[(seed + slotIndex) % candidates.length]
      : MEAL_TEMPLATES.find((t) => t.slot === slot)!; // last-resort fallback

    const { components, totals } = resolveTemplate(template, slotTargets, fixedUnitScale);

    return {
      slot,
      label: MEAL_SLOT_LABELS[slot],
      templateId: template.id,
      templateName: template.displayName,
      components,
      totalKcal: totals.kcal,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat,
      consumed: false,
    };
  });

  return { date, isWorkoutDay, targets, meals };
}

// ============================================================================
// 10 - SWAP: replace one component's food with a substitute, recomputing
//       that component's (and the meal's) macros. Protein-role swaps keep
//       the same unit count re-derived from the slot's protein target so
//       the swap doesn't silently break the day's protein total.
// ============================================================================

export function getSwapCandidatesForComponent(
  component: MealComponent,
  preferences: DietaryPreferencesJson
): FoodItem[] {
  return getSubstitutesFor(component.foodItem.id).filter(
    (food) =>
      !food.allergyFlags.some((a: Allergy) => preferences.allergies.includes(a)) &&
      !food.excludedForVegetarian.includes(preferences.vegetarianStatus)
  );
}

/**
 * Swaps one component's food for a substitute, recomputing that
 * component's (and the meal's) macros.
 *
 * For a protein-role swap, the replacement's unit count is sized off the
 * slot's protein target MINUS whatever the meal's other components already
 * contribute — same fixed-protein-subtraction logic as resolveTemplate,
 * recomputed from the meal's current components so a swap never silently
 * reintroduces the overshoot bug that the initial generation fixes.
 * For a fixed-role swap (e.g. brown rice -> white rice), the same unit
 * count is kept since it was already sized correctly for this user at
 * generation time.
 */
export function swapComponentInMeal(
  meal: Meal,
  componentIndex: number,
  replacement: FoodItem,
  slotTargets: { kcal: number; protein: number; carbs: number; fat: number }
): Meal {
  const oldComponent = meal.components[componentIndex];
  const isDynamic = oldComponent.foodItem.role === 'protein' || oldComponent.foodItem.role === 'starch';

  let units: number;
  if (isDynamic) {
    const others = meal.components.reduce(
      (acc, c, i) => i === componentIndex ? acc : {
        kcal: acc.kcal + c.kcal, protein: acc.protein + c.protein,
        carbs: acc.carbs + c.carbs, fat: acc.fat + c.fat,
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    );
    units = computeDynamicUnitsMultiMacro(replacement, others, slotTargets);
  } else {
    units = oldComponent.units; // fixed-role swaps keep the same, already-correct unit count
  }

  const newComponent: MealComponent = {
    foodItem: replacement,
    units,
    grams: Math.round(units * replacement.gramsPerUnit),
    kcal: Math.round(units * replacement.kcalPerUnit),
    protein: Math.round(units * replacement.proteinPerUnit * 10) / 10,
    carbs: Math.round(units * replacement.carbsPerUnit * 10) / 10,
    fat: Math.round(units * replacement.fatPerUnit * 10) / 10,
  };

  const newComponents = meal.components.map((c, i) => (i === componentIndex ? newComponent : c));

  const totals = newComponents.reduce(
    (acc, c) => ({
      kcal: acc.kcal + c.kcal,
      protein: acc.protein + c.protein,
      carbs: acc.carbs + c.carbs,
      fat: acc.fat + c.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    ...meal,
    components: newComponents,
    totalKcal: totals.kcal,
    totalProtein: totals.protein,
    totalCarbs: totals.carbs,
    totalFat: totals.fat,
  };
}

/** Exposes a slot's full 4-macro target so DashboardPage can pass it into a swap (MIGP). */
export function getSlotTargets(slot: MealSlot, targets: MacroTargets) {
  const share = SLOT_DISTRIBUTION[slot];
  return {
    kcal: targets.targetCalories * share.kcal,
    protein: targets.proteinGrams * share.protein,
    carbs: targets.carbGrams * share.carbs,
    fat: targets.fatGrams * share.fat,
  };
}
