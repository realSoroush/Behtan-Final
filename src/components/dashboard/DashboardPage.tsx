import { useCallback, useMemo, useState } from 'react';
import { LogOut, RefreshCw, AlertCircle } from 'lucide-react';
import { MacroSummary } from './MacroSummary';
import { WorkoutDayToggle } from './WorkoutDayToggle';
import { MealCard } from './MealCard';
import { FoodSwapModal } from './FoodSwapModal';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { calculateFullNutritionPlan, toPersianDigits } from '@/utils/nutritionHelpers';
import {
  generateDailyMealPlan,
  getSwapCandidatesForComponent,
  swapComponentInMeal,
  getSlotTargets,
} from '@/utils/mealPlanEngine';
import type { DailyMealPlan, FoodItem, MacroTargets, MealComponent } from '@/types';

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

  const [isWorkoutDay, setIsWorkoutDay] = useState(false);

  // Swap modal state - identifies which meal + which component within it
  const [swapMealIndex, setSwapMealIndex] = useState<number | null>(null);
  const [swapComponentIndex, setSwapComponentIndex] = useState<number | null>(null);

  // Plan state (regeneratable via date-seed rotation)
  const [planVersion, setPlanVersion] = useState(0);

  // ---- Compute nutrition targets (dynamic per user: weight/goal/gender/etc.) ----
  const targets = useMemo<MacroTargets | null>(() => {
    if (!profile?.weight || !profile?.height || !profile?.birth_date || !profile?.gender || !profile?.activity_level || !profile?.goal) {
      return null;
    }
    return calculateFullNutritionPlan({
      weightKg: profile.weight,
      heightCm: profile.height,
      birthDateISO: profile.birth_date,
      gender: profile.gender,
      activityLevel: profile.activity_level,
      goal: profile.goal,
      weightLossSpeed: profile.weight_loss_speed ?? undefined,
      bodyFatPercentage: profile.body_fat_pct ?? undefined,
      isWorkoutDay,
    });
  }, [profile, isWorkoutDay]);

  // ---- Generate meal plan (no DB fetch needed - engine is self-contained) ----
  const mealPlan = useMemo<DailyMealPlan | null>(() => {
    if (!targets || !profile?.weight || !profile?.dietary_preferences_json) return null;
    const dateKey = `${new Date().toISOString().slice(0, 10)}-v${planVersion}`;
    return generateDailyMealPlan(targets, profile.weight, profile.dietary_preferences_json, isWorkoutDay, dateKey);
  }, [targets, profile, isWorkoutDay, planVersion]);

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

  const handleSwapSelect = (replacement: FoodItem) => {
    if (!activePlan || swapMealIndex === null || swapComponentIndex === null || !targets) return;
    const meal = activePlan.meals[swapMealIndex];
    const slotTargets = getSlotTargets(meal.slot, targets);
    const updatedMeal = swapComponentInMeal(meal, swapComponentIndex, replacement, slotTargets);
    const updated = {
      ...activePlan,
      meals: activePlan.meals.map((m, i) => (i === swapMealIndex ? updatedMeal : m)),
    };
    setSwappedPlan(updated);
  };

  const swapCurrentComponent: MealComponent | null =
    swapMealIndex !== null && swapComponentIndex !== null && activePlan
      ? activePlan.meals[swapMealIndex]?.components[swapComponentIndex] ?? null
      : null;

  const swapCandidates = useMemo<FoodItem[]>(() => {
    if (!swapCurrentComponent || !profile?.dietary_preferences_json) return [];
    return getSwapCandidatesForComponent(swapCurrentComponent, profile.dietary_preferences_json);
  }, [swapCurrentComponent, profile]);

  const consumed = activePlan ? computeConsumedMacros(activePlan) : null;

  // ---- Loading / error states ----
  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-neutral-500 dark:text-neutral-400">در حال بارگذاری برنامه...</p>
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
          <button onClick={signOut} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors p-1">
            <LogOut size={20} />
          </button>
          <div className="text-right">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{today}</p>
            <p className="font-bold text-neutral-900 dark:text-neutral-100 text-sm">برنامه غذایی امروز</p>
          </div>
          <span className="text-2xl">🥗</span>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Macro summary */}
        {targets && consumed && (
          <MacroSummary targets={targets} consumed={consumed} isWorkoutDay={isWorkoutDay} />
        )}

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
        {activePlan ? (
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
