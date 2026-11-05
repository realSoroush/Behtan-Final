import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { addPlanDays } from "@/utils/mealPresentation";
import { isMealPlan as isPresentablePlan, isPrescriptionPlan } from '@/utils/mealValidation';
import type { DailyMealPlan, DietaryPreferencesJson } from "@/types";
type Row = { plan_date: string; plan: unknown; context_key: string; updated_at: string };
const emptySchedule = { plans: {}, versions: {} };

function scheduleFrom(rows: unknown, context: string) {
  const plans: Record<string, DailyMealPlan> = {};
  const versions: Record<string, string> = {};
  let invalid = false;
  for (const row of (Array.isArray(rows) ? rows as Row[] : [])) {
    if (!row || typeof row.plan_date !== "string" || typeof row.updated_at !== "string") continue;
    versions[row.plan_date] = row.updated_at;
    // The save RPC returns the version only for rows from another context.
    if (row.plan === null && row.context_key !== context) continue;
    if (!isPresentablePlan(row.plan)) invalid = true;
    else if (row.context_key === context) {
      if (isPrescriptionPlan(row.plan)) plans[row.plan_date] = row.plan;
      // Legacy intake-bearing schedules are rebuilt underneath intact checkins.
    }
  }
  return { plans, versions, invalid };
}

const conflictMessage = "برنامه در دستگاه یا پنجرهٔ دیگری تغییر کرده است. نسخهٔ تازه را باز کن و دوباره انتخاب کن.";

export function useMemberMealSchedule(
  userId: string | undefined,
  today: string,
  context: string | null,
  dietaryPreferences: DietaryPreferencesJson | null,
) {
  const key = `${userId}:${today}:${context}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [state, setState] = useState<{
    key: string;
    plans: Record<string, DailyMealPlan>;
    versions: Record<string, string>;
    error: string | null;
    conflict?: boolean;
    profileChanged?: boolean;
  }>({ key: "", ...emptySchedule, error: null });
  const conflictKey = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!userId || !context) return;
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("member_meal_schedule")
          .select("plan_date,plan,context_key,updated_at")
          .eq("user_id", userId)
          .gte("plan_date", today)
          .lte("plan_date", addPlanDays(today, 6))
          .abortSignal(controller.signal);
        const parsed = error ? emptySchedule : scheduleFrom(data, context);
        if (alive)
          setState({
            key,
            ...parsed,
            error: error
              ? "دریافت برنامهٔ ذخیره‌شده انجام نشد. برنامهٔ فعلی قابل‌استفاده است؛ برای هفته دوباره تلاش کن."
              : ('invalid' in parsed && parsed.invalid) ? 'برنامهٔ ذخیره‌شده نیازمند بررسی است؛ داده حذف نشده است. با پشتیبانی تماس بگیر.' : null,
          });
      } catch {
        if (alive)
          setState({
            key,
            ...emptySchedule,
            error: "اتصال به برنامهٔ هفتگی برقرار نشد.",
          });
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [userId, today, context, key, retry]);
  const save = useCallback(
    async (days: { date: string; plan: DailyMealPlan }[], replace = false, mealEdit = false) => {
      if (!context || !userId || key !== state.key || state.error)
        throw Error("ابتدا برنامهٔ ذخیره‌شده را دوباره دریافت کن.");
      if (!days.every(day => isPrescriptionPlan(day.plan))) throw Error('برنامهٔ پیشنهادی معتبر نیست؛ دوباره دریافت کن.');
      const versionedDays = days.map(day => ({
        ...day,
        expected_updated_at: state.versions[day.date] ?? null,
      }));
      const task = async () => {
        if (conflictKey.current === key) throw Error(conflictMessage);
        if (keyRef.current !== key)
          throw Error("اطلاعات مبنای برنامه تغییر کرده است.");
        setSaving(true);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const { data, error } = await supabase
            .rpc("save_member_meal_schedule_v3", {
              p_today: today,
              p_context: context,
              p_days: versionedDays,
              p_replace: replace,
              p_expected_diet: dietaryPreferences,
              p_meal_edit: mealEdit,
            })
            .abortSignal(controller.signal)
            .retry(false);
          if (error?.message === "MEAL_SCHEDULE_CONFLICT" || error?.message === "MEAL_PROFILE_CHANGED") {
            const message = error.message === "MEAL_PROFILE_CHANGED"
              ? "ترجیحات غذایی در دستگاه دیگری تغییر کرده‌اند. نسخهٔ تازه را باز کن."
              : conflictMessage;
            if (keyRef.current === key) {
              conflictKey.current = key;
              setState(current => ({
                ...current, error: message, conflict: true,
                profileChanged: error.message === "MEAL_PROFILE_CHANGED",
              }));
            }
            throw Error(message);
          }
          if (error) throw Error("برنامه ذخیره نشد. دوباره تلاش کن.");
          const updated = scheduleFrom(data, context);
          if (updated.invalid) throw Error('پاسخ ذخیرهٔ برنامه معتبر نیست؛ دوباره دریافت کن.');
          if (keyRef.current === key) setState({ key, ...updated, error: null });
          return updated.plans;
        } finally {
          clearTimeout(timeout);
          if (keyRef.current === key) setSaving(false);
        }
      };
      const pending = queue.current.catch(() => {}).then(task);
      queue.current = pending;
      return pending;
    },
    [context, userId, key, state.key, state.error, state.versions, today, dietaryPreferences],
  );
  return {
    plans: state.key === key ? state.plans : {},
    loading: Boolean(userId && context) && state.key !== key,
    error: state.key === key ? state.error : null,
    saving,
    save,
    profileChanged: state.key === key && Boolean(state.profileChanged),
    conflict: state.key === key && Boolean(state.conflict),
    retry: () => {
      if (conflictKey.current === key) window.location.reload();
      else setRetry((n) => n + 1);
    },
  };
}
