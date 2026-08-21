import { Dumbbell } from 'lucide-react';

interface WorkoutDayToggleProps {
  isWorkoutDay: boolean;
  onChange: (v: boolean) => void;
}

export function WorkoutDayToggle({ isWorkoutDay, onChange }: WorkoutDayToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!isWorkoutDay)}
      className={`
        w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300
        ${isWorkoutDay
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
        }
      `}
    >
      {/* Left: icon + text */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isWorkoutDay ? 'bg-primary-500' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
          <Dumbbell size={20} className={isWorkoutDay ? 'text-white' : 'text-neutral-500'} />
        </div>
        <div className="text-right">
          <p className={`font-semibold ${isWorkoutDay ? 'text-primary-700 dark:text-primary-300' : 'text-neutral-700 dark:text-neutral-300'}`}>
            امروز روز ورزشی است؟
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isWorkoutDay ? '+۱۵۰ کالری به هدف روزانه اضافه شد' : 'برای روزهای ورزشی کالری بیشتری نیاز دارید'}
          </p>
        </div>
      </div>

      {/* Right: toggle switch */}
      <div
        className={`
          relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0
          ${isWorkoutDay ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600'}
        `}
      >
        <div
          className={`
            absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300
            ${isWorkoutDay ? 'right-0.5' : 'left-0.5'}
          `}
        />
      </div>
    </button>
  );
}
