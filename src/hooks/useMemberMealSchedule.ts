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
type Mutation = MealIntent & {
  date: string;
  requestId: string;
  catalogRevision: string;
  intakeRevision: string;
  expectedUpdatedAt: string | null;
};
type Schedule = {
  key: string;
  day: Day | null;
  plans: Record<string, DailyMealPlan>;
  versions: Record<string, string>;
  error: string | null;
  conflict: boolean;
  contextStale: boolean;
};

const empty: Omit<Schedule, 'key'> = { day: null, plans: {}, versions: {}, error: null, conflict: false, contextStale: false };
const conflictMessage = 'برنامه در دستگاه یا پنجرهٔ دیگری تغییر کرده است. نسخهٔ تازه را باز کن و دوباره انتخاب کن.';
const unknownOutcome = 'نتیجهٔ ذخیره هنوز مشخص نیست. دوباره همان درخواست را بررسی کن.';
const unavailable = 'دریافت برنامهٔ ذخیره‌شده انجام نشد. دوباره تلاش کن.';
const busyMessage = 'ابتدا صبر کن تا برنامه و ثبت‌های روز آماده شوند.';
const message = (error: unknown, fallback: string) => error instanceof MemberRequestError ? error.message : fallback;
const canRetry = (error: unknown) => !(error instanceof MemberRequestError) || error.status >= 500;

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
  const readController = useRef<AbortController | null>(null);
  const scope = useRef<AbortController | null>(null);
  const pending = useRef<{ key: string; input: Mutation } | null>(null);
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
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    try {
      const [day, week] = await Promise.all([
        readDay(today, signal),
        supabase.from('member_meal_schedule').select('plan_date,plan,context_key,updated_at')
          .eq('user_id', userId!).gt('plan_date', today).lte('plan_date', addPlanDays(today, 6))
          .abortSignal(signal).retry(false),
      ]);
      if (controller.signal.aborted) return;
      if (week.error) throw week.error;
      const plans: Schedule['plans'] = {};
      const versions: Schedule['versions'] = {};
      const rows: Row[] = day.schedule ? [{ ...day.schedule, plan_date: today }, ...week.data] : week.data;
      for (const row of rows) {
        if (row.context_key === context && !isMealPlan(row.plan)) {
          throw new MemberRequestError('برنامهٔ ذخیره‌شده نیازمند بررسی است. با پشتیبانی تماس بگیر.', 'INVALID_PLAN', 422);
        }
        versions[row.plan_date] = row.updated_at;
        if (row.context_key === context && isPrescriptionPlan(row.plan)) plans[row.plan_date] = row.plan;
      }
      publish({ key, day, plans, versions, error: null, conflict: false, contextStale: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      const previous = current.current;
      const conflict = error instanceof MemberRequestError && error.status === 409;
      const contextStale = error instanceof MemberRequestError && ['STALE_CONTEXT', 'ACCESS_DENIED', 'AUTH_REQUIRED'].includes(error.code);
      publish({ ...(previous.key === key ? previous : { key, ...empty }),
        error: message(error, unavailable), conflict, contextStale });
    }
  }, [enabled, key, readDay, today, userId, context, publish]);

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    if (pending.current?.key !== key) pending.current = null;
    void refresh(current.current.key !== key);
    const sync = () => { if (document.visibilityState === 'visible' && !current.current.conflict) void refresh(); };
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      controller.abort();
      readController.current?.abort();
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

  const send = useCallback(async (input: Mutation) => {
    const signal = scope.current?.signal;
    if (!signal || signal.aborted || currentKey.current !== key) throw Error(busyMessage);
    const attempt = () => memberRequest('meal_schedule', { input }, {
      userId, signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    });
    try {
      try { await attempt(); }
      catch (error) {
        if (!canRetry(error) || signal.aborted || currentKey.current !== key) throw error;
        await attempt();
      }
    } catch (error) {
      if (signal.aborted || currentKey.current !== key) throw error;
      if (canRetry(error)) {
        pending.current = { key, input };
        publish({ ...current.current, error: unknownOutcome, conflict: false });
        throw Error(unknownOutcome);
      }
      pending.current = null;
      if (error instanceof MemberRequestError) {
        const contextStale = ['STALE_CONTEXT', 'ACCESS_DENIED', 'AUTH_REQUIRED'].includes(error.code);
        if (error.status === 409 || contextStale) {
          publish({ ...current.current, error: error.message, conflict: error.status === 409, contextStale });
        }
      }
      throw error;
    }
    if (signal.aborted || currentKey.current !== key) return;
    pending.current = null;
    await refresh(true);
  }, [userId, key, publish, refresh]);

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
      publish({ ...snapshot, conflict: true, error: conflictMessage });
      throw Error(conflictMessage);
    }
    if (signal.aborted || currentKey.current !== key) throw Error(busyMessage);
    await send({ ...intent, date, requestId: crypto.randomUUID(), catalogRevision,
      intakeRevision: day.intakeRevision, expectedUpdatedAt });
  }), [catalogRevision, key, today, readDay, send, exclusive, publish, state]);

  const changeIntake = useCallback(async (task: () => Promise<void>) => exclusive(async () => {
    const latest = current.current;
    if (latest.key !== key || !latest.day || latest.error || pending.current) throw Error(busyMessage);
    if (state.key !== key || state.day?.intakeRevision !== latest.day.intakeRevision ||
        state.versions[today] !== latest.versions[today]) throw Error(conflictMessage);
    try { await task(); }
    finally { await refresh(true); }
  }), [key, today, state, exclusive, refresh]);

  const retry = useCallback(async () => {
    if (busy.current || currentKey.current !== key) return;
    const operation = pending.current;
    if (operation?.key === key) await exclusive(() => send(operation.input));
    else await refresh();
  }, [key, exclusive, refresh, send]);

  const visible = state.key === key ? state : empty;
  return { ...visible, loading: enabled && state.key !== key, saving: savingKey !== null,
    submit, changeIntake, retry };
}
