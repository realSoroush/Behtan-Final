import type { DailyMealPlan, DietaryPreferencesJson, Meal } from '../types/index.ts';
import { getProfessionalMealOptions } from './mealPlanEngine.ts';
import { mealFingerprint } from './mealExperience.ts';
import type { MemberScheduledPlan } from './mealPresentation.ts';

export const memberMealSignature = (meal: Meal) => mealFingerprint(meal.components.map(c => c.foodItem.id));

/** All rotations use the initial portion budget, including after refresh. */
export function memberMealAlternatives(plan: DailyMealPlan, index: number, preferences: DietaryPreferencesJson): Meal[] {
  const current = plan.meals[index];
  if (!current || current.consumed) return [];
  const saved = plan as MemberScheduledPlan;
  const anchors = saved.mealRotationAnchors ?? saved.swapBaselineMeals ?? plan.meals;
  const anchor = anchors.find(m => m.slot === current.slot) ?? current;
  const options = getProfessionalMealOptions(anchor, preferences, plan.isWorkoutDay)
    .filter(m => m.totalKcal >= anchor.totalKcal * .85 && m.totalKcal <= anchor.totalKcal * 1.15)
    .sort((a, b) => a.templateId.localeCompare(b.templateId));
  // The original is an approved generated menu, kept with its original portions.
  // Only retain it if its composition is still allowed in the current catalog.
  const anchorSignature = memberMealSignature(anchor);
  const approvedAnchor = options.some(m => memberMealSignature(m) === anchorSignature);
  const unique = new Map<string, Meal>();
  for (const option of [...(approvedAnchor ? [anchor] : []), ...options]) {
    const signature = memberMealSignature(option);
    if (!unique.has(signature)) unique.set(signature, { ...option, consumed: false });
  }
  return [...unique.values()];
}

/** Rotate one slot, wrapping to the start; all other planned/recorded meals stay intact. */
export function changeMemberMeal(plan: DailyMealPlan, index: number, _weight: number, preferences: DietaryPreferencesJson, _budget: 'economic'|'balanced'|'performance', _seed: string): MemberScheduledPlan {
  const original = plan.meals[index];
  if (!original || original.consumed) throw Error('وعدهٔ ثبت‌شده قابل تغییر نیست.');
  const options = memberMealAlternatives(plan, index, preferences);
  const currentIndex = options.findIndex(m => memberMealSignature(m) === memberMealSignature(original));
  const replacement = options[(currentIndex + 1) % options.length];
  if (!replacement || memberMealSignature(replacement) === memberMealSignature(original))
    throw Error('با محدودیت‌های فعلی، فقط همین منو برای این وعده در دسترس است.');
  const saved = plan as MemberScheduledPlan;
  const baseline = saved.swapBaselineMeals ?? plan.meals;
  const meals = plan.meals.map((m, i) => i === index ? replacement : m);
  const total = meals.reduce((s, m) => ({ kcal:s.kcal+m.totalKcal, protein:s.protein+m.totalProtein, carbs:s.carbs+m.totalCarbs, fat:s.fat+m.totalFat }), {kcal:0,protein:0,carbs:0,fat:0});
  const t=plan.targets;
  const remainingTargetsUnmet=total.kcal>t.targetCalories*1.03||total.kcal<t.targetCalories*.94||Math.abs(total.protein-t.proteinGrams)>t.proteinGrams*.10||Math.abs(total.carbs-t.carbGrams)>t.carbGrams*.10||Math.abs(total.fat-t.fatGrams)>t.fatGrams*.10;
  return { ...plan, meals, remainingTargetsUnmet,
    mealRotationAnchors: saved.mealRotationAnchors ?? baseline,
    swapBaselineMeals: baseline.map(m => m.slot === original.slot ? replacement : m),
  };
}
