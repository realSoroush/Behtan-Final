import { JalaliBirthDate } from '@/components/ui/JalaliBirthDate';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OnboardingNumberField } from './OnboardingNumberField';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import {
  tryCalculateAge,
} from '@/utils/nutritionHelpers';

export function Step2Physical() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();

  // Never let a partially-entered or unsupported birth date throw during React render.
  const age = data.birthDate ? tryCalculateAge(data.birthDate) : null;
  const hasBirthDate = data.birthDate.length > 0;
  const isValidAge = age !== null;
  const isValidHeight = data.height !== null && data.height >= 100 && data.height <= 250;
  const isValidWeight = data.weight !== null && data.weight >= 30 && data.weight <= 300;

  const canContinue = isValidAge && isValidHeight && isValidWeight;

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="مشخصات جسمی"
        subtitle="این اطلاعات برای محاسبه دقیق نیاز کالری شما استفاده می‌شود."
        onBack={prevStep}
      />

      {/* Birth Date */}
      <div className="flex flex-col gap-1.5">
        <JalaliBirthDate
          value={data.birthDate}
          onChange={(birthDate) => updateData({ birthDate })}
          invalid={hasBirthDate && !isValidAge}
        />

        {isValidAge && (
          <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            سن شما: {age?.toLocaleString('fa-IR')} سال
          </p>
        )}

        {hasBirthDate && !isValidAge && (
          <p id="birth-date-error" role="alert" className="text-sm text-red-500">
            سن مجاز برای استفاده از به‌تن بین ۱۸ تا ۷۰ سال است.
          </p>
        )}
      </div>

      {/* Height */}
      <OnboardingNumberField
        label="قد" min={100} max={250}
        placeholder="مثال: ۱۷۵"
        value={data.height}
        onChange={(height) => updateData({ height })}
        suffix="سانتی‌متر"
        errorMessage="قد باید بین ۱۰۰ تا ۲۵۰ سانتی‌متر باشد."
      />

      {/* Weight */}
      <OnboardingNumberField
        label="وزن فعلی" min={30} max={300}
        placeholder="مثال: ۷۰"
        value={data.weight}
        onChange={(weight) => updateData({ weight })}
        suffix="کیلوگرم"
        errorMessage="وزن باید بین ۳۰ تا ۳۰۰ کیلوگرم باشد."
      />

      <div className="onboarding-actions"><Button onClick={nextStep} disabled={!canContinue}>
        ادامه
      </Button></div>
    </div>
  );
}
