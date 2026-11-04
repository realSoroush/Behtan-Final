import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { addPlanDays, isPresentablePlan } from "@/utils/mealPresentation";
import type { DailyMealPlan } from "@/types";
type Row = { plan_date: string; plan: unknown; context_key: string; updated_at: string };
const emptySchedule = { plans: {}, versions: {} };

function scheduleFrom(rows: unknown, context: string) {
  const plans: Record<string, DailyMealPlan> = {};
  const versions: Record<string, string> = {};
  for (const row of (Array.isArray(rows) ? rows as Row[] : [])) {
    if (!row || typeof row.plan_date !== "string" || typeof row.updated_at !== "string") continue;
    versions[row.plan_date] = row.updated_at;
    if (row.context_key === context && isPresentablePlan(row.plan)) plans[row.plan_date] = row.plan;
  }
  return { plans, versions };
}

const conflictMessage = "برنامه در دستگاه یا پنجرهٔ دیگری تغییر کرده است. نسخهٔ تازه را باز کن و دوباره انتخاب کن.";

export function useMemberMealSchedule(
  userId: string | undefined,
  today: string,
  context: string | null,
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
        if (alive)
          setState({
            key,
            ...(error ? emptySchedule : scheduleFrom(data, context)),
            error: error
              ? "دریافت برنامهٔ ذخیره‌شده انجام نشد. برنامهٔ فعلی قابل‌استفاده است؛ برای هفته دوباره تلاش کن."
              : null,
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
    async (days: { date: string; plan: DailyMealPlan }[], replace = false) => {
      if (!context || !userId || key !== state.key || state.error)
        throw Error("ابتدا برنامهٔ ذخیره‌شده را دوباره دریافت کن.");
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
            .rpc("save_member_meal_schedule_v2", {
              p_today: today,
              p_context: context,
              p_days: versionedDays,
              p_replace: replace,
            })
            .abortSignal(controller.signal)
            .retry(false);
          if (error?.message === "MEAL_SCHEDULE_CONFLICT") {
            if (keyRef.current === key) {
              conflictKey.current = key;
              setState(current => ({ ...current, error: conflictMessage, conflict: true }));
            }
            throw Error(conflictMessage);
          }
          if (error) throw Error("برنامه ذخیره نشد. دوباره تلاش کن.");
          const updated = scheduleFrom(data, context);
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
    [context, userId, key, state.key, state.error, state.versions, today],
  );
  return {
    plans: state.key === key ? state.plans : {},
    loading: Boolean(userId && context) && state.key !== key,
    error: state.key === key ? state.error : null,
    saving,
    save,
    conflict: state.key === key && Boolean(state.conflict),
    retry: () => {
      if (conflictKey.current === key) window.location.reload();
      else setRetry((n) => n + 1);
    },
  };
}
