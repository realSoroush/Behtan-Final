import type { SupabaseClient } from '@supabase/supabase-js';
import { buildNutritionCatalog, type FoodItemRow, type FoodSubstituteRow, type MealTemplateRow, type MealTemplateSlotRow } from './nutritionCatalog.ts';
import { buildProteinEnginePolicy, type ProteinEnginePolicyRow } from './proteinPolicy.ts';

export type NutritionContext = ReturnType<typeof parseNutritionContext>;

function parseNutritionContext(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('NUTRITION_CONTEXT_INVALID');
  const row = value as Record<string, unknown>;
  if (row.schema_version !== 1 || typeof row.revision !== 'string' || !/^[1-9]\d{0,18}$/.test(row.revision) ||
      !Array.isArray(row.food_rows) || !Array.isArray(row.substitute_rows) ||
      !Array.isArray(row.template_rows) || !Array.isArray(row.slot_rows) ||
      !row.policy_row || typeof row.policy_row !== 'object' || Array.isArray(row.policy_row)) {
    throw Error('NUTRITION_CONTEXT_INVALID');
  }
  return {
    revision: row.revision,
    catalog: buildNutritionCatalog({
      foodRows: row.food_rows as FoodItemRow[],
      substituteRows: row.substitute_rows as FoodSubstituteRow[],
      templateRows: row.template_rows as MealTemplateRow[],
      slotRows: row.slot_rows as MealTemplateSlotRow[],
    }),
    policy: buildProteinEnginePolicy(row.policy_row as unknown as ProteinEnginePolicyRow),
  };
}

export class NutritionContextError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super('دریافت دادهٔ معتبر برنامهٔ غذایی ممکن نشد. دوباره تلاش کنید.');
    this.code = code;
    this.status = status;
  }
}

export async function readNutritionContext(db: SupabaseClient, signal: AbortSignal, cached?: NutritionContext): Promise<NutritionContext> {
  const { data, error, status } = await db.rpc('nutrition_context_snapshot', {
    p_known_revision: cached?.revision ?? null,
  }).abortSignal(signal).retry(false);
  if (error) throw new NutritionContextError(error.code, status);
  if (cached && data?.schema_version === 1 && data.revision === cached.revision && !('food_rows' in data)) return cached;
  try {
    return parseNutritionContext(data);
  } catch {
    throw new NutritionContextError('NUTRITION_CONTEXT_INVALID', 503);
  }
}
