import type { Allergy, FoodItem } from '../types/index.ts';
export const ALLERGENS: readonly Allergy[] = ['dairy', 'gluten', 'peanut', 'tree_nut', 'soy', 'seafood', 'celery', 'egg', 'sesame'];
export const ASSESSMENT_STATUSES = ['contains', 'may_contain', 'unknown', 'assessed_absent'] as const;
export const NEW_ALLERGEN_NOTICE = 'برای حساسیت به تخم‌مرغ یا کنجد، فقط غذاهای دارای بررسی ثبت‌شده قابل پیشنهادند؛ اگر دادهٔ کافی نباشد، ساخت خودکار متوقف می‌شود و باید با متخصص بررسی شود.';

/** New allergens fail closed on legacy/unknown data; declared presence always wins. */
export function foodAllowedByAllergens(food: FoodItem, allergies: Allergy[]): boolean {
  return allergies.every(allergy => {
    if (!ALLERGENS.includes(allergy) || food.allergyFlags.includes(allergy)) return false;
    const status = food.allergenAssessment?.[allergy];
    if (status !== undefined) return status === 'assessed_absent' && Boolean(food.allergenAssessmentSource?.trim());
    // Compatibility for existing seven-allergen data. Expanding assessment to
    // these records requires the E08 reviewed-data rollout, not invented absences.
    return allergy !== 'egg' && allergy !== 'sesame';
  });
}
