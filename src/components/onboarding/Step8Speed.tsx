import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { WeightLossSpeed } from '@/types';
import { WEIGHT_LOSS_SPEED_POLICY, toPersianDigits } from '@/utils/nutritionHelpers';
import { evaluateOnboardingMedicalEligibility } from '@/utils/medicalEligibility';

interface SpeedOption {
  value: WeightLossSpeed;
  icon: string;
  label: string;
  range: string;
  deficit: string;
  color: string;
  safe: boolean;
}

const formatPercent = (value: number) => toPersianDigits(Math.round(value * 100));
const formatKcal = (value: number) => toPersianDigits(value);

const SPEEDS: SpeedOption[] = [
  {
    value: 'mild',
    icon: '🐢',
    label: 'ملایم',
    range: 'آهسته و پایدار',
    deficit: `کسری ${formatPercent(WEIGHT_LOSS_SPEED_POLICY.mild.percentage)}٪ از کالری نگهدارنده، حداکثر ${formatKcal(WEIGHT_LOSS_SPEED_POLICY.mild.maxAbsoluteKcal)} کالری`,
    color: 'text-green-600',
    safe: true,
  },
  {
    value: 'standard',
    icon: '🚀',
    label: 'استاندارد',
    range: 'متعادل',
    deficit: `کسری ${formatPercent(WEIGHT_LOSS_SPEED_POLICY.standard.percentage)}٪ از کالری نگهدارنده، حداکثر ${formatKcal(WEIGHT_LOSS_SPEED_POLICY.standard.maxAbsoluteKcal)} کالری`,
    color: 'text-yellow-600',
    safe: true,
  },
  {
    value: 'fast',
    icon: '⚡',
    label: 'سریع',
    range: 'تهاجمی‌تر',
    deficit: `کسری ${formatPercent(WEIGHT_LOSS_SPEED_POLICY.fast.percentage)}٪ از کالری نگهدارنده، حداکثر ${formatKcal(WEIGHT_LOSS_SPEED_POLICY.fast.maxAbsoluteKcal)} کالری`,
    color: 'text-red-500',
    safe: false,
  },
];

export function Step8Speed() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();
  const medicalEligibility = evaluateOnboardingMedicalEligibility(data);
  const fastRestricted = !medicalEligibility.fastWeightLossAllowed;

  useEffect(() => {
    if (fastRestricted && data.weightLossSpeed === 'fast') {
      updateData({ weightLossSpeed: 'standard' });
    }
  }, [data.weightLossSpeed, fastRestricted, updateData]);

  // If not a weight loss goal, skip this step automatically
  const isWeightLoss = data.goal === 'weight_loss';

  if (!isWeightLoss) {
    // Non-loss goals auto-continue; this step is still shown for maintenance info
    return (
      <div className="space-y-6">
        <StepHeader
          step={currentStep}
          title="سرعت تغییر"
          subtitle="چون هدف شما کاهش وزن نیست، این مرحله اعمال نمی‌شود."
          onBack={prevStep}
        />
        <div className="card text-center py-8">
          <p className="text-4xl mb-3">👍</p>
          <p className="text-neutral-600 dark:text-neutral-400">برنامه بر اساس کالری نگهداری یا افزایش طراحی خواهد شد.</p>
        </div>
        <Button onClick={nextStep}>ادامه</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="سرعت کاهش وزن"
        subtitle="سریع‌تر همیشه بهتر نیست — پایداری و سلامت مهم‌تر است."
        onBack={prevStep}
      />

      <div className="space-y-3">
        {SPEEDS.map((speed) => (
          <OptionCard
            key={speed.value}
            selected={data.weightLossSpeed === speed.value}
            onClick={() => updateData({ weightLossSpeed: speed.value })}
            disabled={speed.value === 'fast' && fastRestricted}
            icon={speed.icon}
            label={speed.label}
            description={speed.value === 'fast' && fastRestricted
              ? 'به‌دلیل پاسخ‌های ارزیابی ایمنی، این گزینه برای شما فعال نیست.'
              : `${speed.range} — ${speed.deficit}`}
          />
        ))}
      </div>

      {/* Safety warning for fast mode */}
      {data.weightLossSpeed === 'fast' && (
        <div className="flex gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">هشدار سلامت</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1 leading-relaxed">
              کاهش وزن سریع می‌تواند منجر به افت عضله، ریزش مو، و کمبود ریزمغذی‌ها شود. توصیه می‌شود با پزشک مشورت کنید.
            </p>
          </div>
        </div>
      )}

      {fastRestricted && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-300">
            برای محافظت از سلامت شما، بیشترین سرعت قابل انتخاب «استاندارد» است.
          </p>
        </div>
      )}

      <Button onClick={nextStep} disabled={!data.weightLossSpeed}>
        ادامه
      </Button>
    </div>
  );
}
