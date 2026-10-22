import './member-app.css';
import { MemberMealConfirmation } from './MemberMealConfirmation';
import { isCurrentMealConfirmation, type PendingMealConfirmation } from '@/utils/memberMealConfirmation';
import { FoodScanPanel } from './FoodScanPanel';
import { scannedMeal, type FoodScanResult } from '@/utils/foodScan';
import { changeMemberMeal } from '@/utils/changeMemberMeal';
import { ProgressJournal } from './ProgressJournal';
import { MemberAnalytics } from './MemberAnalytics';
import { WeekPlanner } from './WeekPlanner';
import { useMemberMealSchedule } from '@/hooks/useMemberMealSchedule';
import { contentFingerprint } from '@/utils/planProvenance';
import { nextMealIndex, addPlanDays, withSwapBaseline, prescriptionForSchedule, swapBaselineComponent, type MemberScheduledPlan } from '@/utils/mealPresentation';
import { MemberCompanion } from './MemberCompanion';
import { MemberDialog } from './MemberDialog';
import { MemberWorkoutToggle } from './MemberWorkoutToggle';
import { getDailyCompanion } from '@/components/companion/companionState';
import { BehtanMascot } from '@/components/companion/BehtanMascot';
import { usePlanReporting } from '@/hooks/usePlanReporting';
import { useMealHistory } from '@/hooks/useMealHistory';
import {
  historyOfMeals,
  mealFingerprint,
  type MealHistoryItem,
} from '@/utils/mealExperience';
import { buildPlanProvenance } from '@/utils/planProvenance';
import { MemberProfile } from './MemberProfile';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  LogOut,
  RefreshCw,
  AlertCircle,
  Utensils,
  UserRound,
  Check,
  TrendingUp,
  CalendarDays,
  ScanLine,
  Undo2,
  X,
} from 'lucide-react';
import { MemberMacroSummary as MacroSummary } from './MemberMacroSummary';
import { NutritionQualitySummary } from './NutritionQualitySummary';
import { MemberMealCard as MealCard } from './MemberMealCard';
import { MemberSwapSheet as FoodSwapModal } from './MemberSwapSheet';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNutritionCatalog } from '@/hooks/useNutritionCatalog';
import { useProteinEnginePolicy } from '@/hooks/useProteinEnginePolicy';
import { useDailyMealProgress } from '@/hooks/useDailyMealProgress';
import {
  calculateFullNutritionPlanWithTrace,
  toPersianDigits,
} from '@/utils/nutritionHelpers';
import {
  generateDailyMealPlan,
  getSwapOptionsForMeal,
} from '@/utils/mealPlanEngine';
import type {
  DailyMealPlan,
  FoodSwapOption,
  MacroTargets,
  MealComponent,
  Meal,
} from '@/types';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NUTRITION_DEBUG_CONFIG } from '@/config/nutritionConfig';
import { evaluateDailyFoodQuality } from '@/utils/nutritionQuality';
import {
  applyDailyMealSnapshots,
  getLocalDateKey,
} from '@/utils/dailyMealProgress';
import {
  evaluateProfileMedicalEligibility,
  resolveSafeWeightLossSpeed,
} from '@/utils/medicalEligibility';

// ============================================================================
// Helper: compute consumed macros from meal checkboxes
// ============================================================================
function computeConsumedMacros(
  plan: DailyMealPlan,
  consumedOnly = true,
): MacroTargets {
  return plan.meals
    .filter((m) => !consumedOnly || m.consumed)
    .reduce(
      (acc, m) => ({
        targetCalories: acc.targetCalories + m.totalKcal,
        proteinGrams: acc.proteinGrams + m.totalProtein,
        carbGrams: acc.carbGrams + m.totalCarbs,
        fatGrams: acc.fatGrams + m.totalFat,
        proteinCal: acc.proteinCal + m.totalProtein * 4,
        fatCal: acc.fatCal + m.totalFat * 9,
        carbCal: acc.carbCal + m.totalCarbs * 4,
      }),
      {
        targetCalories: 0,
        proteinGrams: 0,
        carbGrams: 0,
        fatGrams: 0,
        proteinCal: 0,
        fatCal: 0,
        carbCal: 0,
      },
    );
}

// ============================================================================
// DashboardPage
// ============================================================================

export function DashboardPage() {
  const { user, signOut } = useAuth();
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfile(user?.id);
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

  const [section, setSection] = useState<'today' | 'profile' | 'progress'>(
    () =>
      window.location.hash === '#profile'
        ? 'profile'
        : window.location.hash === '#progress'
          ? 'progress'
          : 'today',
  );
  const [progressVisited, setProgressVisited] = useState(
    () => window.location.hash === '#progress',
  );
  const [dayOpen, setDayOpen] = useState(false);
  const [pendingMeal,setPendingMeal]=useState<PendingMealConfirmation|null>(null);
  const [scanOpen,setScanOpen]=useState(false);
  const [viewDate,setViewDate]=useState<string|null>(null);
  const [dayLoading,setDayLoading]=useState<string|null>(null);
  const [viewError,setViewError]=useState('');
  const [changingMeal,setChangingMeal]=useState(false);
  const mealChangeInFlight=useRef(false);
  const [receipt, setReceipt] = useState<{date:string;slot:Meal['slot'];label:string}|null>(null);
  const [weekOpen, setWeekOpen] = useState(false);
  const [scheduleSyncError, setScheduleSyncError] = useState(false);
  const [scheduleSyncRetry, setScheduleSyncRetry] = useState(0);
  const [profileVisited, setProfileVisited] = useState(
    () => window.location.hash === '#profile',
  );
  useEffect(() => {
    const sync = () => {
      const next =
        window.location.hash === '#profile'
          ? 'profile'
          : window.location.hash === '#progress'
            ? 'progress'
            : 'today';
      setSection(next);
      if (next === 'profile') setProfileVisited(true);
      if (next === 'progress') setProgressVisited(true);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const navigate = (next: 'today' | 'profile' | 'progress') => {
    setScanOpen(false);
    if (next === section) return;
    window.location.hash = next;
    setSection(next);
    if (next === 'profile') setProfileVisited(true);
    if (next === 'progress') setProgressVisited(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const [workoutChoice, setWorkoutChoice] = useState<{
    key: string;
    value: boolean;
  } | null>(null);
  const [todayKey, setTodayKey] = useState(() => getLocalDateKey());
  const history = useMealHistory(user?.id, todayKey);
  const scheduleContext = useMemo(
    () =>
      profile && catalog && proteinPolicy
        ? contentFingerprint({
            profile,
            catalog,
            proteinPolicy,
            presentationVersion: 1,
          })
        : null,
    [profile, catalog, proteinPolicy],
  );
  const schedule = useMemberMealSchedule(user?.id, todayKey, scheduleContext);
  const scheduledToday = schedule.plans[todayKey];
  const generationKey = `${user?.id}:${todayKey}`;
  const [companionEvent, setCompanionEvent] = useState<{
    key: string;
    type: 'recorded' | 'swapped';
    nonce: number;
  } | null>(null);
  useEffect(() => {
    if (!companionEvent) return;
    const timeout = window.setTimeout(() => setCompanionEvent(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [companionEvent]);
  const isWorkoutDay =
    workoutChoice?.key === generationKey ? workoutChoice.value : false;
  const setIsWorkoutDay = (value: boolean) => {
    setWorkoutChoice({ key: generationKey, value });
    try {
      localStorage.setItem(`behtan:workout:${generationKey}`, String(value));
    } catch {
      /* Storage unavailable; still works in this session. */
    }
  };
  useEffect(() => {
    if (!scheduleContext || schedule.loading) return;
    let value = scheduledToday?.isWorkoutDay ?? false;
    try {
      const saved = localStorage.getItem(`behtan:workout:${generationKey}`);
      if (!scheduledToday && saved !== null) value = saved === 'true';
    } catch {
      /* optional persistence */
    }
    setWorkoutChoice((previous) =>
      previous?.key === generationKey
        ? previous
        : { key: generationKey, value },
    );
  }, [
    generationKey,
    scheduleContext,
    schedule.loading,
    scheduledToday?.isWorkoutDay,
  ]);
  const [generationContext, setGenerationContext] = useState<{
    key: string;
    lockedMeals: Meal[];
    avoidMeals: MealHistoryItem[];
    hydrationError: boolean;
  } | null>(null);
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

  useEffect(() => {
    if (
      !mealProgressLoading &&
      consumedMealSnapshots.post_workout &&
      !isWorkoutDay
    )
      setIsWorkoutDay(true);
  }, [mealProgressLoading, consumedMealSnapshots, isWorkoutDay]);

  // Hydrate consumed facts once per user/day. A newly checked meal must not
  // reshuffle the other meals; lock the latest facts again only on regeneration.
  useEffect(() => {
    if (mealProgressLoading) return;
    if (
      generationContext?.key === generationKey &&
      generationContext.hydrationError === Boolean(mealProgressError)
    )
      return;
    setGenerationContext({
      key: generationKey,
      lockedMeals: Object.values(consumedMealSnapshots),
      avoidMeals: [],
      hydrationError: Boolean(mealProgressError),
    });
  }, [
    mealProgressLoading,
    mealProgressError,
    consumedMealSnapshots,
    generationKey,
    generationContext?.key,
    generationContext?.hydrationError,
  ]);

  // Swap modal state - identifies which meal + which component within it
  const [swapMealIndex, setSwapMealIndex] = useState<number | null>(null);
  const [swapComponentIndex, setSwapComponentIndex] = useState<number | null>(
    null,
  );

  // Plan state (regeneratable via date-seed rotation)
  const [planVersion, setPlanVersion] = useState(0);

  const medicalEligibility = useMemo(
    () => (profile ? evaluateProfileMedicalEligibility(profile) : null),
    [profile],
  );

  // ---- Compute nutrition targets + a permanent diagnostic trace ----
  const computeNutrition = useCallback((workout:boolean) => {
    if (
      !medicalEligibility?.canGenerateAutomaticPlan ||
      !proteinPolicy ||
      !profile?.weight ||
      !profile?.height ||
      !profile?.birth_date ||
      !profile?.gender ||
      !profile?.activity_level ||
      !profile?.goal
    ) {
      return null;
    }
    return calculateFullNutritionPlanWithTrace({
      weightKg: profile.weight,
      heightCm: profile.height,
      birthDateISO: profile.birth_date,
      gender: profile.gender,
      activityLevel: profile.activity_level,
      goal: profile.goal,
      weightLossSpeed: resolveSafeWeightLossSpeed(
        profile.weight_loss_speed,
        medicalEligibility,
      ),
      bodyFatPercentage: profile.body_fat_pct ?? undefined,
      bodyFatSource: profile.body_fat_source,
      isWorkoutDay:workout,
      trainingType: profile.activity_profile_json?.trainingType ?? null,
      // Legacy profiles predate budget preference. Keep their previous preferred-target
      // behavior instead of silently lowering protein after this release.
      proteinBudgetPreference:
        profile.protein_budget_preference ?? 'performance',
      proteinPolicy,
    });
  }, [profile, proteinPolicy, medicalEligibility]);
  const nutritionResult=useMemo(()=>computeNutrition(isWorkoutDay),[computeNutrition,isWorkoutDay]);

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
  const mealPlanResult = useMemo<{
    plan: DailyMealPlan | null;
    error: string | null;
  }>(() => {
    if (
      schedule.loading ||
      workoutChoice?.key !== generationKey ||
      !catalog ||
      !targets ||
      history.loading ||
      generationContext?.key !== generationKey ||
      !profile?.weight ||
      !profile?.dietary_preferences_json
    ) {
      return { plan: null, error: null };
    }

    try {
      if (
        planVersion === 0 &&
        scheduledToday &&
        scheduledToday.isWorkoutDay === isWorkoutDay &&
        ['targetCalories', 'proteinGrams', 'carbGrams', 'fatGrams'].every(
          (k) =>
            Math.abs(
              scheduledToday.targets[k as keyof MacroTargets] -
                targets[k as keyof MacroTargets],
            ) < 0.1,
        )
      )
        return { plan: scheduledToday, error: null };
      const dateKey = `${todayKey}-v${planVersion}`;
      return {
        plan: generateDailyMealPlan(
          targets,
          profile.weight,
          profile.dietary_preferences_json,
          isWorkoutDay,
          dateKey,
          {
            previousDay: history.meals,
            avoidMeals: generationContext.avoidMeals,
            lockedMeals: generationContext.lockedMeals,
            proteinBudgetPreference:
              profile.protein_budget_preference ?? 'performance',
          },
        ),
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'تولید برنامه غذایی با خطا مواجه شد.';
      return { plan: null, error: message };
    }
  }, [
    catalog,
    targets,
    profile,
    isWorkoutDay,
    planVersion,
    todayKey,
    history.loading,
    history.meals,
    generationContext,
    generationKey,
    workoutChoice?.key,
    schedule.loading,
    scheduledToday,
  ]);

  const mealPlan = mealPlanResult.plan;

  // Swaps stay editable in memory; consumed state is persistent daily history.
  const [swappedPlan, setSwappedPlan] = useState<DailyMealPlan | null>(null);
  const editablePlan = swappedPlan ?? mealPlan;
  const activePlan = useMemo(
    () => applyDailyMealSnapshots(editablePlan, consumedMealSnapshots),
    [editablePlan, consumedMealSnapshots],
  );

  const selectedDate=viewDate&&viewDate>=todayKey&&viewDate<=addPlanDays(todayKey,2)?viewDate:todayKey;
  const viewingToday=selectedDate===todayKey;
  const viewedPlan=viewingToday?activePlan:schedule.plans[selectedDate]??null;
  const selectDay=async(date:string)=>{
    setViewDate(date);setViewError('');setDayOpen(false);
    if(date===todayKey||schedule.plans[date])return;
    if(!profile?.weight||!profile.dietary_preferences_json||!medicalEligibility?.canGenerateAutomaticPlan)return;
    setDayLoading(date);
    try{
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const futureTargets=computeNutrition(false)?.targets;if(!futureTargets)throw Error('اطلاعات برنامه کامل نیست.');
      const future=generateDailyMealPlan(futureTargets,profile.weight,profile.dietary_preferences_json,false,date+'-v0',{previousDay:activePlan?historyOfMeals(activePlan.meals):[],proteinBudgetPreference:profile.protein_budget_preference??'performance'});
      await schedule.save([{date,plan:future}]);
    }catch(e){setViewError(e instanceof Error?e.message:'برنامهٔ این روز آماده نشد.');}
    finally{setDayLoading(current=>current===date?null:current);}
  };
  const changeVisibleMeal=async(index:number)=>{
    if(!viewedPlan||!profile?.weight||!profile.dietary_preferences_json||mealChangeInFlight.current)return;
    mealChangeInFlight.current=true;setChangingMeal(true);setViewError('');
    try{
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const next=changeMemberMeal(withSwapBaseline(viewedPlan,(editablePlan??viewedPlan) as MemberScheduledPlan),index,profile.weight,profile.dietary_preferences_json,profile.protein_budget_preference??'performance',selectedDate+'-'+Date.now());
      if(viewingToday)setSwappedPlan(next);else await schedule.save([{date:selectedDate,plan:next}],true);
    }catch(e){setViewError(e instanceof Error?e.message:'تغییر وعده انجام نشد.');}
    finally{mealChangeInFlight.current=false;setChangingMeal(false);}
  };
  const saveScannedFood=async(result:FoodScanResult,slot:Meal['slot'])=>{
    const original=activePlan?.meals.find(m=>m.slot===slot);if(!original||mealProgressError||mealProgressSavingSlots.has(slot))throw Error('وعده در حال ثبت است یا آماده نیست.');
    const meal=scannedMeal(result,slot,original.label);
    await setMealConsumed(meal,true);
    setReceipt({date:todayKey,slot,label:'وعدهٔ دلخواه'});setScanOpen(false);setViewDate(todayKey);
  };

  const serializedCurrentPlan = activePlan && mealPlan ? JSON.stringify(prescriptionForSchedule(activePlan,mealPlan)) : null;
  useEffect(() => {
    if (
      !serializedCurrentPlan ||
      schedule.loading ||
      schedule.error ||
      mealProgressLoading ||
      mealProgressError ||
      mealProgressSavingSlots.size > 0
    )
      return;
    const timer = setTimeout(() => {
      void schedule
        .save(
          [{ date: todayKey, plan: JSON.parse(serializedCurrentPlan) }],
          true,
        )
        .then(() => setScheduleSyncError(false))
        .catch(() => setScheduleSyncError(true));
    }, 650);
    return () => clearTimeout(timer);
  }, [
    serializedCurrentPlan,
    schedule.loading,
    schedule.error,
    schedule.save,
    todayKey,
    mealProgressLoading,
    mealProgressError,
    mealProgressSavingSlots.size,
    scheduleSyncRetry,
  ]);

  const provenance = useMemo(
    () => buildPlanProvenance(catalog, proteinPolicy),
    [catalog, proteinPolicy],
  );
  const planReporting = usePlanReporting(
    todayKey,
    activePlan &&
      targets &&
      profile?.id === user?.id &&
      !profileLoading &&
      !catalogLoading &&
      !proteinPolicyLoading &&
      !mealProgressLoading &&
      !mealProgressError &&
      mealProgressSavingSlots.size === 0
      ? {
          schemaVersion: 1,
          plan: activePlan,
          targets,
          trace: nutritionResult?.trace,
          isWorkoutDay,
          profile,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...provenance,
          generationSeed: `${todayKey}-v${planVersion}`,
        }
      : null,
  );

  const resetSwapped = useCallback(() => setSwappedPlan(null), []);

  useEffect(() => {
    setSwappedPlan(null);
    setPlanVersion(0);
    setSwapMealIndex(null);
    setSwapComponentIndex(null);
    setDayOpen(false);
    setWeekOpen(false);
    setPendingMeal(null);
  }, [todayKey, scheduleContext]);

  const regenerate = () => {
    setCompanionEvent(null);
    setGenerationContext({
      key: generationKey,
      lockedMeals: Object.values(consumedMealSnapshots),
      avoidMeals: activePlan
        ? historyOfMeals(activePlan.meals.filter((m) => !m.consumed))
        : [],
      hydrationError: Boolean(mealProgressError),
    });
    setDayOpen(false);
    setPlanVersion((v) => v + 1);
    resetSwapped();
  };

  const performToggleConsumed = (mealIdx: number) => {
    const meal = activePlan?.meals[mealIdx];
    if (!meal || mealProgressError || mealProgressSavingSlots.has(meal.slot))
      return;
    setCompanionEvent(null);
    void setMealConsumed(meal, !meal.consumed)
      .then(() => {
        // Celebrate only after the database confirms a newly consumed meal.
        setReceipt(!meal.consumed ? {date:todayKey,slot:meal.slot,label:meal.label} : null);
        if (!meal.consumed)
          setCompanionEvent({
            key: generationKey,
            type: 'recorded',
            nonce: Date.now(),
          });
      })
      .catch(() => {});
  };

  const handleToggleConsumed=(mealIdx:number)=>{
    const meal=activePlan?.meals[mealIdx];
    if(!meal||mealProgressError||mealProgressSavingSlots.has(meal.slot))return;
    if(meal.consumed){performToggleConsumed(mealIdx);return;}
    setPendingMeal({meal:JSON.parse(JSON.stringify(meal)),date:todayKey,identity:generationKey});
  };
  const confirmPendingMeal=()=>{
    const pending=pendingMeal;if(!pending)return;
    const index=activePlan?.meals.findIndex(m=>m.slot===pending.meal.slot)??-1;
    setPendingMeal(null);
    if(isCurrentMealConfirmation(pending,activePlan?.meals[index],todayKey,generationKey))performToggleConsumed(index);
    else setViewError('این وعده تغییر کرده است؛ دوباره آن را بررسی و ثبت کن.');
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
      meals: editablePlan.meals.map((m, i) =>
        i === swapMealIndex ? option.updatedMeal : m,
      ),
    };
    setSwappedPlan(updated);
    setCompanionEvent({
      key: generationKey,
      type: 'swapped',
      nonce: Date.now(),
    });
  };

  const swapCurrentComponent: MealComponent | null =
    swapMealIndex !== null && swapComponentIndex !== null && activePlan
      ? (activePlan.meals[swapMealIndex]?.components[swapComponentIndex] ??
        null)
      : null;

  // Stable baseline for repeated swaps. Even after A -> B -> C, equivalence is
  // always measured against the component generated by the original daily plan.
  const swapReferenceComponent: MealComponent | null =
    swapMealIndex !== null && swapComponentIndex !== null && mealPlan
      ? (swapBaselineComponent((swappedPlan??mealPlan) as MemberScheduledPlan,activePlan?.meals[swapMealIndex]?.slot??'',swapComponentIndex))
      : null;

  const swapCandidates = useMemo<FoodSwapOption[]>(() => {
    if (
      !catalog ||
      !swapCurrentComponent ||
      !profile?.dietary_preferences_json ||
      !activePlan ||
      swapMealIndex === null ||
      swapComponentIndex === null
    )
      return [];
    return getSwapOptionsForMeal(
      activePlan.meals[swapMealIndex],
      swapComponentIndex,
      profile.dietary_preferences_json,
      swapReferenceComponent ?? undefined,
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
  const planned = activePlan
    ? computeConsumedMacros(activePlan, false)
    : undefined;
  const unchangedAfterRegeneration =
    avoidMeals &&
    avoidMeals.length > 0 &&
    activePlan &&
    avoidMeals.every((previous) => {
      const current = activePlan.meals.find((m) => m.slot === previous.slot);
      return (
        current &&
        mealFingerprint(previous.foodIds) ===
          mealFingerprint(current.components.map((c) => c.foodItem.id))
      );
    });
  const foodQuality = useMemo(
    () =>
      activePlan && targets
        ? evaluateDailyFoodQuality(activePlan.meals, targets.targetCalories)
        : null,
    [activePlan, targets],
  );

  const currentCompanionEvent =
    companionEvent?.key === generationKey ? companionEvent : null;
  const companionMessage = getDailyCompanion({
    total: activePlan?.meals.length ?? 0,
    consumed: activePlan?.meals.filter((meal) => meal.consumed).length ?? 0,
    saving: mealProgressSavingSlots.size > 0,
    error: Boolean(mealProgressError || planReporting.error),
    planError: Boolean(mealPlanResult.error),
    event: currentCompanionEvent?.type,
  });
  const showMeals = () => setDayOpen(true);

  // ---- Loading / error states ----
  if (
    profileLoading ||
    catalogLoading ||
    proteinPolicyLoading ||
    mealProgressLoading ||
    history.loading ||
    schedule.loading
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <BehtanMascot mood="thinking" />
          <p className="text-neutral-500 dark:text-neutral-400">
            در حال دریافت برنامه‌ات…
          </p>
        </div>
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="max-w-sm text-center space-y-4">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">
            {catalogError}
          </p>
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
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">
            {proteinPolicyError}
          </p>
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
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">
            {profileError}
          </p>
        </div>
      </div>
    );
  }

  // Today's date in Persian-style display
  const today = new Date().toLocaleDateString('fa-IR', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const nextIndex = viewedPlan ? nextMealIndex(viewedPlan.meals) : -1;
  return (
    <div className="member-app min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="member-topbar-v2">
        <div><div className="member-brand-v2"><img src={APP_LOGO_PATH} alt={`لوگوی ${APP_NAME_FA}`} /><span>به‌تن<small>{today}</small></span></div><div className="member-header-actions"><ThemeToggle /><button type="button" className="member-icon-button" aria-label="حساب من" onClick={()=>navigate('profile')}><UserRound size={19}/></button></div></div>
      </header>

      {scanOpen&&activePlan&&catalog?<div className="member-scan-page"><FoodScanPanel meals={activePlan.meals} catalog={catalog.foods} onBack={()=>setScanOpen(false)} onSave={saveScannedFood}/></div>:<div
        hidden={section !== 'today'}
        id="today-panel"
        className="max-w-md mx-auto px-4 py-5 space-y-4"
      >
        <MemberCompanion name={profile?.display_name} message={companionMessage} reactionKey={currentCompanionEvent?.nonce ?? todayKey} onAction={showMeals} days={[todayKey,addPlanDays(todayKey,1),addPlanDays(todayKey,2)]} selectedDate={selectedDate} onSelectDay={date=>void selectDay(date)} />
        {viewedPlan&&consumed&&<MacroSummary title={viewingToday?'انرژی امروز':'انرژی این روز'} targets={viewedPlan.targets} consumed={viewingToday?consumed:computeConsumedMacros(viewedPlan)} planned={planned} isWorkoutDay={isWorkoutDay} workoutControl={<MemberWorkoutToggle value={viewedPlan.isWorkoutDay} disabled={schedule.saving||Boolean(!viewingToday&&dayLoading)||Boolean(viewingToday&&consumedMealSnapshots.post_workout)||mealProgressSavingSlots.size>0||Boolean(mealProgressError)} onChange={v=>{if(!viewingToday){const futureTargets=computeNutrition(v)?.targets;if(futureTargets&&profile?.weight&&profile.dietary_preferences_json){try{const future=generateDailyMealPlan(futureTargets,profile.weight,profile.dietary_preferences_json,v,selectedDate+'-v0',{proteinBudgetPreference:profile.protein_budget_preference??'performance'});void schedule.save([{date:selectedDate,plan:future}],true).catch(()=>setViewError('تغییر روز ذخیره نشد.'));}catch{setViewError('تغییر روز انجام نشد.');}}return;}setIsWorkoutDay(v);resetSwapped();setGenerationContext({key:generationKey,lockedMeals:Object.values(consumedMealSnapshots),avoidMeals:[],hydrationError:Boolean(mealProgressError)});}}/>}/>}
        {(schedule.error || scheduleSyncError) && (
          <div className="member-notice" role="status">
            {schedule.error ??
              'ذخیرهٔ برنامهٔ انتخابی انجام نشد؛ برای حفظ جایگزینی‌ها دوباره تلاش کن.'}
            <button
              type="button"
              onClick={() => {
                if (schedule.error) schedule.retry();
                else setScheduleSyncRetry((n) => n + 1);
              }}
            >
              تلاش دوباره
            </button>
          </div>
        )}
        {planReporting.error && (
          <div role="status" className="text-sm text-amber-600 p-3">
            ذخیرهٔ نسخهٔ برنامه انجام نشد؛ اتصال را بررسی کنید.
            <button
              type="button"
              onClick={planReporting.retry}
              className="underline mr-2"
            >
              تلاش دوباره
            </button>
          </div>
        )}
        {unchangedAfterRegeneration && (
          <p
            role="status"
            className="text-xs leading-5 text-neutral-500 dark:text-neutral-400"
          >
            با محدودیت‌های فعلی، ترکیب متفاوت مناسبی پیدا نشد؛ غذاهای پیشنهادی
            مشابه‌اند.
          </p>
        )}
        {activePlan?.remainingTargetsUnmet && (
          <p
            role="status"
            className="text-xs leading-5 text-neutral-500 dark:text-neutral-400"
          >
            وعده‌های مصرف‌شده حفظ شدند؛ با گزینه‌های باقی‌مانده، مجموع امروز
            کاملاً در محدودهٔ هدف قرار نگرفت.{' '}
          </p>
        )}
        {history.error && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            سابقهٔ دیروز دریافت نشد؛ کنترل تکرار فعلاً فقط برای وعده‌های امروز
            انجام می‌شود.
          </p>
        )}

        {mealProgressError && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
              {mealProgressError} تا همگام‌سازی مجدد، تغییر تیک وعده‌ها غیرفعال
              است.
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

        {viewingToday&&receipt?.date===todayKey&&activePlan?.meals.some(m=>m.slot===receipt.slot&&m.consumed)&&<div className="meal-receipt" role="status"><Check size={17}/><span>{receipt.label} ثبت شد</span><button type="button" disabled={Boolean(mealProgressError)||mealProgressSavingSlots.has(receipt.slot)} onClick={()=>{const index=activePlan.meals.findIndex(m=>m.slot===receipt.slot);if(index>=0)handleToggleConsumed(index);}}><Undo2 size={15}/>برگردان</button><button type="button" aria-label="بستن پیام ثبت وعده" onClick={()=>setReceipt(null)}><X size={16}/></button></div>}

        <button type="button" className="food-scan-entry" onClick={()=>{setScanOpen(true);setViewDate(todayKey);window.scrollTo({top:0});}}><ScanLine size={24}/><span><b>غذات رو چک کن</b><small>تخمین کالری از عکس، با امکان اصلاح مقدار</small></span><span>←</span></button>
        {viewError&&<p role="alert" className="member-notice">{viewError}{!viewedPlan&&<button type="button" onClick={()=>void selectDay(selectedDate)}>تلاش دوباره</button>}</p>}
        {/* Meals section */}
        {mealPlanResult.error ? (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-5 text-center space-y-3">
            <AlertCircle
              size={34}
              className="text-amber-600 dark:text-amber-400 mx-auto"
            />
            <p className="font-bold text-neutral-900 dark:text-neutral-100">
              امکان ساخت برنامه واقع‌بینانه وجود ندارد
            </p>
            <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-300">
              {mealPlanResult.error}
            </p>
            <button
              type="button"
              onClick={regenerate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-sm font-semibold"
            >
              <RefreshCw size={14} />
              تلاش دوباره
            </button>
          </div>
        ) : viewedPlan ? (
          <section className="member-next-section"><div className="member-next-heading"><div><span className="member-eyebrow">برنامهٔ شخصی تو</span><h2 id="daily-meals" tabIndex={-1}>{nextIndex<0?'امروزت کامل شد':viewingToday?'وعدهٔ بعدی':'اولین وعدهٔ این روز'}</h2></div><span className="daily-count-pill">{toPersianDigits(viewedPlan.meals.filter(m=>m.consumed).length)} از {toPersianDigits(viewedPlan.meals.length)} ثبت شده</span></div>
          {nextIndex>=0?<div id={`meal-${viewedPlan.meals[nextIndex].slot}`} tabIndex={-1}><MealCard readOnly={!viewingToday} onChangeMeal={()=>void changeVisibleMeal(nextIndex)} changing={changingMeal} key={viewedPlan.meals[nextIndex].slot} meal={viewedPlan.meals[nextIndex]} isConsumedSaving={mealProgressSavingSlots.has(viewedPlan.meals[nextIndex].slot)} consumedToggleDisabled={Boolean(mealProgressError)} onToggleConsumed={()=>handleToggleConsumed(nextIndex)} onSwapComponent={index=>handleSwapComponent(nextIndex,index)}/></div>:<div className="member-complete"><Check size={24}/><p>برای اصلاح یا مرور ثبت‌ها، برنامهٔ امروز را باز کن.</p></div>}
          <div className="member-plan-actions"><button type="button" className="member-secondary" aria-expanded={dayOpen} onClick={()=>setDayOpen(true)}><CalendarDays size={19}/><span className="day-entry-copy"><b>{viewingToday?'نمایش وعده‌های امروز':'نمایش همهٔ وعده‌های این روز'}</b><small>مرور غذاها و اصلاح ثبت‌ها</small></span><span>←</span></button></div></section>
        ) : (
          <div className="text-center py-12 text-neutral-400 dark:text-neutral-500">
            <p>{dayLoading===selectedDate?'در حال ساخت برنامهٔ این روز…':'برنامه غذایی در حال آماده‌سازی است…'}</p>
          </div>
        )}
      </div>}

      {dayOpen&&viewedPlan&&<MemberDialog title={viewingToday?'وعده‌های امروز':'وعده‌های این روز'} onClose={()=>setDayOpen(false)} wide>
        <div className="day-sheet-intro"><div><span>{new Date(selectedDate+'T12:00:00').toLocaleDateString('fa-IR',{weekday:'long',day:'numeric',month:'long'})}</span><strong>{toPersianDigits(viewedPlan.meals.filter(m=>m.consumed).length)} از {toPersianDigits(viewedPlan.meals.length)} وعده ثبت شده</strong></div><span>{toPersianDigits(viewedPlan.targets.targetCalories)}<small> کالری هدف</small></span></div>
        <button type="button" className="member-primary week-entry-button" onClick={()=>{setDayOpen(false);setWeekOpen(true);}}><CalendarDays size={17}/>نمایش وعده‌های هفته<span>←</span></button>
        <div className="day-meal-list">{viewedPlan.meals.map((meal,index)=><MealCard compact readOnly={!viewingToday} key={meal.slot} meal={meal} isConsumedSaving={mealProgressSavingSlots.has(meal.slot)} consumedToggleDisabled={Boolean(mealProgressError)} onToggleConsumed={()=>handleToggleConsumed(index)} onSwapComponent={componentIndex=>{setDayOpen(false);handleSwapComponent(index,componentIndex);}}/>)}</div>
        {viewingToday&&<details className="day-more-options"><summary>تنوع غذا و کیفیت برنامه</summary><button type="button" className="member-secondary" onClick={()=>{regenerate();setDayOpen(false);}} disabled={Boolean(viewedPlan.meals.every(m=>m.consumed))||mealProgressSavingSlots.size>0||Boolean(mealProgressError)}><RefreshCw size={15}/>تغییر وعده‌های باقی‌مانده</button>{foodQuality&&<NutritionQualitySummary quality={foodQuality}/>}</details>}
      </MemberDialog>}
      {weekOpen && activePlan && targets && profile && catalog && (
        <WeekPlanner
          today={todayKey}
          plan={activePlan}
          targets={targets}
          profile={profile}
          catalog={catalog}
          schedule={schedule}
          onClose={() => setWeekOpen(false)}
        />
      )}
      {progressVisited && user && (
        <div
          hidden={section !== 'progress'}
          className="member-progress-panel max-w-md mx-auto px-4 py-6 space-y-5"
        >
          <MemberAnalytics
            userId={user.id}
            today={todayKey}
            currentPlan={activePlan}
          />
          <ProgressJournal
            key={`${user.id}:${todayKey}`}
            userId={user.id}
            today={todayKey}
          />
        </div>
      )}
      {profileVisited && profile && (
        <div
          hidden={section !== 'profile'}
          id="profile-panel"
          className="max-w-md mx-auto px-4 py-6"
        >
          <div className="account-heading-v2"><span>حساب من</span><button type="button" aria-label="خروج از حساب" onClick={signOut}><LogOut size={16}/>خروج</button></div><MemberProfile
            key={`${profile.id}:${todayKey}`}
            profile={profile}
            today={todayKey}
          />
        </div>
      )}
      <nav
        aria-label="منوی اصلی"
        className="member-bottom-nav fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-md mx-auto grid grid-cols-3 gap-2 px-5 py-2">
          {(
            [
              { id: 'today', label: 'برنامهٔ امروز', icon: Utensils },
              { id: 'progress', label: 'روند من', icon: TrendingUp },
              { id: 'profile', label: 'حساب من', icon: UserRound },
            ] as const
          ).map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.id);
              }}
              aria-current={section === item.id ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${section === item.id ? 'bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200' : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}`}
            >
              <item.icon size={21} aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      </nav>

      {pendingMeal&&<MemberMealConfirmation meal={pendingMeal.meal} onConfirm={confirmPendingMeal} onCancel={()=>setPendingMeal(null)}/> }

      {/* Swap modal */}
      <FoodSwapModal
        isOpen={swapMealIndex !== null}
        onClose={() => {
          setSwapMealIndex(null);
          setSwapComponentIndex(null);
        }}
        currentComponent={swapCurrentComponent}
        candidates={swapCandidates}
        onSelect={handleSwapSelect}
      />
    </div>
  );
}
