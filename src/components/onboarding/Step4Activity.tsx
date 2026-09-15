import { Activity, Footprints } from 'lucide-react';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { DailyMovementPattern, DailyStepsRange, OnboardingData } from '@/types';
import { hasDailyMovementAnswers, mergeActivityAnswers } from '@/utils/onboardingActivity';

const MOVEMENT_OPTIONS: { value: DailyMovementPattern; icon: string; label: string; description: string }[] = [
  { value: 'mostly_seated', icon: '🪑', label: 'بیشتر روز نشسته‌ام', description: 'کار یا مطالعه پشت‌میز، رفت‌وآمد روزانه کم' },
  { value: 'mixed', icon: '🚶', label: 'نشستن و حرکت ترکیبی', description: 'بخشی از روز نشسته و بخشی در حال راه‌رفتن یا ایستادن' },
  { value: 'mostly_on_feet', icon: '🧍', label: 'بیشتر روز سرپا هستم', description: 'فروش، آموزش، خدمات یا رفت‌وآمد زیاد در طول روز' },
  { value: 'physical_job', icon: '🏗️', label: 'کار روزانه فیزیکی دارم', description: 'حمل بار، کار بدنی یا تحرک زیاد در بیشتر ساعات روز' },
];

const STEP_OPTIONS: { value: DailyStepsRange; label: string }[] = [
  { value: 'under_4000', label: 'کمتر از ۴هزار' },
  { value: '4000_7000', label: '۴ تا ۷هزار' },
  { value: '7000_10000', label: '۷ تا ۱۰هزار' },
  { value: 'over_10000', label: 'بیشتر از ۱۰هزار' },
  { value: 'unknown', label: 'نمی‌دانم' },
];

function SegmentButton({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
        selected
          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
          : 'border-neutral-200 bg-white text-neutral-600 hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'
      }`}
    >
      {label}
    </button>
  );
}

export function Step4Activity() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();
  const { dailyMovement, dailySteps } = data;
  const updateAnswers = (partial: Partial<OnboardingData>) => updateData(mergeActivityAnswers(data, partial));
  const canContinue = hasDailyMovementAnswers(data);
  return (
    <div className="space-y-7">
      <StepHeader step={currentStep} title="تحرک روزانه"
        subtitle="ابتدا تحرک روزمره‌ات را مشخص کن؛ در مرحلهٔ بعد دربارهٔ ورزش می‌پرسیم."
        onBack={prevStep} />
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <Activity size={17} />
          <span>یک روز معمولی شما بیشتر شبیه کدام است؟</span>
        </div>
        <div className="space-y-2.5">
          {MOVEMENT_OPTIONS.map((option) => (
            <OptionCard
              key={option.value}
              selected={dailyMovement === option.value}
              onClick={() => updateAnswers({ dailyMovement: option.value })}
              icon={option.icon}
              label={option.label}
              description={option.description}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            <Footprints size={17} />
            <span>میانگین قدم روزانه</span>
          </div>
          <span className="text-[11px] text-neutral-400">اگر نمی‌دانی، اشکالی ندارد</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STEP_OPTIONS.map((option) => (
            <SegmentButton
              key={option.value}
              selected={dailySteps === option.value}
              label={option.label}
              onClick={() => updateAnswers({ dailySteps: option.value })}
            />
          ))}
        </div>
      </section>

      <Button onClick={nextStep} disabled={!canContinue}>ادامه</Button>
    </div>
  );
}
