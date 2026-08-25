import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { configureNutritionCatalog } from '@/utils/mealPlanEngine';
import {
  buildNutritionCatalog,
  type FoodItemRow,
  type FoodSubstituteRow,
  type MealTemplateRow,
  type MealTemplateSlotRow,
} from '@/utils/nutritionCatalog';
import type { NutritionCatalog } from '@/types';

interface UseNutritionCatalogReturn {
  catalog: NutritionCatalog | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useNutritionCatalog(): UseNutritionCatalogReturn {
  const [catalog, setCatalog] = useState<NutritionCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [foodsResult, substitutesResult, templatesResult, slotsResult] = await Promise.all([
      supabase
        .from('food_items')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('food_substitutes')
        .select('*')
        .eq('is_active', true),
      supabase
        .from('meal_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('meal_template_slots')
        .select('*')
        .order('template_id', { ascending: true })
        .order('position', { ascending: true }),
    ]);

    const firstError =
      foodsResult.error ??
      substitutesResult.error ??
      templatesResult.error ??
      slotsResult.error;

    if (firstError) {
      console.error('[useNutritionCatalog] Supabase catalog fetch failed:', firstError);
      setCatalog(null);
      setError('دریافت دیتابیس غذایی با خطا مواجه شد. دوباره تلاش کنید.');
      setLoading(false);
      return;
    }

    try {
      const nextCatalog = buildNutritionCatalog({
        foodRows: (foodsResult.data ?? []) as FoodItemRow[],
        substituteRows: (substitutesResult.data ?? []) as FoodSubstituteRow[],
        templateRows: (templatesResult.data ?? []) as MealTemplateRow[],
        slotRows: (slotsResult.data ?? []) as MealTemplateSlotRow[],
      });

      // Configure the deterministic engine before publishing `catalog` to the
      // React tree. A render that sees catalog != null can therefore safely
      // generate meals synchronously.
      configureNutritionCatalog(nextCatalog);
      setCatalog(nextCatalog);
    } catch (catalogError) {
      console.error('[useNutritionCatalog] Catalog validation failed:', catalogError);
      setCatalog(null);
      setError(
        catalogError instanceof Error
          ? `دیتابیس غذایی نامعتبر است: ${catalogError.message}`
          : 'ساختار دیتابیس غذایی نامعتبر است.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  return { catalog, loading, error, refetch: fetchCatalog };
}
