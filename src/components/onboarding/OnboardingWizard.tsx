import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { useEffect, useRef } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
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
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { estimateActivityLevel } from '@/utils/activityLevel';

interface OnboardingWizardProps {
  onComplete: () => void | Promise<void>;
}

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
  const {
    currentStep,
    data,
    isHydrated,
    hydratedUserId,
    isSubmitting,
    submitError,
    setSubmitting,
    setSubmitError,
    setProgressSaver,
    hydrateFromDraft,
    markHydratedEmpty,
  } = useOnboardingStore();
  const { user } = useAuth();
  const {
    profile,
    loading: profileLoading,
    upsertProfile,
    saveOnboardingProgress,
  } = useUserProfile(user?.id);

  // Inject the authenticated Supabase saver into the wizard store. Every
  // Step's existing `nextStep()` call now uses this saver BEFORE navigation.
  useEffect(() => {
    if (!user) {
      setProgressSaver(null);
      return;
    }

    setProgressSaver(saveOnboardingProgress);
    return () => setProgressSaver(null);
  }, [user, saveOnboardingProgress, setProgressSaver]);

  // Resume once per wizard mount. The database is the cross-device source of
  // truth: a user who committed Step N resumes at the stored next step.
  const checkedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (checkedUserIdRef.current === user.id) return;
    if (profileLoading) return;

    checkedUserIdRef.current = user.id;

    if (profile?.onboarding_draft_json && profile.onboarding_step > 1) {
      hydrateFromDraft(user.id, profile.onboarding_step, profile.onboarding_draft_json);
    } else {
      markHydratedEmpty(user.id);
    }
  }, [
    user,
    profile,
    profileLoading,
    hydrateFromDraft,
    markHydratedEmpty,
  ]);

  const handleComplete = async () => {
    if (!user || isSubmitting) return;

    setSubmitting(true);
    setSubmitError(null);

    const profilePayload: Partial<UserProfile> = {
      gender: data.gender,
      province: data.province,
      city: data.city,
      birth_date: data.birthDate || null,
      height: data.height,
      weight: data.weight,
      goal: data.goal,
      activity_level: data.activityLevel,
      activity_profile_json:
        data.activityLevel && data.dailyMovement && data.dailySteps
          ? {
              version: 1,
              dailyMovement: data.dailyMovement,
              dailySteps: data.dailySteps,
              workoutDuration: data.workoutLocation === 'none' ? null : data.workoutDuration,
              workoutIntensity: data.workoutLocation === 'none' ? null : data.workoutIntensity,
              derivedLevel: data.activityLevel,
              derivedScore: estimateActivityLevel({
                dailyMovement: data.dailyMovement,
                dailySteps: data.dailySteps,
                workoutDays: data.workoutDays,
                workoutDuration: data.workoutLocation === 'none' ? null : data.workoutDuration,
                workoutIntensity: data.workoutLocation === 'none' ? null : data.workoutIntensity,
                doesWorkout: data.workoutLocation !== 'none',
              }).score,
            }
          : null,
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
      body_fat_source: data.bodyScanResult ? 'ai_visual' : null,
      body_type: data.bodyScanResult?.bodyType ?? data.manualBodyType ?? null,
      subscription_tier: data.selectedTier,
      // Completion is committed atomically with clearing the resume draft.
      onboarding_step: 1,
      onboarding_draft_json: null,
      onboarding_completed: true,
    };

    try {
      await upsertProfile(profilePayload);
      // Keep completion locked until the root App has refreshed its own
      // authoritative profile snapshot.
      await onComplete();
      setSubmitting(false);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      setSubmitting(false);
      setSubmitError(
        'ذخیره نهایی اطلاعات انجام نشد. اطلاعات شما از بین نرفته؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.'
      );
    }
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

  const isReadyForCurrentUser = !!user && isHydrated && hydratedUserId === user.id;

  if (!isReadyForCurrentUser) {
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
    <div className="relative min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col">
      <ThemeToggle className="fixed right-4 top-4 z-50" />
      <div className="text-center py-6 border-b border-neutral-100 dark:border-neutral-800">
        <img src={APP_LOGO_PATH} alt={`لوگوی ${APP_NAME_FA}`} className="inline-block h-8 w-8 object-contain align-middle" />
        <span className="mr-2 font-bold text-lg text-neutral-800 dark:text-neutral-200">{APP_NAME_FA}</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-md mx-auto px-5 py-6">
          {submitError && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
            >
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className={isSubmitting ? 'pointer-events-none select-none opacity-70' : ''}>
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

          {isSubmitting && (
            <div
              className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-neutral-500 dark:text-neutral-400"
              aria-live="polite"
            >
              <Loader2 size={17} className="animate-spin" />
              <span>در حال ذخیره اطلاعات...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
