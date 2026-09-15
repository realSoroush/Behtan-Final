import { Dumbbell, Timer, Zap } from 'lucide-react';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { OnboardingData, TrainingType, WorkoutDurationRange, WorkoutIntensity, WorkoutLocation } from '@/types';
import { toPersianDigits } from '@/utils/nutritionHelpers';
import { ACTIVITY_LEVEL_META } from '@/utils/activityLevel';
import { deriveOnboardingActivity, hasDailyMovementAnswers, hasWorkoutAnswers, mergeActivityAnswers } from '@/utils/onboardingActivity';

const LOCATIONS: { value: WorkoutLocation; icon: string; label: string }[] = [
  { value: 'home', icon: '🏠', label: 'در خانه' },
  { value: 'gym', icon: '🏋️', label: 'باشگاه' },
  { value: 'none', icon: '🚫', label: 'ورزش نمی‌کنم' },
];

const TRAINING_TYPE_OPTIONS: { value: TrainingType; icon: string; label: string; description: string }[] = [
  { value: 'resistance', icon: '🏋️', label: 'قدرتی / مقاومتی', description: 'وزنه، دستگاه، تمرین با مقاومت یا تمرین قدرتی با وزن بدن' },
  { value: 'cardio', icon: '🏃', label: 'هوازی', description: 'دویدن، دوچرخه، شنا یا تمرینی که محور اصلی آن استقامت قلبی‌تنفسی است' },
  { value: 'mixed', icon: '⚡', label: 'ترکیبی', description: 'در هفته هم تمرین مقاومتی دارید و هم تمرین هوازی' },
];

const DURATION_OPTIONS: { value: WorkoutDurationRange; label: string; description: string }[] = [
  { value: 'under_30', label: 'کمتر از ۳۰ دقیقه', description: 'جلسه کوتاه' },
  { value: '30_60', label: '۳۰ تا ۶۰ دقیقه', description: 'جلسه معمول' },
  { value: 'over_60', label: 'بیشتر از ۶۰ دقیقه', description: 'جلسه طولانی' },
];

const INTENSITY_OPTIONS: { value: WorkoutIntensity; label: string; description: string }[] = [
  { value: 'light', label: 'سبک', description: 'تنفس تقریباً عادی؛ مثل پیاده‌روی آرام یا کشش' },
  { value: 'moderate', label: 'متوسط', description: 'تنفس تندتر ولی هنوز می‌توانید صحبت کنید' },
  { value: 'vigorous', label: 'شدید', description: 'تنفس سنگین و صحبت‌کردن هنگام تمرین سخت است' },
];

export function Step5Workout() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();
  const { workoutDuration, workoutIntensity } = data;
  const doesWorkout = data.workoutLocation === 'home' || data.workoutLocation === 'gym';
  const updateAnswers = (partial: Partial<OnboardingData>) => updateData(mergeActivityAnswers(data, partial));
  const handleLocation = (workoutLocation: WorkoutLocation) => updateAnswers({
    workoutLocation,
    workoutDays: workoutLocation === 'none' ? 0 : (data.workoutDays || 3),
  });
  const level = deriveOnboardingActivity(data);
  const activityMeta = level ? ACTIVITY_LEVEL_META[level] : null;
  const canContinue = hasDailyMovementAnswers(data) && hasWorkoutAnswers(data) && !!level;
  const handleNext = () => {
    if (!canContinue) return;
    updateAnswers({});
    return nextStep();
  };
  return (
    <div className="space-y-7">
      <StepHeader step={currentStep} title="ورزش و تمرین"
        subtitle="عادت‌های ورزشی‌ات را مشخص کن تا برآورد فعالیت و نیاز پروتئین کامل شود."
        onBack={prevStep} />
      <section className="space-y-3">
        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">ورزش ساختاریافته</p>
        <div className="grid grid-cols-3 gap-2">
          {LOCATIONS.map((location) => (
            <OptionCard
              key={location.value}
              selected={data.workoutLocation === location.value}
              onClick={() => handleLocation(location.value)}
              icon={location.icon}
              label={location.label}
            />
          ))}
        </div>
      </section>

      {doesWorkout && (
        <div className="space-y-5 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              <Dumbbell size={16} />
              <span>نوع اصلی تمرین شما</span>
            </div>
            <p className="text-xs leading-5 text-neutral-400">
              این مورد برای برآورد پروتئین استفاده می‌شود و ضریب فعالیت روزانه را تغییر نمی‌دهد.
            </p>
            <div className="space-y-2">
              {TRAINING_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateAnswers({ trainingType: option.value })}
                  className={`w-full rounded-2xl border p-3 text-right transition-all ${
                    data.trainingType === option.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 bg-white hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-950'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{option.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{option.label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{option.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              تعداد جلسات در هفته: <span className="text-primary-600 dark:text-primary-400">{toPersianDigits(data.workoutDays)} روز</span>
            </p>
            <input
              type="range"
              min={1}
              max={7}
              value={data.workoutDays}
              onChange={(event) => {
                const workoutDays = Number(event.target.value);
                updateAnswers({ workoutDays });
              }}
              className="w-full accent-primary-500"
            />
            <div className="mt-1 flex justify-between text-xs text-neutral-400">
              <span>{toPersianDigits(1)}</span>
              <span>{toPersianDigits(7)}</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              <Timer size={16} />
              <span>مدت معمول هر جلسه</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateAnswers({ workoutDuration: option.value })}
                  className={`rounded-2xl border p-3 text-right transition-all ${
                    workoutDuration === option.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 bg-white hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-950'
                  }`}
                >
                  <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{option.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              <Zap size={16} />
              <span>شدت معمول تمرین</span>
            </div>
            <div className="space-y-2">
              {INTENSITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateAnswers({ workoutIntensity: option.value })}
                  className={`w-full rounded-2xl border p-3 text-right transition-all ${
                    workoutIntensity === option.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-neutral-200 bg-white hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-950'
                  }`}
                >
                  <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{option.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{option.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-3xl border p-4 transition-all ${
        activityMeta
          ? 'border-primary-200 dark:border-primary-900/60 dark:bg-primary-950/20'
          : 'border-dashed border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50'
      }`}>
        {activityMeta ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">برآورد خودکار به‌تن</p>
                <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">{activityMeta.label}</p>
              </div>
              <div className="rounded-2xl px-3 py-2 text-center">
                <p className="text-[10px] text-neutral-400">ضریب TDEE</p>
                <p className="font-bold text-primary-600 dark:text-primary-400" dir="ltr">× {activityMeta.multiplier}</p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{activityMeta.description}</p>
          </>
        ) : (
          <p className="text-center text-sm text-neutral-400">با کامل‌کردن موارد بالا، سطح فعالیت به‌صورت خودکار محاسبه می‌شود.</p>
        )}
      </div>

      <Button onClick={handleNext} disabled={!canContinue}>ادامه</Button>
    </div>
  );
}
