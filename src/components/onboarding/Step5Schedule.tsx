import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { TimeInput } from '@/components/ui/Input';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { MealSlot, ScheduleJson } from '@/types';

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'صبحانه',
  morning_snack: 'میان‌وعده صبح',
  lunch: 'ناهار',
  afternoon_snack: 'میان‌وعده عصر',
  dinner: 'شام',
  night_snack: 'میان‌وعده شب',
};

const MEAL_SLOTS: MealSlot[] = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'night_snack',
];

export function Step5Schedule() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();
  const schedule = data.schedule;

  const updateSchedule = (partial: Partial<ScheduleJson>) =>
    updateData({ schedule: { ...schedule, ...partial } });

  const updateMealTime = (slot: MealSlot, time: string) =>
    updateData({
      schedule: {
        ...schedule,
        mealTimes: { ...schedule.mealTimes, [slot]: time },
      },
    });

  return (
    <div className="space-y-7">
      <StepHeader
        step={currentStep}
        title="برنامه روزانه"
        subtitle="ساعت‌های پیشنهادی فارسی از پیش تنظیم شده‌اند — فقط تغییر دهید اگر لازم است."
        onBack={prevStep}
      />

      {/* Daily rhythm */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 p-5">
        <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-4">ریتم خواب و کار</p>
        <div className="grid grid-cols-2 gap-4">
          <TimeInput label="بیداری" value={schedule.wakeTime} onChange={(v) => updateSchedule({ wakeTime: v })} />
          <TimeInput label="خواب" value={schedule.sleepTime} onChange={(v) => updateSchedule({ sleepTime: v })} />
          <TimeInput label="شروع کار" value={schedule.workStart} onChange={(v) => updateSchedule({ workStart: v })} />
          <TimeInput label="پایان کار" value={schedule.workEnd} onChange={(v) => updateSchedule({ workEnd: v })} />
          <TimeInput label="ورزش" value={schedule.workoutTime} onChange={(v) => updateSchedule({ workoutTime: v })} />
        </div>
      </div>

      {/* Meal times */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 p-5">
        <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-4">ساعت وعده‌های غذایی</p>
        <div className="grid grid-cols-2 gap-4">
          {MEAL_SLOTS.map((slot) => (
            <TimeInput
              key={slot}
              label={MEAL_LABELS[slot]}
              value={schedule.mealTimes[slot]}
              onChange={(v) => updateMealTime(slot, v)}
            />
          ))}
        </div>
      </div>

      <Button onClick={nextStep}>ادامه</Button>
    </div>
  );
}
