import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { SubscriptionPlan } from '@/types';
import {
  buildSubscriptionPlans,
  type SubscriptionPlanRow,
} from '@/utils/subscriptionPlans';

interface UseSubscriptionPlansReturn {
  plans: SubscriptionPlan[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<SubscriptionPlan[] | null>;
}

/** Loads the active, admin-managed subscription catalog from Supabase. */
export function useSubscriptionPlans(): UseSubscriptionPlansReturn {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const fetchPlans = useCallback(async () => {
    // Only the newest response may update the UI. Background refreshes leave
    // the cards visible instead of flashing a loader every thirty seconds.
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const { data, error: supabaseError } = await supabase
        .from('subscription_plans')
        .select('code,name,emoji,price_toman,price_note,duration_days,features,badge,theme,sort_order,is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('code', { ascending: true })
        .abortSignal(controller.signal);
      if (requestRef.current !== controller) return null;
      if (supabaseError) throw supabaseError;
      const nextPlans = buildSubscriptionPlans((data ?? []) as SubscriptionPlanRow[]);
      setPlans(nextPlans);
      setError(null);
      return nextPlans;
    } catch {
      if (requestRef.current !== controller) return null;
      setPlans([]);
      setError('دریافت پلن‌های اشتراک انجام نشد. لطفاً دوباره تلاش کنید.');
      return null;
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) {
        setLoading(false);
        requestRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
    const refreshVisible = () => {
      if (document.visibilityState === 'visible' && !requestRef.current) void fetchPlans();
    };
    const interval = window.setInterval(refreshVisible, 30_000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('online', refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('online', refreshVisible);
      const pending = requestRef.current;
      requestRef.current = null;
      pending?.abort();
    };
  }, [fetchPlans]);

  return { plans, loading, error, refetch: fetchPlans };
}
