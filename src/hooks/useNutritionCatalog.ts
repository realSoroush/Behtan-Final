import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { readNutritionContext, type NutritionContext } from '@/utils/nutritionContext';

export function useNutritionCatalog(scope?: string) {
  const [state, setState] = useState<{ scope?: string; context: NutritionContext | null; loading: boolean; error: string | null }>({
    context: null, loading: true, error: null,
  });
  const request = useRef<AbortController | null>(null);
  const cache = useRef<{ scope?: string; context: NutritionContext } | null>(null);

  const fetchContext = useCallback(async (foreground = true) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const cached = cache.current?.scope === scope ? cache.current?.context : undefined;
    if (foreground || !cached) setState({ scope, context: null, loading: true, error: null });
    try {
      const context = await readNutritionContext(supabase, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]), cached);
      if (controller.signal.aborted) return;
      cache.current = { scope, context };
      setState({ scope, context, loading: false, error: null });
    } catch {
      if (controller.signal.aborted) return;
      setState({ scope, context: null, loading: false, error: 'دریافت نسخهٔ معتبر کاتالوگ و سیاست تغذیه انجام نشد. دوباره تلاش کن.' });
    }
  }, [scope]);

  useEffect(() => {
    void fetchContext();
    const refresh = () => { if (document.visibilityState === 'visible') void fetchContext(false); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      request.current?.abort();
      cache.current = null;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchContext]);

  const current = state.scope === scope ? state.context : null;
  return {
    catalog: current?.catalog ?? null, policy: current?.policy ?? null, revision: current?.revision ?? null,
    loading: state.scope !== scope || state.loading, error: state.scope === scope ? state.error : null,
    refetch: fetchContext,
  };
}
