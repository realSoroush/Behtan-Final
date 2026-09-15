// Snapshots are client reports. Validate before giving them to shared UI components.
export function canRenderSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const numbers = (o: Record<string, unknown>, keys: string[]) => keys.every(k => typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) >= 0);
  const strings = (o: Record<string, unknown>, keys: string[]) => keys.every(k => typeof o[k] === 'string');
  if (s.schemaVersion !== 1 || !object(s.targets) || !numbers(s.targets, ['targetCalories','proteinGrams','carbGrams','fatGrams']) || !object(s.plan) || !Array.isArray(s.plan.meals) || s.plan.meals.length>12) return false;
  return s.plan.meals.every(m => object(m) && strings(m, ['slot','label','templateId','templateName']) && typeof m.consumed === 'boolean' && numbers(m,['totalKcal','totalProtein','totalCarbs','totalFat']) && Array.isArray(m.components) && m.components.length<=30 && m.components.every(c => object(c) && numbers(c,['units','grams','kcal','fiber']) && object(c.foodItem) && strings(c.foodItem,['id','name','emoji','unitLabel']) && numbers(c.foodItem,['fruitVegGramsPerUnit']) && Array.isArray(c.foodItem.qualityTags) && c.foodItem.qualityTags.every(t => typeof t === 'string')));
}
