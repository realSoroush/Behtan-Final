import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { OnboardingData, UserProfile } from '@/types';

interface UseUserProfileReturn {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  upsertProfile: (data: Partial<UserProfile>) => Promise<void>;
  /**
   * Lightweight, silent autosave for onboarding-in-progress state.
   * Does NOT toggle `loading` or trigger a refetch — it's meant to be
   * called after every wizard step without causing UI flicker or
   * re-render churn. Failures are swallowed (best-effort autosave);
   * the wizard's local state is the source of truth during the session,
   * this is only a safety net for resuming after a closed tab.
   */
  saveOnboardingProgress: (step: number, draft: OnboardingData) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useUserProfile(userId: string | undefined): UseUserProfileReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    const { data, error: sbError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (sbError && sbError.code !== 'PGRST116') {
      // PGRST116 = no rows (first-time user, not an error)
      setError('خطا در دریافت اطلاعات پروفایل.');
    } else {
      setProfile(data ?? null);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const upsertProfile = async (partial: Partial<UserProfile>) => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    const { error: sbError } = await supabase
      .from('user_profiles')
      .upsert({ id: userId, ...partial }, { onConflict: 'id' });

    if (sbError) {
      setError('ذخیره اطلاعات با خطا مواجه شد.');
    } else {
      await fetch();
    }

    setLoading(false);
  };

  const saveOnboardingProgress = async (step: number, draft: OnboardingData) => {
    if (!userId) return;
    // Best-effort, silent — no loading state, no refetch, no error surfaced
    // to the UI. If this fails (e.g. offline for a moment), the wizard
    // keeps working from local state; the next successful step-save will
    // catch up. Resuming just falls back to step 1 in the worst case.
    try {
      await supabase
        .from('user_profiles')
        .upsert(
          { id: userId, onboarding_step: step, onboarding_draft_json: draft },
          { onConflict: 'id' }
        );
    } catch {
      // Swallowed intentionally — see comment above.
    }
  };

  return { profile, loading, error, upsertProfile, saveOnboardingProgress, refetch: fetch };
}
