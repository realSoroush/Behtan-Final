import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Serialize writes from this browser so an older request cannot overtake a swap.
let queue: Promise<unknown> = Promise.resolve();
export function usePlanReporting(date: string, payload: unknown | null) {
  const serialized = payload ? JSON.stringify(payload) : null;
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!serialized) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      queue = queue.catch(() => {}).then(async () => {
        if (cancelled) return;
        const controller = new AbortController();
        const deadline = window.setTimeout(() => controller.abort(), 12000);
        try {
          const { error: failure } = await supabase.rpc('save_daily_plan', { p_date: date, p_snapshot: JSON.parse(serialized) }).abortSignal(controller.signal);
          if (!cancelled) setError(Boolean(failure));
        } finally { clearTimeout(deadline); }
      }).catch(() => { if (!cancelled) setError(true); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [date, serialized, retry]);
  useEffect(() => {
    if (!error) return;
    const timer = window.setInterval(() => setRetry(n => n + 1), 15000);
    return () => clearInterval(timer);
  }, [error]);
  return { error, retry: () => setRetry(n => n + 1) };
}
