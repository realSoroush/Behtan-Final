import type {
  DailyMealPlan,
  FoodItem,
  Meal,
  MealComponent,
} from "../types/index.ts";
export type FoodVisual =
  | "egg"
  | "chicken"
  | "fish"
  | "beef"
  | "beans"
  | "rice"
  | "bread"
  | "potato"
  | "salad"
  | "oil"
  | "nuts"
  | "avocado"
  | "cheese"
  | "milk"
  | "yogurt"
  | "apple"
  | "banana"
  | "dates"
  | "powder"
  | "oats"
  | "generic";
const VISUALS: Record<string, FoodVisual> = {
  egg_white: "egg",
  egg_whole: "egg",
  chicken_breast: "chicken",
  grilled_fish: "fish",
  lean_beef: "beef",
  ground_beef_lean: "beef",
  whey_protein: "powder",
  pea_protein: "powder",
  soy_chunks: "beans",
  lentils_cooked: "beans",
  brown_rice_cooked: "rice",
  white_rice_cooked: "rice",
  quinoa_cooked: "rice",
  oats_dry: "oats",
  whole_grain_toast: "bread",
  sangak_bread: "bread",
  boiled_potato: "potato",
  mixed_salad: "salad",
  fresh_cucumber_tomato: "salad",
  steamed_vegetables: "salad",
  spinach_borani: "yogurt",
  olive_oil: "oil",
  walnut: "nuts",
  mixed_nuts: "nuts",
  avocado_half: "avocado",
  low_fat_cheese: "cheese",
  low_fat_milk: "milk",
  low_fat_yogurt: "yogurt",
  apple: "apple",
  banana: "banana",
  dates_small: "dates",
};
export const foodVisual = (food: Pick<FoodItem, "id">): FoodVisual =>
  VISUALS[food.id] ?? "generic";
export function componentAmount(c: MealComponent) {
  const basis =
    c.foodItem.preparationState === "dry"
      ? " · وزن خشک، پیش از آماده‌سازی"
      : c.foodItem.preparationState === "cooked"
        ? " · وزن پس از پخت"
        : c.foodItem.preparationState === "raw"
          ? " · وزن خام"
          : "";
  return baseComponentAmount(c) + basis;
}
function baseComponentAmount(c: MealComponent) {
  const f = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
  return c.foodItem.id === "low_fat_milk"
    ? `${f.format(c.grams)} میلی‌لیتر`
    : c.foodItem.unitLabel === "گرم"
      ? `${f.format(c.grams)} گرم`
      : `${f.format(c.units)} ${c.foodItem.unitLabel} · ${f.format(c.grams)} گرم`;
}
export const nextMealIndex = (meals: Meal[]) =>
  meals.findIndex((m) => !m.consumed);
export function addPlanDays(key: string, days: number) {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function isPresentablePlan(value: unknown): value is DailyMealPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as DailyMealPlan;
  return (
    typeof p.isWorkoutDay === "boolean" &&
    Array.isArray(p.meals) &&
    p.meals.length > 0 &&
    p.meals.length <= 12 &&
    p.meals.every(
      (m) =>
        m &&
        typeof m.slot === "string" &&
        typeof m.label === "string" &&
        typeof m.totalKcal === "number" &&
        Number.isFinite(m.totalKcal) &&
        Array.isArray(m.components) &&
        m.components.length <= 20 &&
        m.components.every(
          (c) =>
            c &&
            typeof c.foodItem?.id === "string" &&
            typeof c.foodItem.name === "string" &&
            Number.isFinite(c.grams) &&
            Number.isFinite(c.kcal),
        ),
    ) &&
    p.targets &&
    Number.isFinite(p.targets.targetCalories)
  );
}

export type MemberScheduledPlan = DailyMealPlan & {
  swapBaselineMeals?: Meal[];
  mealRotationAnchors?: Meal[];
};

export function withSwapBaseline(
  plan: DailyMealPlan,
  baseline: MemberScheduledPlan,
): MemberScheduledPlan {
  return {
    ...plan,
    swapBaselineMeals:
      (plan as MemberScheduledPlan).swapBaselineMeals ??
      baseline.swapBaselineMeals ??
      baseline.meals,
  };
}
export function swapBaselineComponent(
  plan: MemberScheduledPlan,
  slot: string,
  index: number,
) {
  return (
    (plan.swapBaselineMeals ?? plan.meals).find((meal) => meal.slot === slot)
      ?.components[index] ?? null
  );
}

/** Composition follows the current ingredients, keeping large foods apart. */
export function plateLayout(components: MealComponent[]) {
  const slots = [
    { x: 151, y: 228, scale: 1.34, rotation: -22 },
    { x: 244, y: 164, scale: 1.35, rotation: 9 },
    { x: 142, y: 128, scale: 1.04, rotation: -12 },
    { x: 264, y: 268, scale: 0.83, rotation: 18 },
    { x: 276, y: 110, scale: 0.73, rotation: 8 },
    { x: 139, y: 296, scale: 0.7, rotation: -15 },
  ];
  const priorities: Record<string, number> = {
    protein: 0,
    starch: 1,
    vegetable: 2,
    fruit: 3,
    dairy: 4,
    fat: 5,
  };
  const order = components
    .map((c, index) => ({ index, rank: priorities[c.foodItem.role] ?? 6 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  if (components.length === 1)
    return [{ x: 200, y: 200, scale: 1.65, rotation: -8 }];
  const result: typeof slots = [];
  order.forEach(({ index }, position) => {
    if (components.length <= 6) result[index] = slots[position];
    else {
      const angle = -Math.PI / 2 + (position * Math.PI * 2) / components.length;
      result[index] = {
        x: 200 + Math.cos(angle) * 100,
        y: 200 + Math.sin(angle) * 100,
        scale: 0.73,
        rotation: 0,
      };
    }
  });
  return result;
}

export function sumPlanIngredients(plans: DailyMealPlan[]) {
  const items = new Map<
    string,
    {
      name: string;
      grams: number;
      units: number;
      unitLabel: string;
      isLiquid: boolean;
    }
  >();
  for (const plan of plans)
    for (const meal of plan.meals)
      for (const c of meal.components) {
        const previous = items.get(c.foodItem.id);
        items.set(c.foodItem.id, {
          name: c.foodItem.name,
          grams: (previous?.grams ?? 0) + c.grams,
          units: (previous?.units ?? 0) + c.units,
          unitLabel: c.foodItem.unitLabel,
          isLiquid: c.foodItem.id === "low_fat_milk",
        });
      }
  return [...items.entries()]
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => a.name.localeCompare(b.name, "fa"));
}

/** Custom intake lives in checkins, never becomes tomorrow's prescribed recipe after undo. */
export function prescriptionForSchedule(
  plan: DailyMealPlan,
  baseline: MemberScheduledPlan,
): MemberScheduledPlan {
  const result = withSwapBaseline(plan, baseline);
  return {
    ...result,
    meals: result.meals.map((meal) =>
      Boolean(meal.source)
        ? (result.swapBaselineMeals?.find(
            (original) =>
              original.slot === meal.slot && !original.source,
          ) ?? meal)
        : meal,
    ),
  };
}
