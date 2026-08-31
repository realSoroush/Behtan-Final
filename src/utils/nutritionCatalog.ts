import type {
  Allergy,
  FoodItem,
  FoodRole,
  FoodSubstituteGroup,
  Goal,
  MealSlot,
  MealTemplate,
  NutritionCatalog,
  PortionRule,
  VegetarianStatus,
} from '@/types';

export interface FoodItemRow {
  id: string;
  name: string;
  role: FoodRole;
  emoji: string | null;
  unit_label: string;
  grams_per_unit: number | string;
  kcal_per_unit: number | string;
  protein_per_unit: number | string;
  carbs_per_unit: number | string;
  fat_per_unit: number | string;
  allergy_flags: Allergy[] | null;
  excluded_for_vegetarian: VegetarianStatus[] | null;
  swap_allowed_meals: MealSlot[] | null;
  swap_group: string | null;
  swap_priority: number | string | null;
  portion_min_units: number | string;
  portion_typical_units: number | string;
  portion_soft_max_units: number | string;
  portion_hard_max_units: number | string;
  portion_step: number | string;
  is_active: boolean;
  sort_order: number | null;
}

export interface FoodSubstituteRow {
  food_item_id: string;
  substitute_food_item_id: string;
  is_active: boolean;
}

export interface MealTemplateRow {
  id: string;
  slot: MealSlot;
  display_name: string;
  is_workout_day_only: boolean;
  is_rest_day_only: boolean;
  max_per_week: number | null;
  restricted_diet_only: boolean;
  vegetarian_statuses_only: VegetarianStatus[] | null;
  goal_tags: Goal[] | null;
  is_active: boolean;
  sort_order: number | null;
}

export interface MealTemplateSlotRow {
  template_id: string;
  position: number;
  role: FoodRole;
  primary_food_item_id: string;
  dynamic_units: boolean;
  fixed_units: number | string | null;
}

const toNumber = (value: number | string, label: string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[nutritionCatalog] Invalid numeric value for ${label}.`);
  }
  return parsed;
};

export function buildNutritionCatalog(input: {
  foodRows: FoodItemRow[];
  substituteRows: FoodSubstituteRow[];
  templateRows: MealTemplateRow[];
  slotRows: MealTemplateSlotRow[];
}): NutritionCatalog {
  const foods: FoodItem[] = input.foodRows
    .filter((row) => row.is_active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      emoji: row.emoji ?? '',
      unitLabel: row.unit_label,
      gramsPerUnit: toNumber(row.grams_per_unit, `${row.id}.grams_per_unit`),
      kcalPerUnit: toNumber(row.kcal_per_unit, `${row.id}.kcal_per_unit`),
      proteinPerUnit: toNumber(row.protein_per_unit, `${row.id}.protein_per_unit`),
      carbsPerUnit: toNumber(row.carbs_per_unit, `${row.id}.carbs_per_unit`),
      fatPerUnit: toNumber(row.fat_per_unit, `${row.id}.fat_per_unit`),
      allergyFlags: row.allergy_flags ?? [],
      excludedForVegetarian: row.excluded_for_vegetarian ?? [],
      swapAllowedMeals: row.swap_allowed_meals ?? [],
      swapGroup: (row.swap_group ?? '').trim() || row.role,
      swapPriority: row.swap_priority == null ? 100 : toNumber(row.swap_priority, `${row.id}.swap_priority`),
    }));

  const portionRules: Record<string, PortionRule> = {};
  for (const row of input.foodRows.filter((row) => row.is_active)) {
    portionRules[row.id] = {
      minUnits: toNumber(row.portion_min_units, `${row.id}.portion_min_units`),
      typicalUnits: toNumber(row.portion_typical_units, `${row.id}.portion_typical_units`),
      softMaxUnits: toNumber(row.portion_soft_max_units, `${row.id}.portion_soft_max_units`),
      hardMaxUnits: toNumber(row.portion_hard_max_units, `${row.id}.portion_hard_max_units`),
      step: toNumber(row.portion_step, `${row.id}.portion_step`),
    };
  }

  const substituteMap = new Map<string, string[]>();
  for (const row of input.substituteRows.filter((row) => row.is_active)) {
    const ids = substituteMap.get(row.food_item_id) ?? [];
    ids.push(row.substitute_food_item_id);
    substituteMap.set(row.food_item_id, ids);
  }
  const substitutes: FoodSubstituteGroup[] = [...substituteMap.entries()].map(
    ([foodItemId, substituteIds]) => ({ foodItemId, substituteIds })
  );

  const slotsByTemplate = new Map<string, MealTemplateSlotRow[]>();
  for (const row of input.slotRows) {
    const rows = slotsByTemplate.get(row.template_id) ?? [];
    rows.push(row);
    slotsByTemplate.set(row.template_id, rows);
  }

  const mealTemplates: MealTemplate[] = input.templateRows
    .filter((row) => row.is_active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((row) => ({
      id: row.id,
      slot: row.slot,
      displayName: row.display_name,
      slots: (slotsByTemplate.get(row.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((slot) => ({
          role: slot.role,
          primaryFoodItemId: slot.primary_food_item_id,
          dynamicUnits: slot.dynamic_units,
          fixedUnits: slot.fixed_units == null
            ? undefined
            : toNumber(slot.fixed_units, `${row.id}.${slot.position}.fixed_units`),
        })),
      isWorkoutDayOnly: row.is_workout_day_only,
      isRestDayOnly: row.is_rest_day_only,
      maxPerWeek: row.max_per_week ?? undefined,
      restrictedDietOnly: row.restricted_diet_only || undefined,
      vegetarianStatusesOnly:
        row.vegetarian_statuses_only && row.vegetarian_statuses_only.length > 0
          ? row.vegetarian_statuses_only
          : undefined,
      goalTags: row.goal_tags && row.goal_tags.length > 0 ? row.goal_tags : [],
    }));

  const catalog: NutritionCatalog = {
    foods,
    substitutes,
    mealTemplates,
    portionRules,
  };
  assertValidNutritionCatalog(catalog);
  return catalog;
}

export function assertValidNutritionCatalog(catalog: NutritionCatalog): void {
  if (catalog.foods.length === 0) {
    throw new Error('[nutritionCatalog] Catalog contains no active foods.');
  }
  if (catalog.mealTemplates.length === 0) {
    throw new Error('[nutritionCatalog] Catalog contains no active meal templates.');
  }

  const foodIds = new Set<string>();
  for (const food of catalog.foods) {
    if (foodIds.has(food.id)) {
      throw new Error(`[nutritionCatalog] Duplicate food id: ${food.id}`);
    }
    foodIds.add(food.id);

    if (food.gramsPerUnit <= 0 || food.kcalPerUnit < 0 || food.proteinPerUnit < 0 || food.carbsPerUnit < 0 || food.fatPerUnit < 0) {
      throw new Error(`[nutritionCatalog] Invalid macros/units for food: ${food.id}`);
    }
    if (food.swapAllowedMeals.length === 0) {
      throw new Error(`[nutritionCatalog] Food has no swap meal contexts: ${food.id}`);
    }
    if (!food.swapGroup.trim()) {
      throw new Error(`[nutritionCatalog] Food has no swap group: ${food.id}`);
    }
    if (!Number.isFinite(food.swapPriority) || food.swapPriority < 0) {
      throw new Error(`[nutritionCatalog] Invalid swap priority for food: ${food.id}`);
    }

    const rule = catalog.portionRules[food.id];
    if (!rule) {
      throw new Error(`[nutritionCatalog] Missing portion rule for food: ${food.id}`);
    }
    if (
      rule.minUnits <= 0 ||
      rule.step <= 0 ||
      rule.minUnits > rule.typicalUnits ||
      rule.typicalUnits > rule.softMaxUnits ||
      rule.softMaxUnits > rule.hardMaxUnits
    ) {
      throw new Error(`[nutritionCatalog] Invalid portion rule for food: ${food.id}`);
    }
  }

  for (const group of catalog.substitutes) {
    if (!foodIds.has(group.foodItemId)) {
      throw new Error(`[nutritionCatalog] Substitute source food missing: ${group.foodItemId}`);
    }
    for (const substituteId of group.substituteIds) {
      if (!foodIds.has(substituteId)) {
        throw new Error(`[nutritionCatalog] Substitute target food missing: ${substituteId}`);
      }
      if (substituteId === group.foodItemId) {
        throw new Error(`[nutritionCatalog] Food cannot substitute itself: ${group.foodItemId}`);
      }
    }
  }

  const templateIds = new Set<string>();
  for (const template of catalog.mealTemplates) {
    if (templateIds.has(template.id)) {
      throw new Error(`[nutritionCatalog] Duplicate meal-template id: ${template.id}`);
    }
    templateIds.add(template.id);
    if (template.slots.length === 0) {
      throw new Error(`[nutritionCatalog] Template has no slots: ${template.id}`);
    }
    for (const slot of template.slots) {
      if (!foodIds.has(slot.primaryFoodItemId)) {
        throw new Error(
          `[nutritionCatalog] Template ${template.id} references missing food ${slot.primaryFoodItemId}.`
        );
      }
      const food = catalog.foods.find((item) => item.id === slot.primaryFoodItemId)!;
      if (food.role !== slot.role) {
        throw new Error(
          `[nutritionCatalog] Template ${template.id} role mismatch for ${food.id}: ${slot.role} vs ${food.role}.`
        );
      }
    }
  }
}
