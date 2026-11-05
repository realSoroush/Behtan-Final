import {extraFoodOperation,finishExtraFoodOperation} from '@/member/extraFoodOperation';
import {isMealSkipped} from '@/member/mealStatus';
import {Dumbbell} from 'lucide-react';
import {supabase} from '@/lib/supabaseClient';
import {memberNutrition,workoutForDate} from '@/member/nutrition';
import {track} from '@/member/analytics';
import {MemberTraining} from '@/member/MemberTraining';
import './member-app.css';
import { MemberMealConfirmation } from './MemberMealConfirmation';
import { isCurrentMealConfirmation, type PendingMealConfirmation } from '@/utils/memberMealConfirmation';
import { FoodScanPanel } from './FoodScanPanel';
import { scannedMeal, type FoodScanResult } from '@/utils/foodScan';
import { ProgressJournal } from './ProgressJournal';
import { MemberAnalytics } from './MemberAnalytics';
import { WeekPlanner } from './WeekPlanner';
import { useMemberMealSchedule, type MealIntent } from '@/hooks/useMemberMealSchedule';
import { MemberRequestError } from '@/member/api';
import { isMealSnapshot } from '@/utils/mealValidation';
import { memberProfileContext, memberScheduleContext } from '@/utils/memberScheduleContext';
import { addPlanDays, swapBaselineComponent } from '@/utils/mealPresentation';
import { MemberCompanion } from './MemberCompanion';
import { MemberDialog } from './MemberDialog';
import { MemberWorkoutToggle } from './MemberWorkoutToggle';
import { getDailyCompanion } from '@/components/companion/companionState';
import { BehtanMascot } from '@/components/companion/BehtanMascot';
import { usePlanReporting } from '@/hooks/usePlanReporting';
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
import {
  toPersianDigits,
} from '@/utils/nutritionHelpers';
import {
  createMealPlanEngine,
  type MemberSwapOption,
} from '@/utils/mealPlanEngine';
import type {
  DailyMealPlan,
  MacroTargets,
  MealComponent,
  Meal,
} from '@/types';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { evaluateDailyFoodQuality } from '@/utils/nutritionQuality';
import {
  applyDailyMealSnapshots,
  getTehranDateKey,
  MEMBER_TIME_ZONE,
  type DailyMealSnapshots,
} from '@/utils/dailyMealProgress';
import {
  evaluateProfileMedicalEligibility,
} from '@/utils/medicalEligibility';

// ============================================================================
// Helper: compute consumed macros from meal checkboxes
// ============================================================================
const emptyCheckins: DailyMealSnapshots = {};
const emptySkipped: Meal['slot'][] = [];

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
  const activeUserId = useRef(user?.id);
  useEffect(() => {
    activeUserId.current = user?.id;
    return () => { activeUserId.current = undefined; };
  }, [user?.id]);
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useUserProfile(user?.id, true);
  const {
    catalog,
    policy: proteinPolicy,
    revision: catalogRevision,
    loading: catalogLoading,
    error: catalogError,
    refetch: refetchCatalog,
  } = useNutritionCatalog(user?.id);
  const engine = useMemo(() => catalog ? createMealPlanEngine(catalog, catalogRevision) : null, [catalog, catalogRevision]);

  const [section, setSection] = useState<'today' | 'profile' | 'progress' | 'training'>(
    () =>
      window.location.hash === '#training' ? 'training' : window.location.hash === '#profile'
        ? 'profile'
        : window.location.hash === '#progress'
          ? 'progress'
          : 'today',
  );
  const [progressVisited, setProgressVisited] = useState(
    () => window.location.hash === '#progress',
  );
  const [dayOpen, setDayOpen] = useState(false);
  const [pendingMeal,setPendingMeal]=useState<(PendingMealConfirmation & { action: 'record' | 'skip' })|null>(null);
  const [scanOpen,setScanOpen]=useState(false);
  const [viewDate,setViewDate]=useState<string|null>(null);
  const [viewError, setViewError] = useState('');
  const [receipt, setReceipt] = useState<{key:string;slot:Meal['slot'];label:string}|null>(null);
  const [weekOpen, setWeekOpen] = useState(false);
  const [profileVisited, setProfileVisited] = useState(
    () => window.location.hash === '#profile',
  );
  useEffect(() => {
    const sync = () => {
      const next =
        window.location.hash === '#training' ? 'training' : window.location.hash === '#profile'
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
  const navigate = (next: 'today' | 'profile' | 'progress' | 'training') => {
    setScanOpen(false);
    if (next === section) return;
    window.location.hash = next;
    setSection(next);
    if (next === 'profile') setProfileVisited(true);
    if (next === 'progress') setProgressVisited(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const [todayKey, setTodayKey] = useState(getTehranDateKey);
  useEffect(() => {
    const syncDate = () => setTodayKey(getTehranDateKey());
    const timer = window.setInterval(syncDate, 60_000);
    window.addEventListener('focus', syncDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncDate);
    };
  }, []);

  const scheduleContext = useMemo(
    () => profile && profile.id === user?.id && catalog && proteinPolicy
      ? memberScheduleContext(profile, catalog, proteinPolicy) : null,
    [profile, user?.id, catalog, proteinPolicy],
  );
  const profileContext = useMemo(() => profile ? memberProfileContext(profile) : null, [profile]);
  const schedule = useMemberMealSchedule(user?.id, todayKey, scheduleContext, catalogRevision, profileContext);
  const generationKey = JSON.stringify([user?.id, todayKey, scheduleContext, catalogRevision, profileContext]);
  const generationRef = useRef(generationKey);
  generationRef.current = generationKey;
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

  const [swapMealIndex, setSwapMealIndex] = useState<number | null>(null);
  const [swapComponentIndex, setSwapComponentIndex] = useState<number | null>(null);
  const [swapRevision, setSwapRevision] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<{key: string; message: string} | null>(null);
  const attempted = useRef<string | null>(null);
  const medicalEligibility = useMemo(
    () => profile ? evaluateProfileMedicalEligibility(profile) : null,
    [profile],
  );
  const scheduledToday = schedule.plans[todayKey];
  const consumedMealSnapshots = schedule.day?.checkins ?? emptyCheckins;
  const skipped = schedule.day?.skipped ?? emptySkipped;
  const isWorkoutDay = scheduledToday?.isWorkoutDay ?? (Boolean(consumedMealSnapshots.post_workout) ||
    Boolean(profile && workoutForDate(todayKey, profile.workout_weekdays, profile.workout_days ?? 0)));
  const nutritionResult = useMemo(() => {
    if (!medicalEligibility?.canGenerateAutomaticPlan || !profile || !proteinPolicy) return null;
    try { return memberNutrition(profile, proteinPolicy, isWorkoutDay); }
    catch { return null; }
  }, [medicalEligibility, profile, proteinPolicy, isWorkoutDay]);
  const mealPlan = !schedule.contextStale && nutritionResult && scheduledToday &&
    (!consumedMealSnapshots.post_workout || scheduledToday.isWorkoutDay) &&
    (['targetCalories', 'proteinGrams', 'carbGrams', 'fatGrams'] as const).every(
      key => Math.abs(scheduledToday.targets[key] - nutritionResult.targets[key]) < 0.1,
    ) ? scheduledToday : null;
  const activePlan = useMemo(
    () => applyDailyMealSnapshots(mealPlan, consumedMealSnapshots),
    [mealPlan, consumedMealSnapshots],
  );
  const targets = mealPlan?.targets ?? null;
  const selectedDate = viewDate && viewDate >= todayKey && viewDate <= addPlanDays(todayKey, 2) ? viewDate : todayKey;
  const viewingToday = selectedDate === todayKey;
  const viewedPlan = viewingToday ? activePlan : nutritionResult && !schedule.contextStale ? schedule.plans[selectedDate] ?? null : null;
  const extraFoods = useMemo(() => schedule.day?.extras.map((meal_snapshot, index) => ({
    id: schedule.day!.extraFoodIds[index], meal_snapshot,
  })) ?? [], [schedule.day]);
  const todayIntake = useMemo(() => ({
    skippedSlots: skipped,
    extraMeals: extraFoods.map(row => row.meal_snapshot),
  }), [skipped, extraFoods]);
  const intakeReady = Boolean(schedule.day && !schedule.error && !schedule.saving);
  const scheduleVersion = JSON.stringify([schedule.versions[todayKey], schedule.day?.intakeRevision]);
  const legacyPlan = Boolean(mealPlan && !schedule.day?.schedule?.server_verified);
  const changesBlocked = !intakeReady || legacyPlan;

  const generateToday = useCallback(async (workout: boolean, regenerate: boolean) => {
    setGenerationError(null);
    try {
      await schedule.submit(todayKey, { kind: 'generate', workout, regenerate });
    } catch (error) {
      if (generationRef.current !== generationKey) return;
      setGenerationError({ key: generationKey, message: error instanceof Error ? error.message : 'ساخت برنامه انجام نشد.' });
    }
  }, [schedule.submit, todayKey, generationKey]);

  useEffect(() => {
    if (!nutritionResult || !profile?.dietary_preferences_json || !intakeReady || mealPlan ||
        attempted.current === generationKey) return;
    attempted.current = generationKey;
    void generateToday(isWorkoutDay || Boolean(consumedMealSnapshots.post_workout), false);
  }, [nutritionResult, profile?.dietary_preferences_json, intakeReady, mealPlan,
    generationKey, generateToday, isWorkoutDay, consumedMealSnapshots.post_workout]);

  useEffect(() => {
    setSwapMealIndex(null);
    setSwapComponentIndex(null);
    setDayOpen(false);
    setWeekOpen(false);
    setScanOpen(false);
    setPendingMeal(null);
    setViewError('');
  }, [generationKey]);

  const refreshSchedule = async () => {
    setViewError('');
    setGenerationError(null);
    if (schedule.conflict) await Promise.all([refetchProfile?.(), refetchCatalog?.(false)]);
    attempted.current = null;
    try { await schedule.retry(); }
    catch (error) {
      if (generationRef.current === generationKey) setViewError(error instanceof Error ? error.message : 'دریافت برنامه انجام نشد.');
    }
  };

  const submitDay = async (date: string, intent: MealIntent) => {
    setViewError('');
    try { await schedule.submit(date, intent); }
    catch (error) {
      if (generationRef.current === generationKey) {
        if (intent.kind !== 'generate') {
          track(error instanceof MemberRequestError && error.code === 'NO_FEASIBLE_PLAN'
            ? 'meal_change_unavailable' : 'meal_change_save_failed');
        }
        setViewError(error instanceof Error ? error.message : 'تغییر برنامه انجام نشد.');
      }
    }
  };

  const selectDay = async (date: string) => {
    setViewDate(date);
    setViewError('');
    setDayOpen(false);
    if (date === todayKey || schedule.plans[date] || !profile || !nutritionResult || !intakeReady) return;
    await submitDay(date, { kind: 'generate', regenerate: false,
      workout: workoutForDate(date, profile.workout_weekdays, profile.workout_days ?? 0) });
  };

  const changeVisibleMeal = async (index: number) => {
    const meal = viewedPlan?.meals[index];
    if (changesBlocked || !viewingToday || !meal || meal.consumed || skipped.includes(meal.slot)) return;
    await submitDay(todayKey, { kind: 'rotate', slot: meal.slot });
  };

  const regenerate = () => {
    if (!intakeReady || !nutritionResult) return;
    setViewError('');
    setDayOpen(false);
    void generateToday(isWorkoutDay || Boolean(consumedMealSnapshots.post_workout), Boolean(mealPlan));
  };

  const changeIntake = async (task: () => Promise<void>, fallback: string) => {
    if (!intakeReady || !user) throw Error('ابتدا ثبت‌های روز را دریافت کن.');
    setViewError('');
    try { await schedule.changeIntake(task); }
    catch {
      if (generationRef.current === generationKey) setViewError(fallback);
      throw Error(fallback);
    }
  };

  const setMealConsumed = async (meal: Meal, consumed: boolean) => {
    if (!user || (consumed && !isMealSnapshot(meal, meal.slot))) throw Error('اطلاعات وعده معتبر نیست.');
    await changeIntake(async () => {
      const { error } = consumed
        ? await supabase.from('daily_meal_checkins').upsert({ user_id: user.id, plan_date: todayKey,
          meal_slot: meal.slot, template_id: meal.templateId, meal_snapshot: { ...meal, consumed: true },
          consumed_at: new Date().toISOString() }, { onConflict: 'user_id,plan_date,meal_slot' }).retry(false)
        : await supabase.from('daily_meal_checkins').delete().eq('user_id', user.id)
          .eq('plan_date', todayKey).eq('meal_slot', meal.slot).retry(false);
      if (error) throw error;
    }, 'ثبت وضعیت این وعده انجام نشد. دوباره تلاش کن.');
    if (user.id === activeUserId.current) track(consumed ? 'meal_recorded' : 'meal_undone');
  };

  const skipMeal = async (slot: Meal['slot'], undo: boolean) => {
    if (!user || !intakeReady) return;
    try {
      await changeIntake(async () => {
        const { error } = undo
          ? await supabase.from('member_skipped_meals').delete().eq('user_id', user.id)
            .eq('plan_date', todayKey).eq('slot', slot).retry(false)
          : await supabase.from('member_skipped_meals').upsert({ user_id: user.id, plan_date: todayKey, slot },
            { onConflict: 'user_id,plan_date,slot' }).retry(false);
        if (error) throw error;
      }, 'ثبت وضعیت وعده انجام نشد.');
      if (user.id === activeUserId.current) track('meal_skipped');
    } catch { /* The error is displayed in the day view. */ }
  };

  const saveScannedFood = async (result: FoodScanResult, slot: Meal['slot'], independent: boolean) => {
    const original = activePlan?.meals.find(meal => meal.slot === slot);
    if (!original || !user || !intakeReady) throw Error('وعده در حال ثبت است یا آماده نیست.');
    const meal = scannedMeal(result, slot, original.label);
    if (independent) {
      await changeIntake(async () => {
        const operation = await extraFoodOperation([user.id, todayKey, slot, result]);
        const { error } = await supabase.from('member_extra_foods').upsert({ id: operation.id, user_id: user.id,
          plan_date: todayKey, meal_slot: slot, meal_snapshot: meal }, { onConflict: 'id', ignoreDuplicates: true }).retry(false);
        if (error) throw error;
        finishExtraFoodOperation(operation.id);
      }, 'ثبت غذای اضافه انجام نشد. دوباره تلاش کن.');
      if (user.id === activeUserId.current) track('meal_recorded');
    } else await setMealConsumed(meal, true);
    if (generationRef.current !== generationKey) return;
    setReceipt({key:generationKey,slot,label:'وعدهٔ دلخواه'});
    setScanOpen(false);
    setViewDate(todayKey);
  };

  const removeExtra = async (id: string) => {
    if (!user || !intakeReady) return;
    try {
      await changeIntake(async () => {
        const { error } = await supabase.from('member_extra_foods').delete().eq('id', id)
          .eq('user_id', user.id).eq('plan_date', todayKey).retry(false);
        if (error) throw error;
      }, 'بازگرداندن غذا انجام نشد.');
    } catch { /* The error is displayed in the day view. */ }
  };

  const provenance = useMemo(
    () => buildPlanProvenance(catalog, proteinPolicy, catalogRevision),
    [catalog, proteinPolicy, catalogRevision],
  );
  const planReporting = usePlanReporting(todayKey,
    activePlan && targets && profile?.id === user?.id && profile && intakeReady &&
      !profileLoading && !catalogLoading ? {
        schemaVersion: 1, plan: activePlan, targets, trace: nutritionResult?.trace,
        isWorkoutDay, profile, timeZone: MEMBER_TIME_ZONE, ...provenance,
        origin: schedule.day?.schedule?.server_authored ? 'server_generated' : provenance.origin,
      } : null,
  );

  const performToggleConsumed = (mealIdx: number) => {
    const meal = activePlan?.meals[mealIdx];
    if (!meal || !intakeReady) return;
    setCompanionEvent(null);
    void setMealConsumed(meal, !meal.consumed).then(() => {
      if (generationRef.current !== generationKey) return;
      setReceipt(!meal.consumed ? {key:generationKey,slot:meal.slot,label:meal.label} : null);
      if (!meal.consumed) setCompanionEvent({ key: generationKey, type: 'recorded', nonce: Date.now() });
    }).catch(() => {});
  };

  const handleToggleConsumed = (mealIdx: number) => {
    const meal = activePlan?.meals[mealIdx];
    if (!meal || !intakeReady) return;
    if (meal.consumed) { performToggleConsumed(mealIdx); return; }
    setPendingMeal({ meal, date: todayKey, identity: generationKey + scheduleVersion, action: 'record' });
  };
  const requestSkip = (meal: Meal) => {
    if (!viewingToday || meal.consumed || !intakeReady) return;
    if (skipped.includes(meal.slot)) { void skipMeal(meal.slot, true); return; }
    setPendingMeal({ meal, date: todayKey, identity: generationKey + scheduleVersion, action: 'skip' });
  };
  const confirmPendingMeal = () => {
    if (!pendingMeal) return;
    const index = activePlan?.meals.findIndex(meal => meal.slot === pendingMeal.meal.slot) ?? -1;
    setPendingMeal(null);
    if (!intakeReady || !isCurrentMealConfirmation(pendingMeal, activePlan?.meals[index], todayKey, generationKey + scheduleVersion)) {
      setViewError('این وعده تغییر کرده است؛ دوباره آن را بررسی و ثبت کن.');
      return;
    }
    if (pendingMeal.action === 'skip') {
      if (viewingToday && !skipped.includes(pendingMeal.meal.slot)) void skipMeal(pendingMeal.meal.slot, false);
    } else performToggleConsumed(index);
  };

  const reportedEmptySwap = useRef(false);
  const handleSwapComponent = (mealIdx: number, componentIdx: number) => {
    if (!viewingToday || changesBlocked || activePlan?.meals[mealIdx]?.consumed) return;
    setSwapRevision(scheduleVersion);
    reportedEmptySwap.current = false;
    setSwapMealIndex(mealIdx);
    setSwapComponentIndex(componentIdx);
  };

  const handleSwapSelect = async (option: MemberSwapOption) => {
    const slot = swapMealIndex === null ? null : activePlan?.meals[swapMealIndex]?.slot;
    if (swapRevision !== scheduleVersion || !slot || swapComponentIndex === null)
      throw Error('ثبت‌ها یا برنامهٔ روز تغییر کرده‌اند. جایگزین را دوباره انتخاب کن.');
    try {
      await schedule.submit(todayKey, { kind: 'swap', slot, componentIndex: swapComponentIndex,
        foodId: option.foodItem.id, units: option.replacementComponent.units });
    } catch (error) {
      if (generationRef.current !== generationKey) throw error;
      track(error instanceof MemberRequestError && error.code === 'NO_FEASIBLE_PLAN'
        ? 'meal_change_unavailable' : 'meal_change_save_failed');
      if (error instanceof MemberRequestError && error.status === 409) {
        setSwapMealIndex(null);
        setSwapComponentIndex(null);
      }
      throw error;
    }
    if (generationRef.current === generationKey) {
      setCompanionEvent({ key: generationKey, type: 'swapped', nonce: Date.now() });
    }
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
      ? (swapBaselineComponent(mealPlan,activePlan?.meals[swapMealIndex]?.slot??'',swapComponentIndex))
      : null;

  const swapCandidates = useMemo<MemberSwapOption[]>(() => {
    if (
      !engine ||
      !swapCurrentComponent ||
      !schedule.day ||
      swapRevision !== scheduleVersion ||
      !profile?.dietary_preferences_json ||
      !activePlan ||
      swapMealIndex === null ||
      swapComponentIndex === null
    )
      return [];
    return engine.getMemberSwapOptions(
      activePlan,
      swapMealIndex,
      swapComponentIndex,
      profile.dietary_preferences_json,
      todayIntake,
      swapReferenceComponent ?? undefined,
    );
  }, [
    engine,
    swapCurrentComponent,
    schedule.day,
    swapRevision,
    scheduleVersion,
    todayIntake,
    swapReferenceComponent,
    profile,
    activePlan,
    swapMealIndex,
    swapComponentIndex,
  ]);
  useEffect(() => {
    if (swapCurrentComponent && catalog && intakeReady && profile?.dietary_preferences_json &&
      swapCandidates.length === 0 && !reportedEmptySwap.current) {
      reportedEmptySwap.current = true;
      track('meal_change_unavailable');
    }
  }, [swapCurrentComponent, catalog, intakeReady, profile, swapCandidates.length]);


  const consumed = activePlan ? computeConsumedMacros({...activePlan,meals:[...activePlan.meals,...extraFoods.map(f=>({...f.meal_snapshot,consumed:true}))]}) : null;
  const planned = activePlan
    ? computeConsumedMacros(activePlan, false)
    : undefined;
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
    saving: schedule.saving,
    error: Boolean(schedule.error || planReporting.error),
    planError: generationError?.key === generationKey,
    event: currentCompanionEvent?.type,
  });
  const showMeals = () => setDayOpen(true);

  // ---- Loading / error states ----
  if (
    profileLoading ||
    catalogLoading ||
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

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center space-y-3">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">
            {profileError}
          </p>
          <button type="button" className="member-secondary" onClick={() => void refetchProfile()}>
            تلاش دوباره
          </button>
        </div>
      </div>
    );
  }

  // Today's date in Persian-style display
  const today = new Date().toLocaleDateString('fa-IR', {
    timeZone: MEMBER_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const nextIndex = viewedPlan ? viewedPlan.meals.findIndex(m=>!m.consumed&&!isMealSkipped(m.slot,skipped,todayKey,selectedDate)) : -1;
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
        {viewedPlan&&<p className='member-muted'>در هدف کاهش یا افزایش وزن، کالری پایه ثابت می‌ماند و روز تمرین بین وعده‌ها بازتوزیع می‌شود؛ در حفظ وزن، سیاست فعلی ۱۵۰ کالری اضافه می‌کند.</p>}
        {viewedPlan&&consumed&&<MacroSummary title={viewingToday?'انرژی امروز':'انرژی این روز'} targets={viewedPlan.targets} consumed={viewingToday?consumed:computeConsumedMacros(viewedPlan)} planned={viewingToday?planned:computeConsumedMacros(viewedPlan,false)} isWorkoutDay={viewedPlan.isWorkoutDay} workoutControl={<MemberWorkoutToggle value={viewedPlan.isWorkoutDay} disabled={!intakeReady||Boolean(viewingToday&&consumedMealSnapshots.post_workout)} onChange={workout=>void submitDay(selectedDate,{kind:'generate',workout,regenerate:false})}/>}/>}
        {schedule.error && (
          <div className="member-notice" role="status">
            {schedule.error}
            <button type="button" onClick={() => void refreshSchedule()} disabled={schedule.saving}>
              {schedule.conflict ? 'بازکردن نسخهٔ تازه' : 'تلاش دوباره'}
            </button>
          </div>
        )}
        {viewingToday && legacyPlan && !schedule.error && (
          <div className="member-notice" role="status">
            برای تغییر وعده یا جایگزینی، برنامه را یک‌بار به‌روز کن. ممکن است پیشنهادها تغییر کنند. ثبت‌های مصرف حفظ می‌شوند.
            <button type="button" disabled={!intakeReady} onClick={regenerate}>به‌روزرسانی برنامه</button>
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
        {activePlan?.remainingTargetsUnmet && (
          <p
            role="status"
            className="text-xs leading-5 text-neutral-500 dark:text-neutral-400"
          >
            وعده‌های مصرف‌شده حفظ شدند؛ با گزینه‌های باقی‌مانده، مجموع امروز
            کاملاً در محدودهٔ هدف قرار نگرفت.{' '}
          </p>
        )}
        {viewingToday&&receipt?.key===generationKey&&activePlan?.meals.some(m=>m.slot===receipt.slot&&m.consumed)&&<div className="meal-receipt" role="status"><Check size={17}/><span>{receipt.label} ثبت شد</span><button type="button" disabled={!intakeReady} onClick={()=>{const index=activePlan.meals.findIndex(m=>m.slot===receipt.slot);if(index>=0)handleToggleConsumed(index);}}><Undo2 size={15}/>برگردان</button><button type="button" aria-label="بستن پیام ثبت وعده" onClick={()=>setReceipt(null)}><X size={16}/></button></div>}

        {viewingToday&&extraFoods.length>0&&<section className="member-chart-card"><h2>غذاهای اضافهٔ امروز</h2>{extraFoods.map(row=><article key={row.id} className="py-3"><strong>{row.meal_snapshot.label} · وعدهٔ دلخواه</strong><p>{row.meal_snapshot.components.map(c=>`${c.foodItem.name}: ${Math.round(c.grams).toLocaleString('fa-IR')} گرم${c.foodItem.preparationState==='dry'?' خشک':c.foodItem.preparationState==='raw'?' خام':c.foodItem.preparationState==='cooked'?' پخته':''}`).join('، ')}</p><small>{Math.round(row.meal_snapshot.totalKcal).toLocaleString('fa-IR')} کالری</small><button type="button" className="member-secondary" disabled={!intakeReady} onClick={()=>void removeExtra(row.id)}>بازگرداندن ثبت</button></article>)}</section>}
        <button type="button" className="food-scan-entry" disabled={!activePlan || !intakeReady} onClick={()=>{setScanOpen(true);setViewDate(todayKey);window.scrollTo({top:0});}}><ScanLine size={24}/><span><b>غذات رو چک کن</b><small>تخمین کالری از عکس، با امکان اصلاح مقدار</small></span><span>←</span></button>
        {viewError&&<p role="alert" className="member-notice">{viewError}{!viewedPlan&&<button type="button" onClick={()=>void selectDay(selectedDate)}>تلاش دوباره</button>}</p>}
        {/* Meals section */}
        {!schedule.error && !viewedPlan && generationError?.key === generationKey ? (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-5 text-center space-y-3">
            <AlertCircle
              size={34}
              className="text-amber-600 dark:text-amber-400 mx-auto"
            />
            <p className="font-bold text-neutral-900 dark:text-neutral-100">
              امکان ساخت برنامه واقع‌بینانه وجود ندارد
            </p>
            <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-300">
              {generationError.message}
            </p>
            <button
              type="button"
              onClick={regenerate}
              disabled={!intakeReady}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-sm font-semibold"
            >
              <RefreshCw size={14} />
              تلاش دوباره
            </button>
          </div>
        ) : viewedPlan ? (
          <section className="member-next-section"><div className="member-next-heading"><div><span className="member-eyebrow">برنامهٔ شخصی تو</span><h2 id="daily-meals" tabIndex={-1}>{nextIndex<0?'امروزت کامل شد':viewingToday?'وعدهٔ بعدی':'اولین وعدهٔ این روز'}</h2></div><span className="daily-count-pill">{toPersianDigits(viewedPlan.meals.filter(m=>m.consumed).length)} از {toPersianDigits(viewedPlan.meals.length)} ثبت شده</span></div>
          {nextIndex>=0?<div id={`meal-${viewedPlan.meals[nextIndex].slot}`} tabIndex={-1}><MealCard readOnly={!viewingToday} onChangeMeal={viewingToday ? ()=>void changeVisibleMeal(nextIndex) : undefined} changing={schedule.saving} changeDisabled={changesBlocked} onSkip={()=>requestSkip(viewedPlan.meals[nextIndex])} key={viewedPlan.meals[nextIndex].slot} meal={viewedPlan.meals[nextIndex]} isConsumedSaving={schedule.saving} consumedToggleDisabled={!intakeReady} onToggleConsumed={()=>handleToggleConsumed(nextIndex)} onSwapComponent={index=>handleSwapComponent(nextIndex,index)}/></div>:<div className="member-complete"><Check size={24}/><p>برای اصلاح یا مرور ثبت‌ها، برنامهٔ امروز را باز کن.</p></div>}
          <div className="member-plan-actions"><button type="button" className="member-secondary" aria-expanded={dayOpen} onClick={()=>setDayOpen(true)}><CalendarDays size={19}/><span className="day-entry-copy"><b>{viewingToday?'نمایش وعده‌های امروز':'نمایش همهٔ وعده‌های این روز'}</b><small>مرور غذاها و اصلاح ثبت‌ها</small></span><span>←</span></button></div></section>
        ) : (
          <div className="text-center py-12 text-neutral-400 dark:text-neutral-500">
            <p>{schedule.saving ? 'در حال ساخت برنامهٔ این روز…' : !nutritionResult && !profileLoading ? 'اطلاعات برنامهٔ خودکار کامل نیست یا به بررسی متخصص نیاز دارد.' : schedule.error ? 'برنامه در دسترس نیست.' : 'برنامه غذایی در حال آماده‌سازی است…'}</p>
          </div>
        )}
      </div>}

      {dayOpen&&viewedPlan&&<MemberDialog title={viewingToday?'وعده‌های امروز':'وعده‌های این روز'} onClose={()=>setDayOpen(false)} wide>
        <div className="day-sheet-intro"><div><span>{new Date(selectedDate+'T12:00:00').toLocaleDateString('fa-IR',{weekday:'long',day:'numeric',month:'long'})}</span><strong>{toPersianDigits(viewedPlan.meals.filter(m=>m.consumed).length)} از {toPersianDigits(viewedPlan.meals.length)} وعده ثبت شده</strong></div><span>{toPersianDigits(viewedPlan.targets.targetCalories)}<small> کالری هدف</small></span></div>
        <button type="button" className="member-primary week-entry-button" onClick={()=>{setDayOpen(false);setWeekOpen(true);}}><CalendarDays size={17}/>نمایش وعده‌های هفته<span>←</span></button>
        <div className="day-meal-list">{viewedPlan.meals.map((meal,index)=><MealCard compact readOnly={!viewingToday} onSkip={()=>requestSkip(meal)} skipped={isMealSkipped(meal.slot,skipped,todayKey,selectedDate)} key={meal.slot} meal={meal} isConsumedSaving={schedule.saving} consumedToggleDisabled={!intakeReady} changeDisabled={changesBlocked} onToggleConsumed={()=>handleToggleConsumed(index)} onSwapComponent={componentIndex=>{setDayOpen(false);handleSwapComponent(index,componentIndex);}}/>)}</div>
        {viewingToday&&<details className="day-more-options"><summary>تنوع غذا و کیفیت برنامه</summary><button type="button" className="member-secondary" onClick={()=>{regenerate();setDayOpen(false);}} disabled={Boolean(viewedPlan.meals.every(m=>m.consumed))||!intakeReady}><RefreshCw size={15}/>تغییر وعده‌های باقی‌مانده</button>{foodQuality&&<NutritionQualitySummary quality={foodQuality}/>}</details>}
      </MemberDialog>}
      {weekOpen && activePlan && profile && (
        <WeekPlanner
          today={todayKey}
          plan={activePlan}
          profile={profile}
          schedule={schedule}
          onRetry={refreshSchedule}
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
            active={section === 'progress'}
            profile={profile!}
            policy={proteinPolicy!}
          />
        </div>
      )}
      {section==='training'&&profile&&<div className='max-w-md mx-auto px-4 py-6'><MemberTraining profile={profile}/></div>}
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
        <div className="max-w-md mx-auto grid grid-cols-4 gap-2 px-5 py-2">
          {(
            [
              { id: 'today', label: 'برنامهٔ امروز', icon: Utensils },
              { id: 'progress', label: 'روند من', icon: TrendingUp },
              { id: 'training', label: 'تمرین', icon: Dumbbell },
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

      {pendingMeal&&<MemberMealConfirmation meal={pendingMeal.meal} action={pendingMeal.action} onConfirm={confirmPendingMeal} onCancel={()=>setPendingMeal(null)}/> }

      {/* Swap modal */}
      <FoodSwapModal
        isOpen={swapMealIndex !== null}
        stale={swapRevision !== scheduleVersion || Boolean(schedule.error)}
        onClose={() => {
          setSwapMealIndex(null);
          setSwapComponentIndex(null);
        }}
        currentComponent={swapCurrentComponent}
        currentPlan={activePlan}
        candidates={swapCandidates}
        onSelect={handleSwapSelect}
      />
    </div>
  );
}
