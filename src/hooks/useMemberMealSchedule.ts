import type { MemberIntakeIntent, MemberIntakeRequest, MemberIntakeReceipt } from '@/member/intake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { memberRequest, MemberRequestError } from '@/member/api';
import { addPlanDays } from '@/utils/mealPresentation';
import { isMealPlan, isPrescriptionPlan } from '@/utils/mealValidation';
import type { DailyMealPlan, Meal, MealSlot } from '@/types';
import type { DailyMealSnapshots } from '@/utils/dailyMealProgress';

type Row = { plan_date: string; plan: unknown; context_key: string; updated_at: string };
type Day = {
  date: string;
  catalogRevision: string | null;
  profileContext: string;
  intakeRevision: string;
  schedule: (Omit<Row, 'plan_date'> & { server_verified: boolean; server_authored: boolean }) | null;
  checkins: DailyMealSnapshots;
  skipped: MealSlot[];
  extras: Meal[];
  extraFoodIds: string[];
};
export type MealIntent =
  | { kind: 'generate'; workout: boolean; regenerate: boolean }
  | { kind: 'rotate'; slot: MealSlot }
  | { kind: 'swap'; slot: MealSlot; componentIndex: number; foodId: string; units: number };
export type IntakePreview =
  | { kind: 'record'; slot: MealSlot; meal: Meal }
  | { kind: 'undo-record' | 'skip' | 'undo-skip'; slot: MealSlot };

type Mutation = MealIntent & {
  date: string;
  requestId: string;
  catalogRevision: string;
  intakeRevision: string;
  expectedUpdatedAt: string | null;
};
type CommitResult = Row & { intake_revision: string };
type Schedule = {
  key: string;
  day: Day | null;
  plans: Record<string, DailyMealPlan>;
  versions: Record<string, string>;
  error: string | null;
  conflict: boolean;
  contextStale: boolean;
  weekReady: boolean;
  weekError: string | null;
};

const empty: Omit<Schedule, 'key'> = { day: null, plans: {}, versions: {}, error: null, conflict: false, contextStale: false, weekReady: false, weekError: null };
const conflictMessage = 'برنامه در دستگاه یا پنجرهٔ دیگری تغییر کرده است. نسخهٔ تازه را باز کن و دوباره انتخاب کن.';
const unknownOutcome = 'نتیجهٔ ذخیره هنوز مشخص نیست. دوباره همان درخواست را بررسی کن.';
const unavailable = 'دریافت برنامهٔ ذخیره‌شده انجام نشد. دوباره تلاش کن.';
const busyMessage = 'ابتدا صبر کن تا برنامه و ثبت‌های روز آماده شوند.';
const message = (error: unknown, fallback: string) => error instanceof MemberRequestError ? error.message : fallback;
const canRetry = (error: unknown) => !(error instanceof MemberRequestError) || error.status >= 500;

function withRow(state: Schedule, date: string, context: string | null, row: Omit<Row, 'plan_date'> | null) {
  const plans = { ...state.plans };
  const versions = { ...state.versions };
  delete plans[date];
  delete versions[date];
  if (row) {
    versions[date] = row.updated_at;
    if (row.context_key === context) {
      if (isPrescriptionPlan(row.plan)) plans[date] = row.plan;
      else if (!isMealPlan(row.plan)) {
        throw new MemberRequestError('برنامهٔ ذخیره‌شده نیازمند بررسی است. با پشتیبانی تماس بگیر.', 'INVALID_PLAN', 422);
      }
    }
  }
  return { ...state, plans, versions };
}

function withIntakePreview(day: Day | null, preview?: IntakePreview): Day | null {
  if (!day || !preview) return day;
  const { slot } = preview;
  const checkins = { ...day.checkins };
  if (preview.kind === 'record') checkins[slot] = { ...preview.meal, consumed: true };
  else if (preview.kind !== 'undo-skip') delete checkins[slot];
  const skipped = preview.kind === 'skip'
    ? [...day.skipped.filter(value => value !== slot), slot]
    : preview.kind === 'undo-record' ? day.skipped : day.skipped.filter(value => value !== slot);
  return { ...day, checkins, skipped };
}

export function useMemberMealSchedule(
  userId: string | undefined,
  today: string,
  context: string | null,
  catalogRevision: string | null,
  profileContext: string | null,
) {
  const key = JSON.stringify([userId, today, context, catalogRevision, profileContext]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const [state, setState] = useState<Schedule>({ key: '', ...empty });
  const current = useRef(state);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const busy = useRef(false);
  const [preview, setPreview] = useState<{ key: string; change: IntakePreview; saving: boolean } | null>(null);
  const readController = useRef<AbortController | null>(null);
  const weekController = useRef<AbortController | null>(null);
  const scope = useRef<AbortController | null>(null);
  const conflictedDay = useRef<string | null>(null);
  const pending = useRef<{ key: string; input: Mutation; action: 'meal_schedule' } | { key: string; input: MemberIntakeRequest; action: 'meal_intake' } | null>(null);
  const enabled = Boolean(userId && context && catalogRevision);

  const publish = useCallback((next: Schedule) => {
    if (currentKey.current !== key) return;
    current.current = next;
    setState(next);
  }, [key]);

  const readDay = useCallback(async (date: string, signal?: AbortSignal) => {
    const day = await memberRequest<Day>('meal_schedule', { input: { kind: 'read', date } }, { userId, signal });
    if (!day || day.date !== date || !day.catalogRevision || day.extras.length !== day.extraFoodIds.length)
      throw new MemberRequestError('سرویس برنامهٔ غذایی هنوز آماده نیست.', 'MEAL_SCHEDULE_MIGRATION_REQUIRED', 503);
    if (day.catalogRevision !== catalogRevision || day.profileContext !== profileContext)
      throw new MemberRequestError('پروفایل یا نسخهٔ داده‌های تغذیه تغییر کرده است. نسخهٔ تازه را باز کن.', 'STALE_CONTEXT', 409);
    return day;
  }, [userId, catalogRevision, profileContext]);

  const refresh = useCallback(async (force = false) => {
    if (!enabled || currentKey.current !== key || (!force && (busy.current || pending.current?.key === key))) return;
    if (!force && readController.current) return;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    try {
      const day = await readDay(today, signal);
      if (controller.signal.aborted || currentKey.current !== key) return;
      const latest = current.current;
      const base = latest.key === key ? latest : { key, ...empty };
      publish({ ...withRow(base, today, context, day.schedule),
        day, error: null, conflict: false, contextStale: false });
      setPreview(previous => previous?.key === key ? null : previous);
    } catch (error) {
      if (controller.signal.aborted) return;
      const previous = current.current;
      const conflict = error instanceof MemberRequestError && error.status === 409;
      const contextStale = error instanceof MemberRequestError && ['STALE_CONTEXT', 'ACCESS_DENIED', 'AUTH_REQUIRED'].includes(error.code);
      publish({ ...(previous.key === key ? previous : { key, ...empty }),
        error: message(error, unavailable), conflict, contextStale });
    } finally {
      if (readController.current === controller) readController.current = null;
    }
  }, [enabled, key, readDay, today, context, publish]);

  const loadWeek = useCallback(async () => {
    if (!enabled || current.current.key !== key || currentKey.current !== key || weekController.current) return;
    const controller = new AbortController();
    const startingVersions = current.current.versions;
    weekController.current = controller;
    publish({ ...current.current, weekError: null });
    try {
      const { data, error } = await supabase.from('member_meal_schedule').select('plan_date,plan,context_key,updated_at')
        .eq('user_id', userId!).gt('plan_date', today).lte('plan_date', addPlanDays(today, 6))
        .abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).retry(false);
      if (controller.signal.aborted || currentKey.current !== key) return;
      if (error) throw error;
      const rows = new Map((data as Row[]).map(row => [row.plan_date, row]));
      let next = current.current;
      for (let offset = 1; offset <= 6; offset++) {
        const date = addPlanDays(today, offset);
        if (startingVersions[date] === next.versions[date]) next = withRow(next, date, context, rows.get(date) ?? null);
      }
      publish({ ...next, weekReady: true, weekError: null });
    } catch (error) {
      if (!controller.signal.aborted) publish({ ...current.current, weekError: message(error, unavailable) });
    } finally {
      if (weekController.current === controller) weekController.current = null;
    }
  }, [enabled, key, userId, today, context, publish]);

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    conflictedDay.current = null;
    if (pending.current?.key !== key) pending.current = null;
    setPreview(previous => previous?.key === key ? previous : null);
    void refresh(current.current.key !== key);
    const sync = () => { if (document.visibilityState === 'visible' && !current.current.conflict) void refresh(); };
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      controller.abort();
      readController.current?.abort();
      readController.current = null;
      weekController.current?.abort();
      weekController.current = null;
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [key, refresh]);

  const exclusive = useCallback(async (task: () => Promise<void>) => {
    if (busy.current || currentKey.current !== key) throw Error(busyMessage);
    busy.current = true;
    readController.current?.abort();
    setSavingKey(key);
    try {
      await task();
    } finally {
      busy.current = false;
      setSavingKey(null);
    }
  }, [key]);

  const send = useCallback(async (input: Mutation, recovering = false) => {
    const signal = scope.current?.signal;
    if (!signal || signal.aborted || currentKey.current !== key) throw Error(busyMessage);
    const attempt = () => memberRequest<CommitResult>('meal_schedule', { input }, {
      userId, signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    });
    let saved: CommitResult;
    try {
      try { saved = await attempt(); }
      catch (error) {
        if (!canRetry(error) || signal.aborted || currentKey.current !== key) throw error;
        recovering = true;
        saved = await attempt();
      }
    } catch (error) {
      if (signal.aborted || currentKey.current !== key) throw error;
      if (canRetry(error)) {
        pending.current = { key, input, action: 'meal_schedule' };
        publish({ ...current.current, error: unknownOutcome, conflict: false });
        throw Error(unknownOutcome);
      }
      pending.current = null;
      if (error instanceof MemberRequestError) {
        if (error.status === 409) conflictedDay.current = input.date;
        const contextStale = ['STALE_CONTEXT', 'ACCESS_DENIED', 'AUTH_REQUIRED'].includes(error.code);
        if (error.status === 409 || contextStale) {
          publish({ ...current.current, error: error.message, conflict: error.status === 409, contextStale });
        }
      }
      throw error;
    }
    if (signal.aborted || currentKey.current !== key) return;
    pending.current = null;
    const latest = current.current;
    if (!recovering && saved?.plan_date === input.date && saved.context_key === context &&
        typeof saved.updated_at === 'string' && saved.intake_revision === input.intakeRevision &&
        [input.expectedUpdatedAt, saved.updated_at].includes(latest.versions[input.date] ?? null) &&
        isPrescriptionPlan(saved.plan) && saved.plan.nutritionContext?.revision === input.catalogRevision) {
      // The transaction proved the intake and plan versions at commit. On a
      // replay, read again because the receipt may describe an older state.
      const day = input.date === today && latest.day
        ? { ...latest.day, schedule: { ...saved, server_authored: true, server_verified: true } }
        : latest.day;
      publish({ ...latest, day, plans: { ...latest.plans, [input.date]: saved.plan },
        versions: { ...latest.versions, [input.date]: saved.updated_at },
        error: null, conflict: false, contextStale: false });
    } else if (input.date === today) await refresh(true);
    else {
      try {
        const day = await readDay(input.date, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
        if (!signal.aborted) publish({ ...withRow(current.current, input.date, context, day.schedule),
          error: null, conflict: false, contextStale: false });
      } catch (error) {
        if (signal.aborted || currentKey.current !== key) return;
        const contextStale = error instanceof MemberRequestError && error.code === 'STALE_CONTEXT';
        publish({ ...current.current, error: message(error, unavailable), conflict: contextStale, contextStale });
        throw error;
      }
    }
  }, [userId, key, today, context, publish, refresh, readDay]);

  const submit = useCallback(async (date: string, intent: MealIntent) => exclusive(async () => {
    const snapshot = current.current;
    if (!catalogRevision || snapshot.key !== key || !snapshot.day || snapshot.error || pending.current) throw Error(busyMessage);
    // Today uses exactly the snapshot from which the controls were rendered.
    const signal = scope.current?.signal;
    if (!signal || signal.aborted) throw Error(busyMessage);
    let day;
    try {
      day = date === today ? state.day : await readDay(date, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
    }
    catch (error) {
      if (error instanceof MemberRequestError && error.code === 'STALE_CONTEXT')
        publish({ ...snapshot, error: error.message, conflict: true, contextStale: true });
      throw error;
    }
    const expectedUpdatedAt = state.versions[date] ?? null;
    if (state.key !== key || !day || (day.schedule?.updated_at ?? null) !== expectedUpdatedAt ||
        (snapshot.versions[date] ?? null) !== expectedUpdatedAt ||
        (date === today && day.intakeRevision !== snapshot.day.intakeRevision)) {
      conflictedDay.current = date;
      publish({ ...current.current, conflict: true, error: conflictMessage });
      throw Error(conflictMessage);
    }
    if (signal.aborted || currentKey.current !== key) throw Error(busyMessage);
    await send({ ...intent, date, requestId: crypto.randomUUID(), catalogRevision,
      intakeRevision: day.intakeRevision, expectedUpdatedAt });
  }), [catalogRevision, key, today, readDay, send, exclusive, publish, state]);

  const prepareDay = useCallback(async (date: string, workout: boolean) => exclusive(async () => {
    const snapshot = current.current;
    const signal = scope.current?.signal;
    if (!catalogRevision || date === today || !signal || signal.aborted || snapshot.key !== key ||
        !snapshot.day || snapshot.error || pending.current) throw Error(busyMessage);
    let day: Day;
    try { day = await readDay(date, AbortSignal.any([signal, AbortSignal.timeout(15000)])); }
    catch (error) {
      if (error instanceof MemberRequestError && error.code === 'STALE_CONTEXT')
        publish({ ...current.current, error: error.message, conflict: true, contextStale: true });
      throw error;
    }
    if (signal.aborted || currentKey.current !== key) return;
    if (current.current.versions[date] !== snapshot.versions[date]) {
      conflictedDay.current = date;
      publish({ ...current.current, conflict: true, error: conflictMessage });
      throw Error(conflictMessage);
    }
    const next = withRow(current.current, date, context, day.schedule);
    publish(next);
    if (next.plans[date]) return;
    await send({ kind: 'generate', workout, regenerate: false, date, requestId: crypto.randomUUID(),
      catalogRevision, intakeRevision: day.intakeRevision, expectedUpdatedAt: day.schedule?.updated_at ?? null });
  }), [catalogRevision, key, today, context, readDay, exclusive, publish, send]);

  const sendIntake = useCallback(async (input: MemberIntakeRequest) => {
    const owner = scope.current;
    if (!owner || owner.signal.aborted || currentKey.current !== key) throw Error(busyMessage);
    const attempt = () => memberRequest<MemberIntakeReceipt>('meal_intake', { input }, {
      userId, signal: AbortSignal.any([owner.signal, AbortSignal.timeout(20000)]),
    });
    try {
      let saved: MemberIntakeReceipt;
      try { saved = await attempt(); }
      catch (error) {
        if (!canRetry(error) || owner.signal.aborted || currentKey.current !== key) throw error;
        saved = await attempt(); // The identical key resolves a lost response.
      }
      if (owner.signal.aborted || currentKey.current !== key) return;
      const valid = saved?.kind === 'intake' && saved.date === input.date &&
        /^(0|[1-9]\d*)$/.test(saved.intakeRevision) && (saved.replayed || saved.expectedUpdatedAt === input.expectedUpdatedAt) &&
        typeof saved.replayed === 'boolean';
      if (!valid) throw Error(unknownOutcome);
      pending.current = null;
      if (saved.replayed) {
        // A receipt proves the action committed, but a later device action may
        // already exist. Never install the historical receipt as current state.
        await refresh(true);
      } else if (current.current.day) {
        let day = current.current.day;
        if (input.kind === 'extra-add') day = { ...day,
          extras: [...day.extras, { ...input.meal, consumed: true }], extraFoodIds: [...day.extraFoodIds, input.requestId] };
        else if (input.kind === 'extra-remove') {
          const index = day.extraFoodIds.indexOf(input.id);
          day = { ...day, extras: day.extras.filter((_, i) => i !== index), extraFoodIds: day.extraFoodIds.filter(id => id !== input.id) };
        } else day = withIntakePreview(day, input)!;
        publish({ ...current.current, day: { ...day, intakeRevision: saved.intakeRevision },
          error: null, conflict: false, contextStale: false });
      }
    } catch (error) {
      if (owner.signal.aborted || currentKey.current !== key) throw error;
      if (canRetry(error)) {
        pending.current = { key, input, action: 'meal_intake' };
        publish({ ...current.current, error: unknownOutcome, conflict: false });
        throw Error(unknownOutcome);
      }
      pending.current = null;
      if (error instanceof MemberRequestError) {
        const contextStale = ['STALE_CONTEXT', 'ACCESS_DENIED', 'AUTH_REQUIRED'].includes(error.code);
        if (error.status === 409) conflictedDay.current = today;
        if (error.status === 409 || contextStale) publish({ ...current.current,
          error: error.message, conflict: error.status === 409, contextStale });
      }
      throw error;
    }
  }, [userId, key, today, publish, refresh]);

  const changeIntake = useCallback(async (intent: MemberIntakeIntent, requestId?: string) => exclusive(async () => {
    const latest = current.current;
    const owner = scope.current;
    if (!owner || owner.signal.aborted || latest.key !== key || !latest.day || latest.error || pending.current ||
        !catalogRevision || !profileContext) throw Error(busyMessage);
    if (state.key !== key || state.day?.intakeRevision !== latest.day.intakeRevision ||
        state.versions[today] !== latest.versions[today]) throw Error(conflictMessage);
    const change = intent.kind === 'extra-add' || intent.kind === 'extra-remove' ? undefined : intent;
    if (change) setPreview({ key, change, saving: true });
    try {
      await sendIntake({ ...intent, date: today, requestId: requestId ?? crypto.randomUUID(),
        catalogRevision, profileContext, intakeRevision: latest.day.intakeRevision,
        expectedUpdatedAt: latest.day.schedule?.updated_at ?? null });
    } finally {
      setPreview(previous => previous?.key === key ? null : previous);
    }
  }), [key, today, state, catalogRevision, profileContext, exclusive, sendIntake]);

  const retry = useCallback(async () => {
    if (busy.current || currentKey.current !== key) return;
    const operation = pending.current;
    if (operation?.key === key) await exclusive(() => operation.action === 'meal_intake'
      ? sendIntake(operation.input) : send(operation.input, true));
    else {
      const date = conflictedDay.current;
      await refresh(true);
      if (date && date !== today && currentKey.current === key && !current.current.error) {
        await exclusive(async () => {
          const signal = scope.current?.signal;
          if (!signal || signal.aborted) return;
          try {
            const day = await readDay(date, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
            if (!signal.aborted) {
              publish(withRow(current.current, date, context, day.schedule));
              conflictedDay.current = null;
            }
          } catch (error) {
            if (!signal.aborted) publish({ ...current.current, conflict: true, error: message(error, unavailable) });
            throw error;
          }
        });
      }
    }
  }, [key, today, context, exclusive, refresh, send, sendIntake, readDay, publish]);

  const visible = state.key === key ? state : empty;
  const activePreview = preview?.key === key && !visible.contextStale ? preview : null;
  return { ...visible, loading: enabled && state.key !== key, saving: savingKey !== null,
    displayDay: withIntakePreview(visible.day, activePreview?.change),
    pendingIntake: activePreview?.saving ? activePreview.change : null,
    syncingIntake: false,
    submit, prepareDay, loadWeek, changeIntake, retry };
}
