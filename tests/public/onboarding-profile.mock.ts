// Dev-only fixture. Let Vite transform React imports just as it does for the app.
import { useCallback, useState } from 'react';
import { toPersistedOnboardingDraft } from '../../src/utils/bodyScanPrivacy';
import type { OnboardingData } from '../../src/types';

export function useUserProfile() {
  const [profile] = useState(() => JSON.parse(localStorage.getItem('onboarding-test-profile') || 'null'));
  const [error, setError] = useState(() => localStorage.getItem('onboarding-test-load-error') ? 'failed' : null);
  const saveOnboardingProgress = useCallback(async (step: number, draft: OnboardingData) => {
    if (localStorage.getItem('onboarding-test-save-error')) throw Error('offline');
    localStorage.setItem('onboarding-test-profile', JSON.stringify({
      onboarding_step: step,
      onboarding_draft_json: toPersistedOnboardingDraft(draft),
    }));
  }, []);
  const refetch = useCallback(async () => {
    localStorage.removeItem('onboarding-test-load-error');
    setError(null);
  }, []);
  return { profile, loading: false, error, saveOnboardingProgress, refetch, upsertProfile: async () => {} };
}
