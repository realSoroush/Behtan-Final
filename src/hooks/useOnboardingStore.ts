import { create } from 'zustand';
import { createEmptyOnboardingData } from '@/types';
import type { OnboardingData } from '@/types';

const TOTAL_STEPS = 11;

interface OnboardingState {
  currentStep: number;
  data: OnboardingData;
  isSubmitting: boolean;
  submitError: string | null;
  /**
   * True once we've checked whether a saved draft exists (either "yes,
   * hydrated from it" or "no, starting fresh"). The wizard waits for this
   * before rendering so it never flashes step 1 and then jumps to the
   * resumed step.
   */
  isHydrated: boolean;

  // Actions
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  updateData: (partial: Partial<OnboardingData>) => void;
  setSubmitting: (v: boolean) => void;
  setSubmitError: (msg: string | null) => void;
  /** Restore a previously in-progress wizard session (from Supabase). */
  hydrateFromDraft: (step: number, draft: OnboardingData) => void;
  /** Mark hydration as checked when there was no draft to restore. */
  markHydratedEmpty: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 1,
  data: createEmptyOnboardingData(),
  isSubmitting: false,
  submitError: null,
  isHydrated: false,

  nextStep: () =>
    set((s) => ({
      currentStep: Math.min(s.currentStep + 1, TOTAL_STEPS),
    })),

  prevStep: () =>
    set((s) => ({
      currentStep: Math.max(s.currentStep - 1, 1),
    })),

  goToStep: (step) =>
    set({ currentStep: Math.max(1, Math.min(step, TOTAL_STEPS)) }),

  updateData: (partial) =>
    set((s) => ({
      data: { ...s.data, ...partial },
    })),

  setSubmitting: (v) => set({ isSubmitting: v }),
  setSubmitError: (msg) => set({ submitError: msg }),

  hydrateFromDraft: (step, draft) =>
    set({
      currentStep: Math.max(1, Math.min(step, TOTAL_STEPS)),
      data: draft,
      isHydrated: true,
    }),

  markHydratedEmpty: () => set({ isHydrated: true }),

  reset: () =>
    set({
      currentStep: 1,
      data: createEmptyOnboardingData(),
      isSubmitting: false,
      submitError: null,
      isHydrated: false,
    }),
}));

export { TOTAL_STEPS };
