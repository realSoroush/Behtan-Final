import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { OnboardingData, UserProfile } from '@/types';

interface UseUserProfileReturn {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  /**
   * Upserts profile data and rejects when Supabase rejects the write.
   * Callers can therefore prevent navigation on failed persistence.
   */
  upsertProfile: (data: Partial<UserProfile>) => Promise<void>;
  /**
   * Saves a committed onboarding checkpoint. `step` is the NEXT step the
   * user should see when they resume on any device.
   */
  saveOnboardingProgress: (step: number, draft: OnboardingData) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useUserProfile(userId: string | undefined): UseUserProfileReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fetching, setFetching] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived instead of relying only on an effect-driven flag. When userId
  // changes, this becomes true on that very render, so consumers can never
  // mistake an as-yet-unfetched profile for "no saved profile".
  const loading = Boolean(userId) && (fetching || loadedUserId !== userId);

  const fetch = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoadedUserId(null);
      setFetching(false);
      return;
    }

    setFetching(true);
    setError(null);

    const { data, error: sbError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (sbError) {
      setError('خطا در دریافت اطلاعات پروفایل.');
    } else {
      setProfile(data ?? null);
    }

    setLoadedUserId(userId);
    setFetching(false);
  }, [userId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const upsertProfile = useCallback(async (partial: Partial<UserProfile>) => {
    if (!userId) {
      throw new Error('Cannot save profile without an authenticated user.');
    }

    setError(null);

    const { data, error: sbError } = await supabase
      .from('user_profiles')
      .upsert({ id: userId, ...partial }, { onConflict: 'id' })
      .select('*')
      .single();

    if (sbError) {
      setError('ذخیره اطلاعات با خطا مواجه شد.');
      throw sbError;
    }

    setProfile(data as UserProfile);
  }, [userId]);

  const saveOnboardingProgress = useCallback(async (
    step: number,
    draft: OnboardingData
  ) => {
    if (!userId) {
      throw new Error('Cannot save onboarding progress without an authenticated user.');
    }

    setError(null);

    const { error: sbError } = await supabase
      .from('user_profiles')
      .upsert(
        {
          id: userId,
          onboarding_step: step,
          onboarding_draft_json: draft,
          onboarding_completed: false,
        },
        { onConflict: 'id' }
      );

    if (sbError) {
      setError('ذخیره مرحله آنبوردینگ با خطا مواجه شد.');
      throw sbError;
    }
  }, [userId]);

  return {
    profile,
    loading,
    error,
    upsertProfile,
    saveOnboardingProgress,
    refetch: fetch,
  };
}
