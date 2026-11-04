import type { DailyMealPlan, DietaryPreferencesJson, Meal } from '../types/index.ts';
import { getProfessionalMealOptions, rebalanceMemberDay, type MemberDayIntake } from './mealPlanEngine.ts';
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
    .filter(m => current.slot === 'post_workout' || (m.totalKcal >= anchor.totalKcal * .85 && m.totalKcal <= anchor.totalKcal * 1.15))
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

/** Rotate through approved menus until one can fit the day. */
export function changeMemberMeal(
  plan: DailyMealPlan, index: number, preferences: DietaryPreferencesJson, intake: MemberDayIntake,
): MemberScheduledPlan {
  const original = plan.meals[index];
  if (!original || original.consumed) throw Error('وعدهٔ ثبت‌شده قابل تغییر نیست.');
  const options = memberMealAlternatives(plan, index, preferences);
  const signature = memberMealSignature(original);
  const currentIndex = options.findIndex(m => memberMealSignature(m) === signature);
  const saved = plan as MemberScheduledPlan;
  const baseline = saved.swapBaselineMeals ?? plan.meals;
  for (let offset = 1; offset <= options.length; offset++) {
    const replacement = options[(currentIndex + offset) % options.length];
    if (memberMealSignature(replacement) === signature) continue;
    const updated = rebalanceMemberDay(plan, index, replacement, preferences, intake);
    if (updated) return {
      ...updated,
      mealRotationAnchors: saved.mealRotationAnchors ?? baseline,
      swapBaselineMeals: baseline.map(m => m.slot === original.slot ? replacement : m),
    };
  }
  throw Error('با ثبت‌ها و محدودیت‌های فعلی، منوی دیگری که با هدف روز سازگار باشد پیدا نشد.');
}
