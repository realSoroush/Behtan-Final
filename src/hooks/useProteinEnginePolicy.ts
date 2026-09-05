import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { ProteinEnginePolicy } from '@/types';
import {
  buildProteinEnginePolicy,
  type ProteinEnginePolicyRow,
} from '@/utils/proteinPolicy';

interface UseProteinEnginePolicyReturn {
  policy: ProteinEnginePolicy | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Loads the singleton Protein Engine policy from Supabase.
 * Production calculations wait for this row instead of silently using hardcoded
 * values, so Table Editor changes become effective after a page refresh/refetch.
 */
export function useProteinEnginePolicy(): UseProteinEnginePolicyReturn {
  const [policy, setPolicy] = useState<ProteinEnginePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPolicy = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: sbError } = await supabase
      .from('nutrition_protein_policy')
      .select('*')
      .eq('id', 'default')
      .single();

    if (sbError) {
      console.error('[useProteinEnginePolicy] Supabase policy fetch failed:', sbError);
      setPolicy(null);
      setError('دریافت تنظیمات موتور پروتئین با خطا مواجه شد. دوباره تلاش کنید.');
      setLoading(false);
      return;
    }

    try {
      setPolicy(buildProteinEnginePolicy(data as ProteinEnginePolicyRow));
    } catch (policyError) {
      console.error('[useProteinEnginePolicy] Invalid policy row:', policyError);
      setPolicy(null);
      setError(
        policyError instanceof Error
          ? `تنظیمات موتور پروتئین نامعتبر است: ${policyError.message}`
          : 'تنظیمات موتور پروتئین نامعتبر است.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPolicy();
  }, [fetchPolicy]);

  return { policy, loading, error, refetch: fetchPolicy };
}
