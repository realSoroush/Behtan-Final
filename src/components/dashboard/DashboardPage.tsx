import { usePlanReporting } from '@/hooks/usePlanReporting';
import { useMealHistory } from '@/hooks/useMealHistory';
import { historyOfMeals, mealFingerprint, type MealHistoryItem } from '@/utils/mealExperience';
import { buildPlanProvenance } from '@/utils/planProvenance';
import { ProgressJournal } from './ProgressJournal';
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
import { useProteinEnginePolicy } from '@/hooks/useProteinEnginePolicy';
import { useDailyMealProgress } from '@/hooks/useDailyMealProgress';
import { calculateFullNutritionPlanWithTrace, toPersianDigits } from '@/utils/nutritionHelpers';
import {
  generateDailyMealPlan,
  getSwapOptionsForMeal,
} from '@/utils/mealPlanEngine';
import type { DailyMealPlan, FoodSwapOption, MacroTargets, MealComponent, Meal } from '@/types';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NUTRITION_DEBUG_CONFIG } from '@/config/nutritionConfig';
import { evaluateDailyFoodQuality } from '@/utils/nutritionQuality';
import { applyDailyMealSnapshots, getLocalDateKey } from '@/utils/dailyMealProgress';
import {
  evaluateProfileMedicalEligibility,
  resolveSafeWeightLossSpeed,
} from '@/utils/medicalEligibility';

// ============================================================================
// Helper: compute consumed macros from meal checkboxes
// ============================================================================
function computeConsumedMacros(plan: DailyMealPlan, consumedOnly = true): MacroTargets {
  return plan.meals
    .filter((m) => !consumedOnly || m.consumed)
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
  const {
    policy: proteinPolicy,
    loading: proteinPolicyLoading,
    error: proteinPolicyError,
    refetch: refetchProteinPolicy,
  } = useProteinEnginePolicy();

  const [isWorkoutDay, setIsWorkoutDay] = useState(false);
  const [todayKey, setTodayKey] = useState(() => getLocalDateKey());
  const history = useMealHistory(user?.id, todayKey);
  const generationKey = `${user?.id}:${todayKey}`;
  const [generationContext, setGenerationContext] = useState<{key:string;lockedMeals:Meal[];avoidMeals:MealHistoryItem[];hydrationError:boolean}|null>(null);
  const avoidMeals = generationContext?.avoidMeals;

  useEffect(() => {
    const syncDate = () => setTodayKey(getLocalDateKey());
    const timer = window.setInterval(syncDate, 60_000);
    window.addEventListener('focus', syncDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncDate);
    };
  }, []);

  const {
    snapshots: consumedMealSnapshots,
    loading: mealProgressLoading,
    error: mealProgressError,
    savingSlots: mealProgressSavingSlots,
    setMealConsumed,
    refetch: refetchMealProgress,
  } = useDailyMealProgress(user?.id, todayKey);

  // Hydrate consumed facts once per user/day. A newly checked meal must not
  // reshuffle the other meals; lock the latest facts again only on regeneration.
  useEffect(() => {
    if (mealProgressLoading) return;
    if (generationContext?.key === generationKey && generationContext.hydrationError === Boolean(mealProgressError)) return;
    setGenerationContext({key:generationKey,lockedMeals:Object.values(consumedMealSnapshots),avoidMeals:[],hydrationError:Boolean(mealProgressError)});
  }, [mealProgressLoading, mealProgressError, consumedMealSnapshots, generationKey, generationContext?.key, generationContext?.hydrationError]);

  // Swap modal state - identifies which meal + which component within it
  const [swapMealIndex, setSwapMealIndex] = useState<number | null>(null);
  const [swapComponentIndex, setSwapComponentIndex] = useState<number | null>(null);

  // Plan state (regeneratable via date-seed rotation)
  const [planVersion, setPlanVersion] = useState(0);

  const medicalEligibility = useMemo(
    () => profile ? evaluateProfileMedicalEligibility(profile) : null,
    [profile]
  );

  // ---- Compute nutrition targets + a permanent diagnostic trace ----
  const nutritionResult = useMemo(() => {
    if (!medicalEligibility?.canGenerateAutomaticPlan || !proteinPolicy || !profile?.weight || !profile?.height || !profile?.birth_date || !profile?.gender || !profile?.activity_level || !profile?.goal) {
      return null;
    }
    return calculateFullNutritionPlanWithTrace({
      weightKg: profile.weight,
      heightCm: profile.height,
      birthDateISO: profile.birth_date,
      gender: profile.gender,
      activityLevel: profile.activity_level,
      goal: profile.goal,
      weightLossSpeed: resolveSafeWeightLossSpeed(profile.weight_loss_speed, medicalEligibility),
      bodyFatPercentage: profile.body_fat_pct ?? undefined,
      bodyFatSource: profile.body_fat_source,
      isWorkoutDay,
      trainingType: profile.activity_profile_json?.trainingType ?? null,
      // Legacy profiles predate budget preference. Keep their previous preferred-target
      // behavior instead of silently lowering protein after this release.
      proteinBudgetPreference: profile.protein_budget_preference ?? 'performance',
      proteinPolicy,
    });
  }, [profile, isWorkoutDay, proteinPolicy, medicalEligibility]);

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
    if (!catalog || !targets || history.loading || generationContext?.key !== generationKey || !profile?.weight || !profile?.dietary_preferences_json) {
      return { plan: null, error: null };
    }

    try {
      const dateKey = `${todayKey}-v${planVersion}`;
      return {
        plan: generateDailyMealPlan(
          targets,
          profile.weight,
          profile.dietary_preferences_json,
          isWorkoutDay,
          dateKey,
          {previousDay: history.meals, avoidMeals:generationContext.avoidMeals,lockedMeals:generationContext.lockedMeals}
        ),
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'تولید برنامه غذایی با خطا مواجه شد.';
      return { plan: null, error: message };
    }
  }, [catalog, targets, profile, isWorkoutDay, planVersion, todayKey, history.loading, history.meals, generationContext, generationKey]);

  const mealPlan = mealPlanResult.plan;

  // Swaps stay editable in memory; consumed state is persistent daily history.
  const [swappedPlan, setSwappedPlan] = useState<DailyMealPlan | null>(null);
  const editablePlan = swappedPlan ?? mealPlan;
  const activePlan = useMemo(
    () => applyDailyMealSnapshots(editablePlan, consumedMealSnapshots),
    [editablePlan, consumedMealSnapshots]
  );

  const provenance = useMemo(() => buildPlanProvenance(catalog, proteinPolicy), [catalog, proteinPolicy]);
  const planReporting = usePlanReporting(todayKey,
    activePlan && targets && profile?.id === user?.id && !profileLoading && !catalogLoading && !proteinPolicyLoading && !mealProgressLoading && !mealProgressError && mealProgressSavingSlots.size === 0
      ? { schemaVersion: 1, plan: activePlan, targets, trace: nutritionResult?.trace,
          isWorkoutDay, profile, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...provenance, generationSeed: `${todayKey}-v${planVersion}` }
      : null);

  const resetSwapped = useCallback(() => setSwappedPlan(null), []);

  useEffect(() => {
    setSwappedPlan(null);
    setPlanVersion(0);
    setSwapMealIndex(null);
    setSwapComponentIndex(null);
  }, [todayKey]);

  const regenerate = () => {
    setGenerationContext({key:generationKey,lockedMeals:Object.values(consumedMealSnapshots),avoidMeals:activePlan ? historyOfMeals(activePlan.meals.filter(m => !m.consumed)) : [],hydrationError:Boolean(mealProgressError)});
    setPlanVersion(v => v + 1);
    resetSwapped();
  };

  const handleToggleConsumed = (mealIdx: number) => {
    const meal = activePlan?.meals[mealIdx];
    if (!meal || mealProgressError || mealProgressSavingSlots.has(meal.slot)) return;
    void setMealConsumed(meal, !meal.consumed).catch(() => {});
  };

  const handleSwapComponent = (mealIdx: number, componentIdx: number) => {
    if (activePlan?.meals[mealIdx]?.consumed) return;
    setSwapMealIndex(mealIdx);
    setSwapComponentIndex(componentIdx);
  };

  const handleSwapSelect = (option: FoodSwapOption) => {
    if (!option.isEquivalent || !editablePlan || swapMealIndex === null) return;
    const updated = {
      ...editablePlan,
      meals: editablePlan.meals.map((m, i) => (i === swapMealIndex ? option.updatedMeal : m)),
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
  const planned = activePlan ? computeConsumedMacros(activePlan, false) : undefined;
  const unchangedAfterRegeneration = avoidMeals && avoidMeals.length > 0 && activePlan && avoidMeals.every(previous => {
    const current = activePlan.meals.find(m => m.slot === previous.slot);
    return current && mealFingerprint(previous.foodIds) === mealFingerprint(current.components.map(c => c.foodItem.id));
  });
  const foodQuality = useMemo(
    () => activePlan && targets
      ? evaluateDailyFoodQuality(activePlan.meals, targets.targetCalories)
      : null,
    [activePlan, targets]
  );

  // ---- Loading / error states ----
  if (profileLoading || catalogLoading || proteinPolicyLoading || mealProgressLoading || history.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-neutral-500 dark:text-neutral-400">در حال بارگذاری برنامه و تنظیمات موتور تغذیه...</p>
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

  if (proteinPolicyError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="max-w-sm text-center space-y-4">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">{proteinPolicyError}</p>
          <button
            type="button"
            onClick={() => void refetchProteinPolicy()}
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
                    planned={planned}
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
        <WorkoutDayToggle isWorkoutDay={isWorkoutDay} onChange={(v) => { setIsWorkoutDay(v); resetSwapped(); setGenerationContext({key:generationKey,lockedMeals:Object.values(consumedMealSnapshots),avoidMeals:[],hydrationError:Boolean(mealProgressError)}); }} />

        {planReporting.error && <div role="status" className="text-sm text-amber-600 p-3">
          ذخیرهٔ نسخهٔ برنامه انجام نشد؛ اتصال را بررسی کنید.
          <button type="button" onClick={planReporting.retry} className="underline mr-2">تلاش دوباره</button>
        </div>}
        {/* Regenerate plan button */}
        <button
          type="button"
          onClick={regenerate}
          disabled={Boolean(activePlan?.meals.every(m => m.consumed)) || mealProgressSavingSlots.size > 0 || Boolean(mealProgressError)}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <RefreshCw size={14} />
          تغییر وعده‌های باقی‌مانده
        </button>
        {unchangedAfterRegeneration && <p role="status" className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">با محدودیت‌های فعلی، ترکیب متفاوت مناسبی پیدا نشد؛ غذاهای پیشنهادی مشابه‌اند.</p>}
        {activePlan?.remainingTargetsUnmet && <p role="status" className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">وعده‌های مصرف‌شده حفظ شدند؛ با گزینه‌های باقی‌مانده، مجموع امروز کاملاً در محدودهٔ هدف قرار نگرفت. جزئیات را در جدول هدف و برنامه ببین.</p>}
        {history.error && <p className="text-xs text-neutral-500 dark:text-neutral-400">سابقهٔ دیروز دریافت نشد؛ کنترل تکرار فعلاً فقط برای وعده‌های امروز انجام می‌شود.</p>}

        {mealProgressError && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
              {mealProgressError} تا همگام‌سازی مجدد، تغییر تیک وعده‌ها غیرفعال است.
            </p>
            <button
              type="button"
              onClick={() => void refetchMealProgress()}
              className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-800 px-2.5 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200"
            >
              <RefreshCw size={12} />
              تلاش دوباره
            </button>
          </div>
        )}

        {/* Meals section */}
        {mealPlanResult.error ? (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-5 text-center space-y-3">
            <AlertCircle size={34} className="text-amber-600 dark:text-amber-400 mx-auto" />
            <p className="font-bold text-neutral-900 dark:text-neutral-100">امکان ساخت برنامه واقع‌بینانه وجود ندارد</p>
            <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-300">{mealPlanResult.error}</p>
            <button
              type="button"
              onClick={regenerate}
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
                isConsumedSaving={mealProgressSavingSlots.has(meal.slot)}
                consumedToggleDisabled={Boolean(mealProgressError)}
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

      {user && <div className="max-w-md mx-auto px-4 mt-4"><ProgressJournal key={`${user.id}:${todayKey}`} userId={user.id} today={todayKey} /></div>}

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
