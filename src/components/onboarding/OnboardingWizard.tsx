import {track} from '@/member/analytics';
import { CompanionCard } from '@/components/companion/CompanionCard';
import { getOnboardingCompanion } from '@/components/companion/companionState';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/hooks/useAuth';
import { Step1Gender } from './Step1Gender';
import { Step2Physical } from './Step2Physical';
import { Step3Goal } from './Step3Goal';
import { Step4Activity } from './Step4Activity';
import { Step5Workout } from './Step5Workout';
import { Step6Medical } from './Step6Medical';
import { Step7Dietary } from './Step7Dietary';
import { Step9BodyScan } from './Step9BodyScan';
import { Step10Analysis } from './Step10Analysis';
import { Step11Paywall } from './Step11Paywall';
import type { SubscriptionPlan, UserProfile } from '@/types';
import { startCheckout } from '@/lib/payments';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ONBOARDING_PHASES, onboardingPhase, onboardingDirection } from '@/utils/onboardingExperience';
import './onboarding.css';
import { estimateActivityLevel } from '@/utils/activityLevel';
import { resolveActivityResumeStep } from '@/utils/onboardingActivity';
import {
  evaluateOnboardingMedicalEligibility,
  MEDICAL_SAFETY_SCREENING_VERSION,
} from '@/utils/medicalEligibility';
import {
  buildBodyScanConsentRecord,
  resolveBodyScanResumeStep,
} from '@/utils/bodyScanPrivacy';

interface OnboardingWizardProps {
  onComplete: () => void | Promise<void>;
}

const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction > 0 ? '-22px' : '22px',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? '22px' : '-22px',
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
    goToStep,
  } = useOnboardingStore();
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(()=>{if(userId)track('onboarding_step',{step:currentStep});},[userId,currentStep]);
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
    upsertProfile,
    saveOnboardingProgress,
  } = useUserProfile(user?.id);

  // Inject the authenticated Supabase saver into the wizard store. Every
  // Step's existing `nextStep()` call now uses this saver BEFORE navigation.
  // Auth refreshes can return a new object for the same account. Keep this
  // connection tied to identity so store renders cannot repeatedly reattach it.
  useEffect(() => {
    if (!userId) {
      setProgressSaver(null);
      return;
    }

    setProgressSaver(saveOnboardingProgress);
    return () => setProgressSaver(null);
  }, [userId, saveOnboardingProgress, setProgressSaver]);

  // Resume once per wizard mount. The database is the cross-device source of
  // truth: a user who committed Step N resumes at the stored next step.
  const checkedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (checkedUserIdRef.current === userId) return;
    if (profileLoading) return;
    if (profileError) return;

    checkedUserIdRef.current = userId;

    if (profile?.onboarding_draft_json && profile.onboarding_step > 1) {
      const draftNeedsSafetyReview = profile.onboarding_step > 6 && (
        profile.onboarding_draft_json.safetyScreeningVersion !== MEDICAL_SAFETY_SCREENING_VERSION
        || profile.onboarding_draft_json.safetyAnswersConfirmed !== true
      );
      hydrateFromDraft(
        userId,
        draftNeedsSafetyReview
          ? 6
          : resolveBodyScanResumeStep(profile.onboarding_step, profile.onboarding_draft_json),
        profile.onboarding_draft_json
      );
    } else {
      markHydratedEmpty(userId);
    }
  }, [
    userId,
    profile,
    profileLoading,
    profileError,
    hydrateFromDraft,
    markHydratedEmpty,
  ]);

  const handleComplete = async (planCode: string | null, plan?: SubscriptionPlan) => {
    if (!user || isSubmitting || !plan) return;

    const activityStep = resolveActivityResumeStep(11, data);
    if (activityStep < 6) {
      goToStep(activityStep);
      setSubmitError('برای ادامه، پاسخ‌های تحرک روزانه و ورزش را کامل کنید.');
      return;
    }

    // Defense in depth: never let a stale route, old draft or direct Step 11
    // interaction bypass the medical gate.
    const medicalEligibility = evaluateOnboardingMedicalEligibility(data);
    if (!medicalEligibility.canGenerateAutomaticPlan) {
      goToStep(6);
      setSubmitError(
        medicalEligibility.status === 'needs_screening'
          ? 'برای ادامه، ارزیابی ایمنی پزشکی را کامل و پاسخ‌ها را تأیید کنید.'
          : 'با اطلاعات پزشکی ثبت‌شده، به‌تن نمی‌تواند برنامه عمومی خودکار صادر کند.'
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const profilePayload: Partial<UserProfile> = {
      ...(data.displayName?.trim() ? { display_name: data.displayName.trim() } : {}),
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
              version: 2,
              dailyMovement: data.dailyMovement,
              dailySteps: data.dailySteps,
              workoutDuration: data.workoutLocation === 'none' ? null : data.workoutDuration,
              workoutIntensity: data.workoutLocation === 'none' ? null : data.workoutIntensity,
              trainingType: data.workoutLocation === 'none' ? null : data.trainingType,
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
      // Motivation and schedule are paused. Do not persist unasked defaults or overwrite legacy answers.
      medical_conditions_json: {
        conditions: data.medicalConditions,
        injuries: data.injuries,
        medications: data.medications,
        pregnancyStatus: data.gender === 'male' ? 'not_applicable' : data.pregnancyStatus,
        eatingDisorderStatus: data.eatingDisorderStatus,
        safetyScreeningVersion: data.safetyScreeningVersion,
        safetyAnswersConfirmed: data.safetyAnswersConfirmed,
      },
      dietary_preferences_json: {
        vegetarianStatus: data.vegetarianStatus,
        allergies: data.allergies,
      },
      protein_budget_preference: data.proteinBudgetPreference,
      weight_loss_speed: 'standard',
      body_fat_pct: data.bodyScanResult?.bodyFatPct ?? null,
      body_fat_source: data.bodyScanResult ? 'ai_visual' : null,
      body_scan_consent_json: buildBodyScanConsentRecord(data),
      body_type: data.bodyScanResult?.bodyType ?? data.manualBodyType ?? null,
      // Catalog selection only; verified payment entitlements are a separate step.
      subscription_tier: planCode,
      // Completion is committed atomically with clearing the resume draft.
      onboarding_step: 1,
      onboarding_draft_json: null,
      onboarding_completed: true,
    };

    try {
      await upsertProfile(profilePayload);
      track('onboarding_complete');await startCheckout(plan);
      // Keep completion locked until the root App has refreshed its own
      // authoritative profile snapshot.
      await onComplete();
      setSubmitting(false);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      setSubmitting(false);
      setSubmitError(
        error instanceof Error ? error.message : 'تکمیل اشتراک انجام نشد. اطلاعات شما محفوظ است؛ دوباره تلاش کنید.'
      );
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:  return <Step1Gender />;
      case 2:  return <Step2Physical />;
      case 3:  return <Step3Goal />;
      case 4:  return <Step4Activity />;
      case 5:  return <Step5Workout />;
      case 6:  return <Step6Medical />;
      case 7:  return <Step7Dietary />;
      case 9:  return <Step9BodyScan />;
      case 10: return <Step10Analysis />;
      case 11: return <Step11Paywall onComplete={handleComplete} />;
      default: return null;
    }
  };

  const reduced=useReducedMotion();
  const [navigation,setNavigation]=useState({step:currentStep,direction:1});
  if(navigation.step!==currentStep)setNavigation({step:currentStep,direction:onboardingDirection(navigation.step,currentStep)});
  const phase=onboardingPhase(currentStep);
  const companionMessage = getOnboardingCompanion(currentStep);
  const [companionFocus, setCompanionFocus] = useState<{step: number; nonce: number} | null>(null);

  const isReadyForCurrentUser = !!user && checkedUserIdRef.current === user.id && isHydrated && hydratedUserId === user.id;

  if (!isReadyForCurrentUser) {
    if(profileError)return <div className="onboarding-app onboarding-loading" role="alert"><AlertCircle size={28}/><p>اطلاعات قبلی‌ات دریافت نشد.</p><p>اتصال را بررسی کن و دوباره تلاش کن.</p><button type="button" className="onboarding-retry" onClick={()=>void refetchProfile()}>تلاش دوباره</button></div>;
    return <div className="onboarding-app onboarding-loading" role="status"><Loader2 size={28} className="animate-spin"/><p>در حال بازیابی اطلاعاتت…</p></div>;
  }

  return <div className="onboarding-app" dir="rtl">
    <header className="onboarding-topbar"><div>
      <a className="onboarding-brand" href="/" aria-label="صفحهٔ اصلی به‌تن"><img src={APP_LOGO_PATH} alt=""/><strong>{APP_NAME_FA}</strong></a>
      <span className="onboarding-topbar-label">برنامهٔ غذایی، به سبک زندگی تو</span>
      <ThemeToggle/>
    </div></header>
    <div className="onboarding-layout">
      <aside className="onboarding-guide">
        <div className="onboarding-intro"><span className="onboarding-eyebrow">قدم‌به‌قدم، با هم</span><h2>برنامه‌ای که<br/>به تو می‌آید.</h2><p>از خودت بگو تا غذاها با هدف و روزمره‌ات هماهنگ باشند.</p></div>
        {companionMessage&&<CompanionCard message={isSubmitting?{mood:'thinking',title:'داریم اطلاعاتت را ذخیره می‌کنیم.',body:'تا پایان ذخیره‌سازی همین‌جا بمان.'}:companionFocus?.step===currentStep&&currentStep!==6?{...companionMessage,mood:'listening'}:companionMessage} reactionKey={`${currentStep}:${companionFocus?.nonce??0}`}/>}
        <ol className="onboarding-phases" aria-label="بخش‌های ساخت برنامه">{ONBOARDING_PHASES.map((label,index)=><li key={label} className={index===phase?'is-current':index<phase?'is-complete':''} aria-current={index===phase?'step':undefined}><span>{index<phase?<Check size={14}/>:String(index+1).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])}</span><div>{label}<small>{index===phase?'در این بخش هستی':index<phase?'این بخش را پشت سر گذاشتی':'در ادامه'}</small></div></li>)}</ol>
        <p className="onboarding-save-note"><ShieldCheck size={16}/>هر مرحله پس از زدن «ادامه» ذخیره می‌شود.</p>
      </aside>
      <main className="onboarding-panel" aria-label="ساخت برنامهٔ غذایی">
        {submitError&&<div role="alert" className="onboarding-error"><AlertCircle size={19}/><span>{submitError}</span></div>}
        <fieldset className="onboarding-step-fields" disabled={isSubmitting} aria-busy={isSubmitting} onFocusCapture={event=>{if((event.target as HTMLElement).matches('input, select, textarea'))setCompanionFocus({step:currentStep,nonce:Date.now()});}}>
          <AnimatePresence mode="wait" custom={navigation.direction}>
            <motion.div key={currentStep} className="onboarding-step-content" data-step={currentStep} custom={navigation.direction} variants={SLIDE_VARIANTS} initial={reduced?false:'enter'} animate="center" exit={reduced?undefined:'exit'} transition={reduced?{duration:0}:TRANSITION}
              onAnimationStart={definition=>{if(definition==='center')window.scrollTo({top:0,behavior:'instant'});}}
              onAnimationComplete={definition=>{if(definition==='center'){const heading=document.getElementById('onboarding-step-title');if(!heading?.closest('.onboarding-step-content')?.contains(document.activeElement))heading?.focus({preventScroll:true});}}}>
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </fieldset>
        {isSubmitting&&<div className="onboarding-saving" role="status"><Loader2 size={16} className="animate-spin"/><span>در حال ذخیرهٔ اطلاعات…</span></div>}
      </main>
    </div>
    <footer className="onboarding-footer">به‌تن همراه توست؛ هر پاسخ، یک قدم به برنامهٔ مناسب‌تر.</footer>
  </div>;
}
