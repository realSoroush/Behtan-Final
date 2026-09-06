import { useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import { MedicalSafetyForm, type MedicalSafetyFormValue } from '@/components/safety/MedicalSafetyForm';
import {
  evaluateOnboardingMedicalEligibility,
  resolveSafeWeightLossSpeed,
} from '@/utils/medicalEligibility';

export function Step6Medical() {
  const {
    data,
    updateData,
    nextStep,
    saveCurrentStep,
    prevStep,
    currentStep,
    isSubmitting,
  } = useOnboardingStore();
  const [savedBlockedAnswers, setSavedBlockedAnswers] = useState(false);

  const eligibility = useMemo(() => evaluateOnboardingMedicalEligibility(data), [data]);
  const pregnancyAnswered = data.gender === 'male' || (
    data.pregnancyStatus === 'not_pregnant'
    || data.pregnancyStatus === 'pregnant'
    || data.pregnancyStatus === 'breastfeeding'
  );
  const questionnaireComplete = Boolean(
    data.gender
    && pregnancyAnswered
    && data.eatingDisorderStatus
    && data.safetyAnswersConfirmed
  );
  const isBlocked = questionnaireComplete && eligibility.status === 'blocked';

  const handleChange = (patch: Partial<MedicalSafetyFormValue>) => {
    setSavedBlockedAnswers(false);
    updateData(patch);
  };

  const handleContinue = async () => {
    if (!eligibility.fastWeightLossAllowed && data.weightLossSpeed === 'fast') {
      updateData({ weightLossSpeed: resolveSafeWeightLossSpeed(data.weightLossSpeed, eligibility) });
    }
    await nextStep();
  };

  const handleSaveBlockedAnswers = async () => {
    const saved = await saveCurrentStep();
    setSavedBlockedAnswers(saved);
  };

  if (!data.gender) return null;

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="ارزیابی ایمنی پزشکی"
        subtitle="پاسخ‌ها مشخص می‌کنند آیا ساخت برنامه غذایی خودکار برای شما مناسب است یا به بررسی متخصص نیاز دارد."
        onBack={prevStep}
      />

      <MedicalSafetyForm gender={data.gender} value={data} onChange={handleChange} />

      {isBlocked && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <ShieldAlert size={22} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="space-y-3">
              <div>
                <p className="font-bold text-red-800 dark:text-red-200">برنامه خودکار برای شما صادر نمی‌شود</p>
                <p className="mt-1 text-sm leading-6 text-red-700 dark:text-red-300">
                  این نتیجه تشخیص پزشکی نیست؛ یعنی نسخه فعلی به‌تن برای شرایط ثبت‌شده شما شخصی‌سازی کافی ندارد.
                </p>
              </div>
              <ul className="space-y-2">
                {eligibility.blockers.map((blocker) => (
                  <li key={blocker.code} className="text-sm leading-6 text-red-700 dark:text-red-300">
                    <strong>{blocker.title}:</strong> {blocker.detail}
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-6 text-red-800 dark:text-red-200">
                برای دریافت برنامه، اطلاعات و داروهای خود را با پزشک یا متخصص تغذیه دارای صلاحیت بررسی کنید.
              </p>
            </div>
          </div>
        </div>
      )}

      {!isBlocked && eligibility.cautions.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200">برنامه با محدودیت ایمنی ساخته می‌شود</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-700 dark:text-amber-300">
                {eligibility.cautions.map((caution) => <li key={caution.code}>• {caution.detail}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {isBlocked ? (
        <div className="space-y-2">
          <Button variant="secondary" onClick={handleSaveBlockedAnswers} loading={isSubmitting}>
            ذخیره پاسخ‌ها
          </Button>
          {savedBlockedAnswers && (
            <p role="status" className="text-center text-sm text-green-600 dark:text-green-400">پاسخ‌ها با موفقیت ذخیره شدند.</p>
          )}
        </div>
      ) : (
        <Button
          onClick={handleContinue}
          disabled={!questionnaireComplete || !eligibility.canGenerateAutomaticPlan}
          loading={isSubmitting}
        >
          ادامه
        </Button>
      )}
    </div>
  );
}
