import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyMealPlan, Meal, MealSlot, UserProfile } from '../../src/types/index.ts';
import { memberNutrition } from '../../src/member/nutrition.ts';
import { changeMemberMeal, MealChangeUnavailableError } from '../../src/utils/changeMemberMeal.ts';
import { applyDailyMealSnapshots, type DailyMealSnapshots } from '../../src/utils/dailyMealProgress.ts';
import { historyOfMeals, MEAL_POLICY_VERSION } from '../../src/utils/mealExperience.ts';
import { createMealPlanEngine, MealPlanFeasibilityError, MealPlanGenerationError } from '../../src/utils/mealPlanEngine.ts';
import { swapBaselineComponent, withSwapBaseline } from '../../src/utils/mealPresentation.ts';
import { isMealSnapshot, isPrescriptionPlan, MEAL_SLOTS } from '../../src/utils/mealValidation.ts';
import { generateMemberPrescription } from '../../src/utils/memberPrescription.ts';
import { memberScheduleContext } from '../../src/utils/memberScheduleContext.ts';
import { readNutritionContext, type NutritionContext } from '../../src/utils/nutritionContext.ts';

type Revision = { date: string; requestId: string; catalogRevision: string; intakeRevision: string; expectedUpdatedAt: string | null };
type Intent = (Revision & { kind: 'generate'; workout: boolean; regenerate: boolean })
  | (Revision & { kind: 'rotate'; slot: MealSlot })
  | (Revision & { kind: 'swap'; slot: MealSlot; componentIndex: number; foodId: string; units: number });
type Request = Intent | { kind: 'read'; date: string };

export interface MemberDayState {
  profile: UserProfile;
  intake_revision: string;
  schedule: { plan: unknown; updated_at: string; context_key: string; server_verified: boolean; server_context_key: string | null } | null;
  previous_plan: unknown;
  checkins: Record<string, unknown>;
  skipped: MealSlot[];
  extras: unknown[];
  operation: { hash: string; result: unknown } | null;
}

export interface MealScheduleDependencies {
  read(user: string, day: string, requestId: string | null): Promise<MemberDayState>;
  loadContext(): Promise<NutritionContext>;
  reserve(user: string): Promise<boolean>;
  commit(input: Record<string, unknown>): Promise<unknown>;
}

function parseRequest(input: unknown): Request {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('INVALID_REQUEST');
  const b = input as Record<string, unknown>;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
      !Number.isFinite(Date.parse(b.date + 'T12:00:00Z')) ||
      new Date(b.date + 'T12:00:00Z').toISOString().slice(0, 10) !== b.date) throw Error('INVALID_MEAL_DATE');
  if (b.kind === 'read' && Object.keys(b).length === 2) return { kind: 'read', date: b.date };

  const keys = ['kind', 'date', 'requestId', 'catalogRevision', 'intakeRevision', 'expectedUpdatedAt'];
  if (typeof b.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.requestId) ||
      typeof b.catalogRevision !== 'string' || !/^[1-9]\d{0,18}$/.test(b.catalogRevision) ||
      typeof b.intakeRevision !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(b.intakeRevision) ||
      (b.expectedUpdatedAt !== null && (typeof b.expectedUpdatedAt !== 'string' ||
        b.expectedUpdatedAt.length > 40 || !Number.isFinite(Date.parse(b.expectedUpdatedAt))))) throw Error('INVALID_REQUEST');
  const revision: Revision = {
    date: b.date, requestId: b.requestId, catalogRevision: b.catalogRevision,
    intakeRevision: b.intakeRevision, expectedUpdatedAt: b.expectedUpdatedAt,
  };
  const only = (...fields: string[]) => Object.keys(b).every(k => keys.includes(k) || fields.includes(k));
  if (b.kind === 'generate' && typeof b.workout === 'boolean' && typeof b.regenerate === 'boolean' && only('workout', 'regenerate')) {
    return { ...revision, kind: 'generate', workout: b.workout, regenerate: b.regenerate };
  }
  if (!MEAL_SLOTS.includes(b.slot as MealSlot)) throw Error('INVALID_REQUEST');
  if (b.kind === 'rotate' && only('slot')) return { ...revision, kind: 'rotate', slot: b.slot as MealSlot };
  if (b.kind === 'swap' && only('slot', 'componentIndex', 'foodId', 'units') &&
      typeof b.componentIndex === 'number' && Number.isInteger(b.componentIndex) && b.componentIndex >= 0 && b.componentIndex < 20 &&
      typeof b.foodId === 'string' && b.foodId.length > 0 && b.foodId.length <= 100 &&
      typeof b.units === 'number' && Number.isFinite(b.units) && b.units > 0) {
    return { ...revision, kind: 'swap', slot: b.slot as MealSlot, componentIndex: b.componentIndex, foodId: b.foodId, units: b.units };
  }
  throw Error('INVALID_REQUEST');
}

function parseIntake(state: MemberDayState) {
  const checkins: DailyMealSnapshots = {};
  for (const [slot, snapshot] of Object.entries(state.checkins)) {
    if (!isMealSnapshot(snapshot, slot as MealSlot)) throw Error('INVALID_INTAKE');
    checkins[slot as MealSlot] = { ...snapshot, consumed: true };
  }
  if (!state.skipped.every(slot => MEAL_SLOTS.includes(slot)) ||
      state.extras.length > 100 || !state.extras.every(meal => isMealSnapshot(meal))) throw Error('INVALID_INTAKE');
  return { checkins, intake: { skippedSlots: state.skipped, extraMeals: state.extras as Meal[] } };
}

export async function processMemberMealSchedule(user: string, input: unknown, deps: MealScheduleDependencies) {
  const request = parseRequest(input);
  const state = await deps.read(user, request.date, request.kind === 'read' ? null : request.requestId);
  if (request.kind === 'read') {
    parseIntake(state);
    return {
      date: request.date, intakeRevision: state.intake_revision,
      schedule: state.schedule && {
        plan: state.schedule.plan, updated_at: state.schedule.updated_at, context_key: state.schedule.context_key,
        server_verified: state.schedule.server_verified,
      },
      checkins: state.checkins, skipped: state.skipped, extras: state.extras,
    };
  }
  const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  if (state.operation) {
    if (state.operation.hash !== hash) throw Error('REQUEST_CONFLICT');
    return state.operation.result;
  }
  if (state.intake_revision !== request.intakeRevision) throw Error('STALE_INTAKE');
  if ((state.schedule?.updated_at ?? null) !== request.expectedUpdatedAt) throw Error('STALE_PLAN');
  if (!await deps.reserve(user)) throw Error('RATE_LIMITED');
  const { revision, catalog, policy } = await deps.loadContext();
  if (revision !== request.catalogRevision) throw Error('STALE_CONTEXT');
  const { profile } = state;
  const preferences = profile.dietary_preferences_json;
  if (!preferences || !profile.weight) throw Error('MEDICAL_REVIEW_REQUIRED');
  const { checkins, intake } = parseIntake(state);
  const engine = createMealPlanEngine(catalog, revision);
  const context = memberScheduleContext(profile, catalog, policy);
  // The browser context fingerprint is for display/cache compatibility. Bind
  // edits to a separate strong key derived only from the server's inputs.
  const serverContext = createHash('sha256').update(JSON.stringify([profile, revision, MEAL_POLICY_VERSION])).digest('hex');

  let plan: DailyMealPlan;
  try {
    if (request.kind === 'generate') {
      if (!request.workout && checkins.post_workout) throw Error('MEAL_NOT_EDITABLE');
      let targets;
      try { targets = memberNutrition(profile, policy, request.workout).targets; }
      catch { throw Error('MEDICAL_REVIEW_REQUIRED'); }
      const previousDay = isPrescriptionPlan(state.previous_plan) ? historyOfMeals(state.previous_plan.meals) : [];
      const avoidMeals = request.regenerate && isPrescriptionPlan(state.schedule?.plan) ? historyOfMeals(state.schedule.plan.meals) : [];
      plan = generateMemberPrescription(targets, profile.weight, preferences, request.workout,
        request.date + (request.regenerate ? '-v' + request.requestId : '-v0'), {
          previousDay, avoidMeals, lockedMeals: Object.values(checkins),
          proteinBudgetPreference: profile.protein_budget_preference ?? 'performance',
        }, engine);
    } else {
      const base = state.schedule?.plan;
      if (!state.schedule?.server_verified || state.schedule.server_context_key !== serverContext ||
          !isPrescriptionPlan(base) || base.nutritionContext?.revision !== revision) throw Error('STALE_CONTEXT');
      try { memberNutrition(profile, policy, base.isWorkoutDay); }
      catch { throw Error('MEDICAL_REVIEW_REQUIRED'); }
      const active = withSwapBaseline(applyDailyMealSnapshots(base, checkins)!, base);
      const mealIndex = active.meals.findIndex(meal => meal.slot === request.slot);
      if (mealIndex < 0 || active.meals[mealIndex].consumed || intake.skippedSlots.includes(request.slot)) throw Error('MEAL_NOT_EDITABLE');
      const updated = request.kind === 'rotate'
        ? changeMemberMeal(active, mealIndex, preferences, intake, engine)
        : engine.getMemberSwapOptions(active, mealIndex, request.componentIndex, preferences, intake,
            swapBaselineComponent(active, request.slot, request.componentIndex) ?? undefined)
          .find(option => option.foodItem.id === request.foodId && option.replacementComponent.units === request.units)?.plan;
      if (!updated) throw Error('NO_FEASIBLE_PLAN');
      // A calculation may use facts from checkins. Persist only the underlying
      // recipe for those slots, including any previously approved edits.
      plan = { ...updated, meals: updated.meals.map(meal => checkins[meal.slot]
        ? base.meals.find(original => original.slot === meal.slot)! : meal) };
    }
  } catch (error) {
    if (error instanceof MealPlanFeasibilityError || error instanceof MealPlanGenerationError ||
        error instanceof MealChangeUnavailableError) throw Error('NO_FEASIBLE_PLAN');
    throw error;
  }
  if (!isPrescriptionPlan(plan)) throw Error('INVALID_PLAN');
  return deps.commit({
    p_user: user, p_day: request.date, p_request_id: request.requestId, p_request_hash: hash,
    p_profile: profile, p_catalog_revision: revision, p_intake_revision: state.intake_revision,
    p_expected_updated_at: request.expectedUpdatedAt, p_context: context, p_plan: plan,
    p_meal_edit: request.kind !== 'generate', p_server_context_key: serverContext,
  });
}

export function mealScheduleDependencies(db: SupabaseClient): MealScheduleDependencies {
  const call = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(name, args).abortSignal(AbortSignal.timeout(12000)).retry(false);
    if (error) throw Error(error.code === 'PGRST202' ? 'MEAL_SCHEDULE_MIGRATION_REQUIRED' : error.message);
    return data as T;
  };
  return {
    read: (p_user, p_day, p_request_id) => call('member_read_meal_day', { p_user, p_day, p_request_id }),
    loadContext: () => readNutritionContext(db, AbortSignal.timeout(12000)),
    reserve: p_user => call('member_reserve_compute', { p_user, p_action: 'meal_schedule' }),
    commit: input => call('member_commit_meal_day', input),
  };
}
