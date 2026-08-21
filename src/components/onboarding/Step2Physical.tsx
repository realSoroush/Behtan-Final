import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import { calculateAge } from '@/utils/nutritionHelpers';

export function Step2Physical() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();

  const age = data.birthDate ? calculateAge(data.birthDate) : null;

  const isValidAge = age !== null && age >= 10 && age <= 90;
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
        <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          تاریخ تولد
        </label>
        <input
          type="date"
          value={data.birthDate}
          onChange={(e) => updateData({ birthDate: e.target.value })}
          max={new Date().toISOString().slice(0, 10)}
          className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl py-3.5 px-4 outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          dir="ltr"
        />
        {age !== null && isValidAge && (
          <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            سن شما: {age} سال
          </p>
        )}
        {age !== null && !isValidAge && (
          <p className="text-sm text-red-500">سن باید بین ۱۰ تا ۹۰ سال باشد.</p>
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
