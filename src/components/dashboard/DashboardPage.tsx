import type { MemberIntakeIntent } from '@/member/intake';
import {extraFoodOperation,finishExtraFoodOperation} from '@/member/extraFoodOperation';
import {isMealSkipped} from '@/member/mealStatus';
import {memberNutrition,workoutForDate} from '@/member/nutrition';
import {track} from '@/member/analytics';
import { MemberMealConfirmation } from './MemberMealConfirmation';
import { isCurrentMealConfirmation, type PendingMealConfirmation } from '@/utils/memberMealConfirmation';
import { scannedMeal, type FoodScanResult } from '@/utils/foodScan';
import { useMemberMealSchedule, type MealIntent } from '@/hooks/useMemberMealSchedule';
import { MemberRequestError } from '@/member/api';
import { isMealSnapshot } from '@/utils/mealValidation';
import { memberProfileContext, memberScheduleContext } from '@/utils/memberScheduleContext';
import { addPlanDays, swapBaselineComponent } from '@/utils/mealPresentation';
import { MemberHomeShell, type MemberSection } from './MemberHomeShell';
import { MemberEnergyPolicyNote, MemberEnergySkeleton, MemberMealSkeleton, MemberScanEntry, memberTodayClass } from './MemberHomeSkeleton';
import { MemberCompanion } from './MemberCompanion';
import { MemberDialog } from './MemberDialog';
import { MemberWorkoutToggle } from './MemberWorkoutToggle';
import { getDailyCompanion } from '@/components/companion/companionState';
import { AppLoading, LoadingMascot } from '@/components/ui/AppLoading';
import { usePlanReporting } from '@/hooks/usePlanReporting';
import { buildPlanProvenance } from '@/utils/planProvenance';
import { useCallback, useEffect, useMemo, useState, useRef, lazy, Suspense } from 'react';
import {
  LogOut,
  RefreshCw,
  AlertCircle,
  Check,
  CalendarDays,
  Undo2,
  X,
} from 'lucide-react';
import { MemberMacroSummary as MacroSummary } from './MemberMacroSummary';
import { NutritionQualitySummary } from './NutritionQualitySummary';
import { MemberMealCard as MealCard } from './MemberMealCard';
import { MemberSwapSheet as FoodSwapModal } from './MemberSwapSheet';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile, type UseUserProfileReturn } from '@/hooks/useUserProfile';
import { useNutritionCatalog } from '@/hooks/useNutritionCatalog';
import {
  toPersianDigits,
} from '@/utils/nutritionHelpers';
import type { MemberSwapOption } from '@/utils/mealPlanEngine';
import type {
  DailyMealPlan,
  MacroTargets,
  MealComponent,
  Meal,
} from '@/types';
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

const MemberTraining = lazy(() => import('@/member/MemberTraining').then(module => ({ default: module.MemberTraining })));
const FoodScanPanel = lazy(() => import('./FoodScanPanel').then(module => ({ default: module.FoodScanPanel })));
const ProgressJournal = lazy(() => import('./ProgressJournal').then(module => ({ default: module.ProgressJournal })));
const MemberAnalytics = lazy(() => import('./MemberAnalytics').then(module => ({ default: module.MemberAnalytics })));
const WeekPlanner = lazy(() => import('./WeekPlanner').then(module => ({ default: module.WeekPlanner })));
const MemberProfile = lazy(() => import('./MemberProfile').then(module => ({ default: module.MemberProfile })));

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

type DashboardSession = Pick<ReturnType<typeof useAuth>, 'user' | 'signOut'> & {
  profileState: UseUserProfileReturn;
};

export function DashboardPage({ session }: { session?: DashboardSession }) {
  return session ? <Dashboard {...session} /> : <StandaloneDashboard />;
}

function StandaloneDashboard() {
  const { user, signOut } = useAuth();
  const profileState = useUserProfile(user?.id, true);
  return <Dashboard user={user} signOut={signOut} profileState={profileState} />;
}

function Dashboard({ user, signOut, profileState }: DashboardSession) {
  const activeUserId = useRef(user?.id);
  useEffect(() => {
    activeUserId.current = user?.id;
    return () => { activeUserId.current = undefined; };
  }, [user?.id]);
  const { profile, loading: profileLoading, error: profileError, refetch: refetchProfile } = profileState;
  const {
    catalog,
    policy: proteinPolicy,
    revision: catalogRevision,
    loading: catalogLoading,
    error: catalogError,
    refetch: refetchCatalog,
  } = useNutritionCatalog(user?.id);

  const [section, setSection] = useState<MemberSection>(
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
  const navigate = (next: MemberSection) => {
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
  const consumedMealSnapshots = schedule.displayDay?.checkins ?? emptyCheckins;
  const skipped = schedule.displayDay?.skipped ?? emptySkipped;
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
  const intakeReady = Boolean(schedule.day && !schedule.error && !schedule.saving && !schedule.syncingIntake);
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
    if (date === todayKey || !profile || !nutritionResult) return;
    if (!intakeReady) {
      if (!schedule.plans[date]) setViewError('ابتدا صبر کن تا برنامه و ثبت‌های روز آماده شوند.');
      return;
    }
    try { await schedule.prepareDay(date, workoutForDate(date, profile.workout_weekdays, profile.workout_days ?? 0)); }
    catch (error) {
      if (generationRef.current === generationKey) setViewError(error instanceof Error ? error.message : 'دریافت برنامه انجام نشد.');
    }
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

  const changeIntake = async (intent: MemberIntakeIntent, fallback: string, requestId?: string) => {
    if (!intakeReady || !user) throw Error('ابتدا ثبت‌های روز را دریافت کن.');
    setViewError('');
    try { await schedule.changeIntake(intent, requestId); }
    catch {
      if (generationRef.current === generationKey) setViewError(fallback);
      throw Error(fallback);
    }
  };

  const setMealConsumed = async (meal: Meal, consumed: boolean) => {
    if (!user || (consumed && !isMealSnapshot(meal, meal.slot))) throw Error('اطلاعات وعده معتبر نیست.');
    await changeIntake(consumed ? { kind: 'record', slot: meal.slot, meal } : { kind: 'undo-record', slot: meal.slot },
      'ثبت وضعیت این وعده انجام نشد. دوباره تلاش کن.');
    if (user.id === activeUserId.current) track(consumed ? 'meal_recorded' : 'meal_undone');
  };

  const skipMeal = async (slot: Meal['slot'], undo: boolean) => {
    if (!user || !intakeReady) return;
    try {
      await changeIntake({ kind: undo ? 'undo-skip' : 'skip', slot }, 'ثبت وضعیت وعده انجام نشد.');
      if (user.id === activeUserId.current) track('meal_skipped');
    } catch { /* The error is displayed in the day view. */ }
  };

  const saveScannedFood = async (result: FoodScanResult, slot: Meal['slot'], independent: boolean) => {
    const original = activePlan?.meals.find(meal => meal.slot === slot);
    if (!original || !user || !intakeReady) throw Error('وعده در حال ثبت است یا آماده نیست.');
    const meal = scannedMeal(result, slot, original.label);
    if (independent) {
      const operation = await extraFoodOperation([user.id, todayKey, slot, result]);
      await changeIntake({ kind: 'extra-add', slot, meal }, 'ثبت غذای اضافه انجام نشد. دوباره تلاش کن.', operation.id);
      finishExtraFoodOperation(operation.id);
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
      await changeIntake({ kind: 'extra-remove', id }, 'بازگرداندن غذا انجام نشد.');
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

  const [swapModule, setSwapModule] = useState<typeof import('@/utils/mealPlanEngine') | null>(null);
  const [swapEngineError, setSwapEngineError] = useState(false);
  useEffect(() => {
    if (swapMealIndex === null || swapModule) return;
    let active = true;
    setSwapEngineError(false);
    void import('@/utils/mealPlanEngine')
      .then(module => { if (active) setSwapModule(module); })
      .catch(() => { if (active) setSwapEngineError(true); });
    return () => { active = false; };
  }, [swapMealIndex, swapModule]);
  const engine = useMemo(() => swapModule && catalog
    ? swapModule.createMealPlanEngine(catalog, catalogRevision) : null,
  [swapModule, catalog, catalogRevision]);

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
    if (swapCurrentComponent && engine && intakeReady && profile?.dietary_preferences_json &&
      swapCandidates.length === 0 && !reportedEmptySwap.current) {
      reportedEmptySwap.current = true;
      track('meal_change_unavailable');
    }
  }, [swapCurrentComponent, engine, intakeReady, profile, swapCandidates.length]);


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
    saving: schedule.saving || Boolean(schedule.pendingIntake),
    error: Boolean(schedule.error || planReporting.error),
    planError: generationError?.key === generationKey,
    event: currentCompanionEvent?.type,
  });
  const showMeals = () => setDayOpen(true);

  const dataLoading = profileLoading || catalogLoading || schedule.loading;
  const loadError = profileError || catalogError;
  const loadingPlan = !viewedPlan && !loadError && !schedule.error && !viewError &&
    generationError?.key !== generationKey && (dataLoading || (viewingToday ? Boolean(nutritionResult) : schedule.saving));
  const energyTitle = viewingToday ? 'انرژی امروز' : 'انرژی این روز';
  const mealTitle = viewingToday ? 'وعدهٔ بعدی' : 'اولین وعدهٔ این روز';
  const pendingIntake = schedule.pendingIntake;
  const changingPlan = schedule.saving && !pendingIntake;
  const intakeFeedback = viewingToday && pendingIntake &&
    <p className="meal-intake-status" role="status"><LoadingMascot /> در حال ذخیرهٔ وضعیت وعده…</p>;

  const nextIndex = viewedPlan ? viewedPlan.meals.findIndex(m=>!m.consumed&&!isMealSkipped(m.slot,skipped,todayKey,selectedDate)) : -1;
  return (
    <MemberHomeShell section={section} navigate={navigate}>
      {scanOpen&&activePlan&&catalog?<div className="member-scan-page"><Suspense fallback={<AppLoading label="در حال بازکردن اسکن غذا…" />}><FoodScanPanel meals={activePlan.meals} catalog={catalog.foods} onBack={()=>setScanOpen(false)} onSave={saveScannedFood}/></Suspense></div>:<div
        hidden={section !== 'today'}
        id="today-panel"
        className={memberTodayClass}
      >
        <MemberCompanion loading={dataLoading} name={profile?.display_name} message={companionMessage} reactionKey={currentCompanionEvent?.nonce ?? todayKey} onAction={showMeals} days={[todayKey,addPlanDays(todayKey,1),addPlanDays(todayKey,2)]} selectedDate={selectedDate} onSelectDay={dataLoading ? undefined : date=>void selectDay(date)} />
        {(viewedPlan || loadingPlan) && <MemberEnergyPolicyNote />}
        {viewedPlan&&consumed&&<MacroSummary title={energyTitle} targets={viewedPlan.targets} consumed={viewingToday?consumed:computeConsumedMacros(viewedPlan)} planned={viewingToday?planned:computeConsumedMacros(viewedPlan,false)} isWorkoutDay={viewedPlan.isWorkoutDay} workoutControl={<MemberWorkoutToggle value={viewedPlan.isWorkoutDay} disabled={!intakeReady||Boolean(viewingToday&&consumedMealSnapshots.post_workout)} onChange={workout=>void submitDay(selectedDate,{kind:'generate',workout,regenerate:false})}/>}/>}
        {loadingPlan && <MemberEnergySkeleton title={energyTitle} />}
        {loadError && <div className="member-notice" role="alert">
          {loadError}
          <button type="button" onClick={() => void (profileError ? refetchProfile() : refetchCatalog())}>تلاش دوباره</button>
        </div>}
        {schedule.error && (
          <div className="member-notice" role="status">
            {schedule.error}
            <button type="button" onClick={() => void refreshSchedule()} disabled={schedule.saving || schedule.syncingIntake}>
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
        {!dayOpen && intakeFeedback}
        {viewingToday&&receipt?.key===generationKey&&activePlan?.meals.some(m=>m.slot===receipt.slot&&m.consumed)&&<div className="meal-receipt" role="status"><Check size={17}/><span>{receipt.label} ثبت شد</span><button type="button" disabled={!intakeReady} onClick={()=>{const index=activePlan.meals.findIndex(m=>m.slot===receipt.slot);if(index>=0)handleToggleConsumed(index);}}><Undo2 size={15}/>برگردان</button><button type="button" aria-label="بستن پیام ثبت وعده" onClick={()=>setReceipt(null)}><X size={16}/></button></div>}

        {viewingToday&&extraFoods.length>0&&<section className="member-chart-card"><h2>غذاهای اضافهٔ امروز</h2>{extraFoods.map(row=><article key={row.id} className="py-3"><strong>{row.meal_snapshot.label} · وعدهٔ دلخواه</strong><p>{row.meal_snapshot.components.map(c=>`${c.foodItem.name}: ${Math.round(c.grams).toLocaleString('fa-IR')} گرم${c.foodItem.preparationState==='dry'?' خشک':c.foodItem.preparationState==='raw'?' خام':c.foodItem.preparationState==='cooked'?' پخته':''}`).join('، ')}</p><small>{Math.round(row.meal_snapshot.totalKcal).toLocaleString('fa-IR')} کالری</small><button type="button" className="member-secondary" disabled={!intakeReady} onClick={()=>void removeExtra(row.id)}>بازگرداندن ثبت</button></article>)}</section>}
        <MemberScanEntry disabled={!activePlan || !intakeReady} onClick={() => { setScanOpen(true); setViewDate(todayKey); window.scrollTo({ top: 0 }); }} />
        {viewError&&!dayOpen&&<p role="alert" className="member-notice">{viewError}{!viewedPlan&&<button type="button" onClick={()=>void selectDay(selectedDate)}>تلاش دوباره</button>}</p>}
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
          {nextIndex>=0?<div id={`meal-${viewedPlan.meals[nextIndex].slot}`} tabIndex={-1}><MealCard readOnly={!viewingToday} onChangeMeal={viewingToday ? ()=>void changeVisibleMeal(nextIndex) : undefined} changing={changingPlan} changeDisabled={changesBlocked} onSkip={()=>requestSkip(viewedPlan.meals[nextIndex])} key={viewedPlan.meals[nextIndex].slot} meal={viewedPlan.meals[nextIndex]} isConsumedSaving={pendingIntake?.slot === viewedPlan.meals[nextIndex].slot} consumedToggleDisabled={!intakeReady} onToggleConsumed={()=>handleToggleConsumed(nextIndex)} onSwapComponent={index=>handleSwapComponent(nextIndex,index)}/></div>:<div className="member-complete"><Check size={24}/><p>برای اصلاح یا مرور ثبت‌ها، برنامهٔ امروز را باز کن.</p></div>}
          <div className="member-plan-actions"><button type="button" className="member-secondary" aria-expanded={dayOpen} onClick={()=>setDayOpen(true)}><CalendarDays size={19}/><span className="day-entry-copy"><b>{viewingToday?'نمایش وعده‌های امروز':'نمایش همهٔ وعده‌های این روز'}</b><small>مرور غذاها و اصلاح ثبت‌ها</small></span><span>←</span></button></div></section>
        ) : (
          loadingPlan ? <MemberMealSkeleton title={mealTitle} /> :
            !loadError && !schedule.error && !viewError && <p className="member-muted">
              {nutritionResult ? 'برنامهٔ این روز آماده نیست.' : 'اطلاعات برنامهٔ خودکار کامل نیست یا به بررسی متخصص نیاز دارد.'}
            </p>
        )}
      </div>}

      {dayOpen&&viewedPlan&&<MemberDialog title={viewingToday?'وعده‌های امروز':'وعده‌های این روز'} onClose={()=>setDayOpen(false)} wide>
        {intakeFeedback}
        {viewError && <p role="alert" className="member-notice">{viewError}</p>}
        <div className="day-sheet-intro"><div><span>{new Date(selectedDate+'T12:00:00').toLocaleDateString('fa-IR',{weekday:'long',day:'numeric',month:'long'})}</span><strong>{toPersianDigits(viewedPlan.meals.filter(m=>m.consumed).length)} از {toPersianDigits(viewedPlan.meals.length)} وعده ثبت شده</strong></div><span>{toPersianDigits(viewedPlan.targets.targetCalories)}<small> کالری هدف</small></span></div>
        <button type="button" className="member-primary week-entry-button" onClick={()=>{setDayOpen(false);setWeekOpen(true);}}><CalendarDays size={17}/>نمایش وعده‌های هفته<span>←</span></button>
        <div className="day-meal-list">{viewedPlan.meals.map((meal,index)=><MealCard compact readOnly={!viewingToday} onSkip={()=>requestSkip(meal)} skipped={isMealSkipped(meal.slot,skipped,todayKey,selectedDate)} key={meal.slot} meal={meal} isConsumedSaving={pendingIntake?.slot === meal.slot} consumedToggleDisabled={!intakeReady} changeDisabled={changesBlocked} onToggleConsumed={()=>handleToggleConsumed(index)} onSwapComponent={componentIndex=>{setDayOpen(false);handleSwapComponent(index,componentIndex);}}/>)}</div>
        {viewingToday&&<details className="day-more-options"><summary>تنوع غذا و کیفیت برنامه</summary><button type="button" className="member-secondary" onClick={()=>{regenerate();setDayOpen(false);}} disabled={Boolean(viewedPlan.meals.every(m=>m.consumed))||!intakeReady}><RefreshCw size={15}/>تغییر وعده‌های باقی‌مانده</button>{foodQuality&&<NutritionQualitySummary quality={foodQuality}/>}</details>}
      </MemberDialog>}
      {weekOpen && activePlan && profile && (
        <Suspense fallback={<AppLoading label="در حال بازکردن برنامهٔ هفته…" />}><WeekPlanner
          today={todayKey}
          plan={activePlan}
          profile={profile}
          schedule={schedule}
          onRetry={refreshSchedule}
          onClose={() => setWeekOpen(false)}
        /></Suspense>
      )}
      {progressVisited && user && profile && proteinPolicy && (
        <div
          hidden={section !== 'progress'}
          className="member-progress-panel max-w-md mx-auto px-4 py-6 space-y-5"
        >
          <Suspense fallback={<AppLoading label="در حال بازکردن روند…" />}><MemberAnalytics
            userId={user.id}
            today={todayKey}
            currentPlan={activePlan}
          />
          <ProgressJournal
            key={`${user.id}:${todayKey}`}
            userId={user.id}
            today={todayKey}
            active={section === 'progress'}
            profile={profile}
            policy={proteinPolicy}
          /></Suspense>
        </div>
      )}
      {section==='training'&&profile&&<div className='max-w-md mx-auto px-4 py-6'><Suspense fallback={<AppLoading label="در حال بازکردن تمرین…" />}><MemberTraining profile={profile}/></Suspense></div>}
      {profileVisited && profile && (
        <div
          hidden={section !== 'profile'}
          id="profile-panel"
          className="max-w-md mx-auto px-4 py-6"
        >
          <div className="account-heading-v2"><span>حساب من</span><button type="button" aria-label="خروج از حساب" onClick={signOut}><LogOut size={16}/>خروج</button></div><Suspense fallback={<AppLoading label="در حال بازکردن حساب…" />}><MemberProfile
            key={`${profile.id}:${todayKey}`}
            profile={profile}
            today={todayKey}
          /></Suspense>
        </div>
      )}
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
        loading={!engine && !swapEngineError}
        unavailable={swapEngineError}
        onSelect={handleSwapSelect}
      />
    </MemberHomeShell>
  );
}
