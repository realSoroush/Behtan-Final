import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, RefreshCw, AlertCircle } from 'lucide-react';
import { MacroSummary } from './MacroSummary';
import { NutritionQualitySummary } from './NutritionQualitySummary';
import { DailyOverviewCarousel } from './DailyOverviewCarousel';
import { WorkoutDayToggle } from './WorkoutDayToggle';
import { MealCard } from './MealCard';
import { FoodSwapModal } from './FoodSwapModal';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNutritionCatalog } from '@/hooks/useNutritionCatalog';
import { calculateFullNutritionPlanWithTrace, toPersianDigits } from '@/utils/nutritionHelpers';
import {
  generateDailyMealPlan,
  getSwapOptionsForMeal,
} from '@/utils/mealPlanEngine';
import type { DailyMealPlan, FoodSwapOption, MacroTargets, MealComponent } from '@/types';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NUTRITION_DEBUG_CONFIG } from '@/config/nutritionConfig';
import { evaluateDailyFoodQuality } from '@/utils/nutritionQuality';

// ============================================================================
// Helper: compute consumed macros from meal checkboxes
// ============================================================================
function computeConsumedMacros(plan: DailyMealPlan): MacroTargets {
  return plan.meals
    .filter((m) => m.consumed)
    .reduce((acc, m) => ({
      targetCalories: acc.targetCalories + m.totalKcal,
      proteinGrams: acc.proteinGrams + m.totalProtein,
      carbGrams: acc.carbGrams + m.totalCarbs,
      fatGrams: acc.fatGrams + m.totalFat,
      proteinCal: acc.proteinCal + m.totalProtein * 4,
      fatCal: acc.fatCal + m.totalFat * 9,
      carbCal: acc.carbCal + m.totalCarbs * 4,
    }), {
      targetCalories: 0, proteinGrams: 0, carbGrams: 0, fatGrams: 0,
      proteinCal: 0, fatCal: 0, carbCal: 0,
    });
}

// ============================================================================
// DashboardPage
// ============================================================================

export function DashboardPage() {
  const { user, signOut } = useAuth();
  const { profile, loading: profileLoading, error: profileError } = useUserProfile(user?.id);
  const {
    catalog,
    loading: catalogLoading,
    error: catalogError,
    refetch: refetchCatalog,
  } = useNutritionCatalog();

  const [isWorkoutDay, setIsWorkoutDay] = useState(false);

  // Swap modal state - identifies which meal + which component within it
  const [swapMealIndex, setSwapMealIndex] = useState<number | null>(null);
  const [swapComponentIndex, setSwapComponentIndex] = useState<number | null>(null);

  // Plan state (regeneratable via date-seed rotation)
  const [planVersion, setPlanVersion] = useState(0);

  // ---- Compute nutrition targets + a permanent diagnostic trace ----
  const nutritionResult = useMemo(() => {
    if (!profile?.weight || !profile?.height || !profile?.birth_date || !profile?.gender || !profile?.activity_level || !profile?.goal) {
      return null;
    }
    return calculateFullNutritionPlanWithTrace({
      weightKg: profile.weight,
      heightCm: profile.height,
      birthDateISO: profile.birth_date,
      gender: profile.gender,
      activityLevel: profile.activity_level,
      goal: profile.goal,
      weightLossSpeed: profile.weight_loss_speed ?? undefined,
      bodyFatPercentage: profile.body_fat_pct ?? undefined,
      bodyFatSource: profile.body_fat_source,
      isWorkoutDay,
      trainingType: profile.activity_profile_json?.trainingType ?? null,
    });
  }, [profile, isWorkoutDay]);

  const targets: MacroTargets | null = nutritionResult?.targets ?? null;

  useEffect(() => {
    if (!NUTRITION_DEBUG_CONFIG.isActive || !nutritionResult) return;
    console.groupCollapsed('[Behtan Nutrition Trace]');
    console.table(nutritionResult.trace);
    console.log('Targets', nutritionResult.targets);
    console.groupEnd();
  }, [nutritionResult]);

  // ---- Generate meal plan after the live Supabase nutrition catalog loads ----
  // Generation can intentionally fail when nutrition targets cannot be met
  // without violating practical portion limits. Keep that failure local to the
  // dashboard instead of letting it crash the React tree / Error Boundary.
  const mealPlanResult = useMemo<{ plan: DailyMealPlan | null; error: string | null }>(() => {
    if (!catalog || !targets || !profile?.weight || !profile?.dietary_preferences_json) {
      return { plan: null, error: null };
    }

    try {
      const dateKey = `${new Date().toISOString().slice(0, 10)}-v${planVersion}`;
      return {
        plan: generateDailyMealPlan(
          targets,
          profile.weight,
          profile.dietary_preferences_json,
          isWorkoutDay,
          dateKey
        ),
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'تولید برنامه غذایی با خطا مواجه شد.';
      return { plan: null, error: message };
    }
  }, [catalog, targets, profile, isWorkoutDay, planVersion]);

  const mealPlan = mealPlanResult.plan;

  // Apply per-meal consumed toggles and any swaps on top of the generated plan
  const [swappedPlan, setSwappedPlan] = useState<DailyMealPlan | null>(null);
  const activePlan = swappedPlan ?? mealPlan;

  const resetSwapped = useCallback(() => setSwappedPlan(null), []);

  const handleToggleConsumed = (mealIdx: number) => {
    if (!activePlan) return;
    const updated = {
      ...activePlan,
      meals: activePlan.meals.map((m, i) => (i === mealIdx ? { ...m, consumed: !m.consumed } : m)),
    };
    setSwappedPlan(updated);
  };

  const handleSwapComponent = (mealIdx: number, componentIdx: number) => {
    setSwapMealIndex(mealIdx);
    setSwapComponentIndex(componentIdx);
  };

  const handleSwapSelect = (option: FoodSwapOption) => {
    if (!option.isEquivalent || !activePlan || swapMealIndex === null) return;
    const updated = {
      ...activePlan,
      meals: activePlan.meals.map((m, i) => (i === swapMealIndex ? option.updatedMeal : m)),
    };
    setSwappedPlan(updated);
  };

  const swapCurrentComponent: MealComponent | null =
    swapMealIndex !== null && swapComponentIndex !== null && activePlan
      ? activePlan.meals[swapMealIndex]?.components[swapComponentIndex] ?? null
      : null;

  // Stable baseline for repeated swaps. Even after A -> B -> C, equivalence is
  // always measured against the component generated by the original daily plan.
  const swapReferenceComponent: MealComponent | null =
    swapMealIndex !== null && swapComponentIndex !== null && mealPlan
      ? mealPlan.meals[swapMealIndex]?.components[swapComponentIndex] ?? null
      : null;

  const swapCandidates = useMemo<FoodSwapOption[]>(() => {
    if (
      !catalog ||
      !swapCurrentComponent ||
      !profile?.dietary_preferences_json ||
      !activePlan ||
      swapMealIndex === null ||
      swapComponentIndex === null
    ) return [];
    return getSwapOptionsForMeal(
      activePlan.meals[swapMealIndex],
      swapComponentIndex,
      profile.dietary_preferences_json,
      swapReferenceComponent ?? undefined
    );
  }, [
    catalog,
    swapCurrentComponent,
    swapReferenceComponent,
    profile,
    activePlan,
    swapMealIndex,
    swapComponentIndex,
  ]);

  const consumed = activePlan ? computeConsumedMacros(activePlan) : null;
  const foodQuality = useMemo(
    () => activePlan && targets
      ? evaluateDailyFoodQuality(activePlan.meals, targets.targetCalories)
      : null,
    [activePlan, targets]
  );

  // ---- Loading / error states ----
  if (profileLoading || catalogLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-neutral-500 dark:text-neutral-400">در حال بارگذاری برنامه و دیتابیس غذایی...</p>
        </div>
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="max-w-sm text-center space-y-4">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">{catalogError}</p>
          <button
            type="button"
            onClick={() => void refetchCatalog()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm font-semibold"
          >
            <RefreshCw size={14} />
            تلاش دوباره
          </button>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center space-y-3">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">{profileError}</p>
        </div>
      </div>
    );
  }

  // Today's date in Persian-style display
  const today = new Date().toLocaleDateString('fa-IR', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-100 dark:border-neutral-800">
        <div className="max-w-md mx-auto flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <button
              type="button"
              onClick={signOut}
              aria-label="خروج از حساب"
              title="خروج از حساب"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <LogOut size={19} />
            </button>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{today}</p>
            <p className="font-bold text-neutral-900 dark:text-neutral-100 text-sm">برنامه غذایی امروز</p>
          </div>
          <img src={APP_LOGO_PATH} alt={`لوگوی ${APP_NAME_FA}`} className="h-8 w-8 object-contain" />
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Daily overview carousel */}
        {(targets && consumed) || foodQuality ? (
          <DailyOverviewCarousel
            slides={[
              ...(targets && consumed ? [{
                id: 'macro-summary',
                label: 'خلاصه امروز',
                content: (
                  <MacroSummary
                    targets={targets}
                    consumed={consumed}
                    isWorkoutDay={isWorkoutDay}
                  />
                ),
              }] : []),
              ...(foodQuality ? [{
                id: 'nutrition-quality',
                label: 'کیفیت برنامه امروز',
                content: <NutritionQualitySummary quality={foodQuality} />,
              }] : []),
            ]}
          />
        ) : null}

        {/* Workout day toggle */}
        <WorkoutDayToggle isWorkoutDay={isWorkoutDay} onChange={(v) => { setIsWorkoutDay(v); resetSwapped(); }} />

        {/* Regenerate plan button */}
        <button
          type="button"
          onClick={() => { setPlanVersion((v) => v + 1); resetSwapped(); }}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <RefreshCw size={14} />
          تولید برنامه غذایی جدید
        </button>

        {/* Meals section */}
        {mealPlanResult.error ? (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-5 text-center space-y-3">
            <AlertCircle size={34} className="text-amber-600 dark:text-amber-400 mx-auto" />
            <p className="font-bold text-neutral-900 dark:text-neutral-100">امکان ساخت برنامه واقع‌بینانه وجود ندارد</p>
            <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-300">{mealPlanResult.error}</p>
            <button
              type="button"
              onClick={() => { setPlanVersion((v) => v + 1); resetSwapped(); }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-sm font-semibold"
            >
              <RefreshCw size={14} />
              تلاش دوباره
            </button>
          </div>
        ) : activePlan ? (
          <div className="space-y-3">
            <h2 className="font-bold text-neutral-900 dark:text-neutral-100">وعده‌های غذایی امروز</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              هدف: {toPersianDigits(targets?.targetCalories ?? 0)} کالری در {toPersianDigits(activePlan.meals.length)} وعده
            </p>
            {activePlan.meals.map((meal, mealIdx) => (
              <MealCard
                key={meal.slot}
                meal={meal}
                onToggleConsumed={() => handleToggleConsumed(mealIdx)}
                onSwapComponent={(componentIdx) => handleSwapComponent(mealIdx, componentIdx)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-neutral-400 dark:text-neutral-500">
            <p>برنامه غذایی در حال آماده‌سازی است...</p>
          </div>
        )}
      </div>

      {/* Swap modal */}
      <FoodSwapModal
        isOpen={swapMealIndex !== null}
        onClose={() => { setSwapMealIndex(null); setSwapComponentIndex(null); }}
        currentComponent={swapCurrentComponent}
        candidates={swapCandidates}
        onSelect={handleSwapSelect}
      />
    </div>
  );
}
