import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/hooks/useAuth';
import { Step1Gender } from './Step1Gender';
import { Step2Physical } from './Step2Physical';
import { Step3Goal } from './Step3Goal';
import { Step4Activity } from './Step4Activity';
import { Step5Schedule } from './Step5Schedule';
import { Step6Medical } from './Step6Medical';
import { Step7Dietary } from './Step7Dietary';
import { Step8Speed } from './Step8Speed';
import { Step9BodyScan } from './Step9BodyScan';
import { Step10Analysis } from './Step10Analysis';
import { Step11Paywall } from './Step11Paywall';
import type { UserProfile } from '@/types';

interface OnboardingWizardProps {
  onComplete: () => void;
}

// RTL-aware slide transition — next step slides from left (RTL natural direction)
const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction > 0 ? '-60px' : '60px',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? '60px' : '-60px',
    opacity: 0,
  }),
};

const TRANSITION = {
  type: 'spring' as const,
  stiffness: 350,
  damping: 35,
  mass: 0.8,
};

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { currentStep, data, isHydrated, hydrateFromDraft, markHydratedEmpty } = useOnboardingStore();
  const { user } = useAuth();
  const { profile, loading: profileLoading, upsertProfile, saveOnboardingProgress } = useUserProfile(user?.id);

  // ── Resume: on first mount, check for a saved draft and hydrate from it ──
  // Guards against re-hydrating on every profile refetch (e.g. after the
  // final upsertProfile call) — only ever runs once per wizard mount.
  const hasCheckedDraftRef = useRef(false);

  useEffect(() => {
    if (hasCheckedDraftRef.current) return;
    if (!user) return;
    // Wait for the profile fetch to settle before deciding — otherwise we'd
    // briefly render step 1 and then jump, which is exactly what we want
    // to avoid.
    if (profile === null && profileLoading) return;

    hasCheckedDraftRef.current = true;

    if (profile?.onboarding_draft_json && profile.onboarding_step > 1) {
      hydrateFromDraft(profile.onboarding_step, profile.onboarding_draft_json);
    } else {
      markHydratedEmpty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, profileLoading]);

  // ── Autosave: after every step change, silently push progress to Supabase ──
  // Skipped until hydration has resolved, so we never overwrite a real
  // saved draft with the fresh empty store before we've had a chance to
  // read it back.
  useEffect(() => {
    if (!isHydrated || !user) return;
    saveOnboardingProgress(currentStep, data);
    // Intentionally only re-runs when the step changes (not on every
    // keystroke inside a step) — each step component already commits its
    // fields to the store via updateData, so by the time currentStep
    // changes, `data` already reflects that step's answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isHydrated, user]);

  const handleComplete = async () => {
    if (!user) { onComplete(); return; }

    const profilePayload: Partial<UserProfile> = {
      gender: data.gender,
      province: data.province,
      city: data.city,
      birth_date: data.birthDate || null,
      height: data.height,
      weight: data.weight,
      goal: data.goal,
      activity_level: data.activityLevel,
      workout_location: data.workoutLocation,
      workout_days: data.workoutDays,
      motivation: data.motivation,
      schedule_json: data.schedule,
      medical_conditions_json: {
        conditions: data.medicalConditions,
        injuries: data.injuries,
        medications: data.medications,
      },
      dietary_preferences_json: {
        vegetarianStatus: data.vegetarianStatus,
        allergies: data.allergies,
      },
      weight_loss_speed: data.weightLossSpeed,
      body_fat_pct: data.bodyScanResult?.bodyFatPct ?? null,
      body_type: data.bodyScanResult?.bodyType ?? data.manualBodyType ?? null,
      subscription_tier: data.selectedTier,
      // Onboarding is done — clear the draft so a stale resume never fires again.
      onboarding_step: 1,
      onboarding_draft_json: null,
    };

    await upsertProfile(profilePayload);
    onComplete();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:  return <Step1Gender />;
      case 2:  return <Step2Physical />;
      case 3:  return <Step3Goal />;
      case 4:  return <Step4Activity />;
      case 5:  return <Step5Schedule />;
      case 6:  return <Step6Medical />;
      case 7:  return <Step7Dietary />;
      case 8:  return <Step8Speed />;
      case 9:  return <Step9BodyScan />;
      case 10: return <Step10Analysis />;
      case 11: return <Step11Paywall onComplete={handleComplete} />;
      default: return null;
    }
  };

  // Wait for the resume-check to resolve before rendering any step, so the
  // user never sees a flash of step 1 before jumping to their real step.
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">در حال بازیابی اطلاعات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col">
      {/* Brand header */}
      <div className="text-center py-6 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-2xl">🥗</span>
        <span className="mr-2 font-bold text-lg text-neutral-800 dark:text-neutral-200">سلامتی من</span>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-md mx-auto px-5 py-6">
          <AnimatePresence mode="wait" custom={currentStep}>
            <motion.div
              key={currentStep}
              custom={currentStep}
              variants={SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={TRANSITION}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
