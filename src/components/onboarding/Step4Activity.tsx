import { Activity, Dumbbell, Footprints, Timer, Zap } from 'lucide-react';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type {
  DailyMovementPattern,
  DailyStepsRange,
  Motivation,
  TrainingType,
  WorkoutDurationRange,
  WorkoutIntensity,
  WorkoutLocation,
} from '@/types';
import { toPersianDigits } from '@/utils/nutritionHelpers';
import { ACTIVITY_LEVEL_META, estimateActivityLevel } from '@/utils/activityLevel';

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

const MOTIVATIONS: { value: Motivation; icon: string; label: string }[] = [
  { value: 'health', icon: '❤️', label: 'سلامت و طول عمر' },
  { value: 'appearance', icon: '✨', label: 'ظاهر و اندام' },
  { value: 'confidence', icon: '🌟', label: 'اعتماد به نفس' },
  { value: 'medical', icon: '🏥', label: 'دلایل پزشکی' },
  { value: 'performance', icon: '⚡', label: 'عملکرد ورزشی' },
  { value: 'event', icon: '🎉', label: 'مناسبت خاص' },
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

  const dailyMovement = data.dailyMovement;
  const dailySteps = data.dailySteps;
  const workoutDuration = data.workoutDuration;
  const workoutIntensity = data.workoutIntensity;
  const doesWorkout = !!data.workoutLocation && data.workoutLocation !== 'none';

  const persistDerivedActivity = (partial: {
    dailyMovement?: DailyMovementPattern;
    dailySteps?: DailyStepsRange;
    workoutDuration?: WorkoutDurationRange | null;
    workoutIntensity?: WorkoutIntensity | null;
    workoutDays?: number;
    doesWorkout?: boolean;
  }) => {
    const nextMovement = partial.dailyMovement ?? dailyMovement;
    const nextSteps = partial.dailySteps ?? dailySteps;
    const nextDuration = partial.workoutDuration !== undefined ? partial.workoutDuration : workoutDuration;
    const nextIntensity = partial.workoutIntensity !== undefined ? partial.workoutIntensity : workoutIntensity;
    const nextWorkoutDays = partial.workoutDays ?? data.workoutDays;
    const nextDoesWorkout = partial.doesWorkout ?? doesWorkout;

    let nextLevel = data.activityLevel;
    if (
      nextMovement &&
      nextSteps &&
      (!nextDoesWorkout || (nextDuration && nextIntensity))
    ) {
      nextLevel = estimateActivityLevel({
        dailyMovement: nextMovement,
        dailySteps: nextSteps,
        workoutDays: nextWorkoutDays,
        workoutDuration: nextDoesWorkout ? nextDuration : null,
        workoutIntensity: nextDoesWorkout ? nextIntensity : null,
        doesWorkout: nextDoesWorkout,
      }).level;
    } else {
      nextLevel = null;
    }

    updateData({
      dailyMovement: nextMovement,
      dailySteps: nextSteps,
      workoutDuration: nextDoesWorkout ? nextDuration : null,
      workoutIntensity: nextDoesWorkout ? nextIntensity : null,
      activityLevel: nextLevel,
    });
  };

  const handleLocation = (loc: WorkoutLocation) => {
    const nextDays = loc === 'none' ? 0 : (data.workoutDays || 3);
    updateData({
      workoutLocation: loc,
      workoutDays: nextDays,
      trainingType: loc === 'none' ? null : data.trainingType,
    });
    persistDerivedActivity({
      workoutDays: nextDays,
      doesWorkout: loc !== 'none',
      workoutDuration: loc === 'none' ? null : workoutDuration,
      workoutIntensity: loc === 'none' ? null : workoutIntensity,
    });
  };

  const canContinue = Boolean(
    dailyMovement &&
    dailySteps &&
    data.activityLevel &&
    data.workoutLocation &&
    data.motivation &&
    (!doesWorkout || (data.trainingType && workoutDuration && workoutIntensity))
  );

  const activityMeta = data.activityLevel ? ACTIVITY_LEVEL_META[data.activityLevel] : null;

  return (
    <div className="space-y-7">
      <StepHeader
        step={currentStep}
        title="تحرک روزانه و ورزش"
        subtitle="به‌جای حدس‌زدن سطح فعالیت، از روی رفتار واقعی روزانه آن را محاسبه می‌کنیم."
        onBack={prevStep}
      />

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
              onClick={() => persistDerivedActivity({ dailyMovement: option.value })}
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
              onClick={() => persistDerivedActivity({ dailySteps: option.value })}
            />
          ))}
        </div>
      </section>

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
                  onClick={() => updateData({ trainingType: option.value })}
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
                updateData({ workoutDays });
                persistDerivedActivity({ workoutDays });
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
                  onClick={() => persistDerivedActivity({ workoutDuration: option.value })}
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
                  onClick={() => persistDerivedActivity({ workoutIntensity: option.value })}
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

      <section>
        <p className="mb-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">انگیزه اصلی شما چیست؟</p>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVATIONS.map((motivation) => (
            <OptionCard
              key={motivation.value}
              selected={data.motivation === motivation.value}
              onClick={() => updateData({ motivation: motivation.value })}
              icon={motivation.icon}
              label={motivation.label}
            />
          ))}
        </div>
      </section>

      <Button onClick={nextStep} disabled={!canContinue}>
        ادامه
      </Button>
    </div>
  );
}
