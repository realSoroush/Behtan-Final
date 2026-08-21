import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { ActivityLevel, Motivation, WorkoutLocation } from '@/types';
import { toPersianDigits } from '@/utils/nutritionHelpers';

const ACTIVITIES: { value: ActivityLevel; icon: string; label: string; description: string }[] = [
  { value: 'sedentary', icon: '🪑', label: 'کم‌تحرک', description: 'کار میزنشین، ورزش بسیار کم' },
  { value: 'lightly_active', icon: '🚶‍♂️', label: 'کمی فعال', description: '۱-۲ روز ورزش سبک در هفته' },
  { value: 'moderate', icon: '🚶', label: 'نیمه‌فعال', description: '۳-۴ روز ورزش سبک در هفته' },
  { value: 'active', icon: '🏃', label: 'فعال', description: '۵-۶ روز ورزش شدید در هفته' },
];

const LOCATIONS: { value: WorkoutLocation; icon: string; label: string }[] = [
  { value: 'home', icon: '🏠', label: 'در خانه' },
  { value: 'gym', icon: '🏋️', label: 'باشگاه' },
  { value: 'none', icon: '🚫', label: 'ورزش نمی‌کنم' },
];

const MOTIVATIONS: { value: Motivation; icon: string; label: string }[] = [
  { value: 'health', icon: '❤️', label: 'سلامت و طول عمر' },
  { value: 'appearance', icon: '✨', label: 'ظاهر و اندام' },
  { value: 'confidence', icon: '🌟', label: 'اعتماد به نفس' },
  { value: 'medical', icon: '🏥', label: 'دلایل پزشکی' },
  { value: 'performance', icon: '⚡', label: 'عملکرد ورزشی' },
  { value: 'event', icon: '🎉', label: 'مناسبت خاص' },
];

export function Step4Activity() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();

  const canContinue = !!data.activityLevel && !!data.workoutLocation && !!data.motivation;

  const handleLocation = (loc: WorkoutLocation) => {
    updateData({
      workoutLocation: loc,
      workoutDays: loc === 'none' ? 0 : data.workoutDays || 3,
    });
  };

  return (
    <div className="space-y-7">
      <StepHeader
        step={currentStep}
        title="سطح فعالیت و انگیزه"
        subtitle="دقت در این مرحله تأثیر مستقیم بر محاسبه کالری دارد."
        onBack={prevStep}
      />

      {/* Activity level */}
      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">سطح تحرک روزانه</p>
        <div className="space-y-3">
          {ACTIVITIES.map((a) => (
            <OptionCard
              key={a.value}
              selected={data.activityLevel === a.value}
              onClick={() => updateData({ activityLevel: a.value })}
              icon={a.icon}
              label={a.label}
              description={a.description}
            />
          ))}
        </div>
      </div>

      {/* Workout location */}
      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">مکان ورزش</p>
        <div className="grid grid-cols-3 gap-2">
          {LOCATIONS.map((l) => (
            <OptionCard
              key={l.value}
              selected={data.workoutLocation === l.value}
              onClick={() => handleLocation(l.value)}
              icon={l.icon}
              label={l.label}
            />
          ))}
        </div>
      </div>

      {/* Days per week */}
      {data.workoutLocation && data.workoutLocation !== 'none' && (
        <div>
          <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
            تعداد روزهای ورزش در هفته: <span className="text-primary-600">{toPersianDigits(data.workoutDays)} روز</span>
          </p>
          <input
            type="range"
            min={1}
            max={7}
            value={data.workoutDays}
            onChange={(e) => updateData({ workoutDays: Number(e.target.value) })}
            className="w-full accent-primary-500"
          />
          <div className="flex justify-between text-xs text-neutral-400 mt-1">
            <span>{toPersianDigits(1)}</span>
            <span>{toPersianDigits(7)}</span>
          </div>
        </div>
      )}

      {/* Motivation */}
      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">انگیزه اصلی شما چیست؟</p>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVATIONS.map((m) => (
            <OptionCard
              key={m.value}
              selected={data.motivation === m.value}
              onClick={() => updateData({ motivation: m.value })}
              icon={m.icon}
              label={m.label}
            />
          ))}
        </div>
      </div>

      <Button onClick={nextStep} disabled={!canContinue}>
        ادامه
      </Button>
    </div>
  );
}
