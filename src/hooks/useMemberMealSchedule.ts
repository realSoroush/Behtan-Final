import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { addPlanDays, isPresentablePlan } from "@/utils/mealPresentation";
import type { DailyMealPlan } from "@/types";
type Row = { plan_date: string; plan: DailyMealPlan };
const plansFrom = (rows: unknown) =>
  Object.fromEntries(
    (Array.isArray(rows) ? rows : [])
      .filter(
        (r: Row) =>
          r && typeof r.plan_date === "string" && isPresentablePlan(r.plan),
      )
      .map((r: Row) => [r.plan_date, r.plan]),
  );
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
    error: string | null;
  }>({ key: "", plans: {}, error: null });
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
          .select("plan_date,plan")
          .eq("user_id", userId)
          .eq("context_key", context)
          .gte("plan_date", today)
          .lte("plan_date", addPlanDays(today, 6))
          .abortSignal(controller.signal);
        if (alive)
          setState({
            key,
            plans: error ? {} : plansFrom(data),
            error: error
              ? "دریافت برنامهٔ ذخیره‌شده انجام نشد. برنامهٔ فعلی قابل‌استفاده است؛ برای هفته دوباره تلاش کن."
              : null,
          });
      } catch {
        if (alive)
          setState({
            key,
            plans: {},
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
      const task = async () => {
        if (keyRef.current !== key)
          throw Error("اطلاعات مبنای برنامه تغییر کرده است.");
        setSaving(true);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const { data, error } = await supabase
            .rpc("save_member_meal_schedule", {
              p_today: today,
              p_context: context,
              p_days: days,
              p_replace: replace,
            })
            .abortSignal(controller.signal)
            .retry(false);
          if (error) throw Error("برنامه ذخیره نشد. دوباره تلاش کن.");
          const plans = plansFrom(data);
          if (keyRef.current === key) setState({ key, plans, error: null });
          return plans;
        } finally {
          clearTimeout(timeout);
          if (keyRef.current === key) setSaving(false);
        }
      };
      const pending = queue.current.catch(() => {}).then(task);
      queue.current = pending;
      return pending;
    },
    [context, userId, key, state.key, state.error, today],
  );
  return {
    plans: state.key === key ? state.plans : {},
    loading: Boolean(userId && context) && state.key !== key,
    error: state.key === key ? state.error : null,
    saving,
    save,
    retry: () => setRetry((n) => n + 1),
  };
}
