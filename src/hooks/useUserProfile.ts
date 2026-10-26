import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { OnboardingData, UserProfile } from '@/types';
import { toPersistedOnboardingDraft } from '@/utils/bodyScanPrivacy';

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
  const requestSequence = useRef(0);
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
      requestSequence.current++;
      setProfile(null);
      setLoadedUserId(null);
      setFetching(false);
      return;
    }

    const sequence = ++requestSequence.current;
    setFetching(true); setError(null);
    try {
      const {data, error: sbError} = await supabase.from('user_profiles').select('*').eq('id', userId).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
      if (sequence !== requestSequence.current) return;
      if (sbError) setError('اطلاعات پروفایل دریافت نشد؛ دوباره تلاش کن.');
      else setProfile(data ?? null);
    } catch {
      if (sequence === requestSequence.current) setError('ارتباط با پروفایل برقرار نشد؛ دوباره تلاش کن.');
    } finally {
      if (sequence === requestSequence.current) {setLoadedUserId(userId);setFetching(false);}
    }
  }, [userId]);

  useEffect(() => {
    void fetch();
    const refresh=()=>void fetch();window.addEventListener('member-profile-changed',refresh);return()=>{requestSequence.current++;window.removeEventListener('member-profile-changed',refresh);};
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
          ...(draft.displayName?.trim() ? { display_name: draft.displayName.trim() } : {}),
          onboarding_step: step,
          // Raw body photos are volatile UI state and must never cross this
          // persistence boundary into user_profiles.
          onboarding_draft_json: toPersistedOnboardingDraft(draft),
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
