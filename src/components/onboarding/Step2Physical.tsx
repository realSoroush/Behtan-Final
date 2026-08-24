import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import {
  MAX_SUPPORTED_AGE,
  MIN_SUPPORTED_AGE,
  tryCalculateAge,
} from '@/utils/nutritionHelpers';

function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * For an inclusive 18–70 age range:
 * - latest allowed birthday = today minus 18 years
 * - earliest allowed birthday = day after today minus 71 years
 */
function getAllowedBirthDateRange(referenceDate: Date = new Date()) {
  const maxDate = new Date(
    referenceDate.getFullYear() - MIN_SUPPORTED_AGE,
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  const minDate = new Date(
    referenceDate.getFullYear() - (MAX_SUPPORTED_AGE + 1),
    referenceDate.getMonth(),
    referenceDate.getDate() + 1
  );

  return {
    min: formatLocalIsoDate(minDate),
    max: formatLocalIsoDate(maxDate),
  };
}

export function Step2Physical() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();

  // Never let a partially-entered or unsupported birth date throw during React render.
  const age = data.birthDate ? tryCalculateAge(data.birthDate) : null;
  const hasBirthDate = data.birthDate.length > 0;
  const isValidAge = age !== null;
  const isValidHeight = data.height !== null && data.height >= 100 && data.height <= 250;
  const isValidWeight = data.weight !== null && data.weight >= 30 && data.weight <= 300;
  const { min: minBirthDate, max: maxBirthDate } = getAllowedBirthDateRange();

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
        <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          تاریخ تولد
        </label>
        <input
          type="date"
          value={data.birthDate}
          onChange={(e) => updateData({ birthDate: e.target.value })}
          min={minBirthDate}
          max={maxBirthDate}
          aria-invalid={hasBirthDate && !isValidAge}
          aria-describedby={hasBirthDate && !isValidAge ? 'birth-date-error' : undefined}
          className={`w-full bg-neutral-50 dark:bg-neutral-800 border rounded-2xl py-3.5 px-4 outline-none focus:ring-2 focus:border-transparent transition-all ${
            hasBirthDate && !isValidAge
              ? 'border-red-400 focus:ring-red-400/30 dark:border-red-500'
              : 'border-neutral-200 dark:border-neutral-700 focus:ring-primary-500'
          }`}
          dir="ltr"
        />

        {isValidAge && (
          <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            سن شما: {age} سال
          </p>
        )}

        {hasBirthDate && !isValidAge && (
          <p id="birth-date-error" role="alert" className="text-sm text-red-500">
            سن مجاز برای استفاده از به‌تن بین ۱۸ تا ۷۰ سال است.
          </p>
        )}
      </div>

      {/* Height */}
      <Input
        label="قد (سانتی‌متر)"
        type="number"
        inputMode="numeric"
        placeholder="مثال: ۱۷۵"
        value={data.height ?? ''}
        onChange={(e) => updateData({ height: e.target.value ? Number(e.target.value) : null })}
        suffix="cm"
        error={data.height !== null && !isValidHeight ? 'قد باید بین ۱۰۰ تا ۲۵۰ سانتی‌متر باشد.' : undefined}
      />

      {/* Weight */}
      <Input
        label="وزن فعلی (کیلوگرم)"
        type="number"
        inputMode="decimal"
        placeholder="مثال: ۷۰"
        value={data.weight ?? ''}
        onChange={(e) => updateData({ weight: e.target.value ? Number(e.target.value) : null })}
        suffix="kg"
        error={data.weight !== null && !isValidWeight ? 'وزن باید بین ۳۰ تا ۳۰۰ کیلوگرم باشد.' : undefined}
      />

      <Button onClick={nextStep} disabled={!canContinue}>
        ادامه
      </Button>
    </div>
  );
}
