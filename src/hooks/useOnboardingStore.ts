import { create } from 'zustand';
import { createEmptyOnboardingData } from '@/types';
import type { OnboardingData } from '@/types';
import { persistOnboardingBeforeAdvance } from '@/utils/onboardingProgress';

const TOTAL_STEPS = 11;

type ProgressSaver = (nextStep: number, draft: OnboardingData) => Promise<void>;

interface OnboardingState {
  currentStep: number;
  data: OnboardingData;
  isSubmitting: boolean;
  submitError: string | null;
  isHydrated: boolean;
  hydratedUserId: string | null;
  progressSaver: ProgressSaver | null;

  /**
   * Persist the completed step first, then move forward.
   * Returns true only when the server save succeeded.
   */
  nextStep: () => Promise<boolean>;
  /** Persist the current draft without navigating (used by medical hard-stop). */
  saveCurrentStep: () => Promise<boolean>;
  prevStep: () => void;
  goToStep: (step: number) => void;
  updateData: (partial: Partial<OnboardingData>) => void;
  setSubmitting: (value: boolean) => void;
  setSubmitError: (message: string | null) => void;
  setProgressSaver: (saver: ProgressSaver | null) => void;
  hydrateFromDraft: (userId: string, step: number, draft: OnboardingData) => void;
  markHydratedEmpty: (userId: string) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  currentStep: 1,
  data: createEmptyOnboardingData(),
  isSubmitting: false,
  submitError: null,
  isHydrated: false,
  hydratedUserId: null,
  progressSaver: null,

  nextStep: async () => {
    const state = get();

    if (state.isSubmitting) return false;

    if (state.currentStep >= TOTAL_STEPS) return false;

    if (!state.progressSaver) {
      set({
        submitError: 'اتصال ذخیره‌سازی آماده نیست. لطفاً چند لحظه دیگر دوباره تلاش کنید.',
      });
      return false;
    }

    set({ isSubmitting: true, submitError: null });

    try {
      // Read the newest state again here. Zustand updates are synchronous, so
      // this captures the latest field values even when the user just edited
      // something immediately before pressing "Next".
      const latest = get();
      const persistedNextStep = await persistOnboardingBeforeAdvance({
        currentStep: latest.currentStep,
        totalSteps: TOTAL_STEPS,
        draft: latest.data,
        save: latest.progressSaver!,
      });

      set({
        currentStep: persistedNextStep,
        isSubmitting: false,
        submitError: null,
      });
      return true;
    } catch (error) {
      console.error('Failed to save onboarding progress:', error);
      set({
        isSubmitting: false,
        submitError: 'ذخیره اطلاعات انجام نشد. اتصال اینترنت را بررسی کنید و دوباره «ادامه» را بزنید.',
      });
      return false;
    }
  },

  saveCurrentStep: async () => {
    const state = get();
    if (state.isSubmitting) return false;
    if (!state.progressSaver) {
      set({ submitError: 'اتصال ذخیره‌سازی آماده نیست. لطفاً چند لحظه دیگر دوباره تلاش کنید.' });
      return false;
    }

    set({ isSubmitting: true, submitError: null });
    try {
      const latest = get();
      await latest.progressSaver!(latest.currentStep, latest.data);
      set({ isSubmitting: false, submitError: null });
      return true;
    } catch (error) {
      console.error('Failed to save current onboarding step:', error);
      set({
        isSubmitting: false,
        submitError: 'ذخیره اطلاعات انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
      });
      return false;
    }
  },

  prevStep: () => {
    if (get().isSubmitting) return;
    set((state) => ({
      currentStep: Math.max(state.currentStep - 1, 1),
      submitError: null,
    }));
  },

  goToStep: (step) => {
    if (get().isSubmitting) return;
    set({
      currentStep: Math.max(1, Math.min(step, TOTAL_STEPS)),
      submitError: null,
    });
  },

  updateData: (partial) =>
    set((state) => ({
      data: { ...state.data, ...partial },
      // Once the user changes an answer after a failed save, remove the old
      // banner. A later Next press will perform a fresh server save.
      submitError: null,
    })),

  setSubmitting: (value) => set({ isSubmitting: value }),
  setSubmitError: (message) => set({ submitError: message }),
  setProgressSaver: (saver) => set({ progressSaver: saver }),

  hydrateFromDraft: (userId, step, draft) =>
    set({
      currentStep: Math.max(1, Math.min(step, TOTAL_STEPS)),
      // Merge with defaults so an older saved draft remains compatible when a
      // new onboarding field is introduced in a future release.
      data: { ...createEmptyOnboardingData(), ...draft },
      isHydrated: true,
      hydratedUserId: userId,
      submitError: null,
    }),

  markHydratedEmpty: (userId) =>
    set({
      currentStep: 1,
      data: createEmptyOnboardingData(),
      isHydrated: true,
      hydratedUserId: userId,
      submitError: null,
    }),

  reset: () =>
    set({
      currentStep: 1,
      data: createEmptyOnboardingData(),
      isSubmitting: false,
      submitError: null,
      isHydrated: false,
      hydratedUserId: null,
      // Keep the injected saver while the wizard is still mounted. The wizard
      // removes it explicitly on unmount.
      progressSaver: get().progressSaver,
    }),
}));

export { TOTAL_STEPS };
