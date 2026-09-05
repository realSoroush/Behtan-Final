import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Meal, MealSlot } from '@/types';
import { isStoredMealSnapshot, type DailyMealSnapshots } from '@/utils/dailyMealProgress';

export function useDailyMealProgress(userId: string | undefined, localDateKey: string) {
  const [snapshots, setSnapshots] = useState<DailyMealSnapshots>({});
  const [loading, setLoading] = useState(Boolean(userId));
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingSlotsState, setSavingSlotsState] = useState<MealSlot[]>([]);
  const requestKey = userId ? `${userId}:${localDateKey}` : null;
  const savingSlots = useMemo(() => new Set(savingSlotsState), [savingSlotsState]);

  const fetchProgress = useCallback(async () => {
    if (!userId) { setSnapshots({}); setLoadedKey(null); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    const { data, error: sbError } = await supabase.from('daily_meal_checkins').select('meal_slot, meal_snapshot').eq('user_id', userId).eq('plan_date', localDateKey);
    if (sbError) { setError('وضعیت وعده‌های امروز از حساب شما دریافت نشد.'); setSnapshots({}); }
    else {
      const next: DailyMealSnapshots = {};
      for (const row of data ?? []) { const slot = row.meal_slot as MealSlot; if (isStoredMealSnapshot(row.meal_snapshot, slot)) next[slot] = { ...row.meal_snapshot, consumed: true }; }
      setSnapshots(next);
    }
    setLoadedKey(requestKey); setLoading(false);
  }, [localDateKey, requestKey, userId]);

  useEffect(() => { setSnapshots({}); setLoadedKey(null); void fetchProgress(); }, [fetchProgress]);

  const setMealConsumed = useCallback(async (meal: Meal, consumed: boolean) => {
    if (!userId) throw new Error('Cannot persist meal progress without an authenticated user.');
    if (loadedKey !== requestKey) throw new Error('Daily meal progress is not hydrated yet.');
    if (savingSlotsState.includes(meal.slot)) return;
    const previous = snapshots[meal.slot]; setError(null); setSavingSlotsState((c)=>[...c, meal.slot]);
    setSnapshots((current) => { const next = { ...current }; if (consumed) next[meal.slot] = { ...meal, consumed: true }; else delete next[meal.slot]; return next; });
    try {
      if (consumed) {
        const snapshot: Meal = { ...meal, consumed: true };
        const { error: sbError } = await supabase.from('daily_meal_checkins').upsert({ user_id:userId, plan_date:localDateKey, meal_slot:meal.slot, template_id:meal.templateId, meal_snapshot:snapshot, consumed_at:new Date().toISOString() }, { onConflict:'user_id,plan_date,meal_slot' });
        if (sbError) throw sbError;
      } else {
        const { error: sbError } = await supabase.from('daily_meal_checkins').delete().eq('user_id',userId).eq('plan_date',localDateKey).eq('meal_slot',meal.slot);
        if (sbError) throw sbError;
      }
    } catch (persistError) {
      setSnapshots((current) => { const next={...current}; if (previous) next[meal.slot]=previous; else delete next[meal.slot]; return next; });
      setError('ثبت وضعیت این وعده انجام نشد. دوباره تلاش کنید.'); throw persistError;
    } finally { setSavingSlotsState((c)=>c.filter((slot)=>slot!==meal.slot)); }
  }, [loadedKey, localDateKey, requestKey, savingSlotsState, snapshots, userId]);

  return { snapshots, loading: Boolean(userId) && (loading || loadedKey !== requestKey), error, savingSlots, setMealConsumed, refetch: fetchProgress };
}
