import { toPersianDigits } from '@/utils/nutritionHelpers';
import type { MacroTargets } from '@/types';

interface MacroRingProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
  bgColor: string;
  size?: number;
  strokeWidth?: number;
}

function MacroRing({ label, value, max, unit, color, bgColor, size = 80, strokeWidth = 7 }: MacroRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, value / (max || 1));
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
          {/* Progress */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-fa leading-none">
            {toPersianDigits(Math.round(value))}
          </span>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">{unit}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{label}</span>
    </div>
  );
}

// ============================================================================
// Calorie bar (main hero)
// ============================================================================

function CalorieBar({ consumed, target }: { consumed: number; target: number }) {
  const pct = Math.min(100, (consumed / (target || 1)) * 100);
  const remaining = Math.round(target - consumed);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
          {toPersianDigits(Math.round(consumed))}
          <span className="text-sm font-normal text-neutral-500 mr-1">کالری مصرف‌شده</span>
        </span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          هدف: {toPersianDigits(target)} کالری
        </span>
      </div>
      <div className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 motion-reduce:transition-none bg-primary-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
        {remaining > 0
          ? `${toPersianDigits(Math.round(remaining))} کالری باقی‌مانده`
          : remaining < 0 ? `${toPersianDigits(Math.abs(remaining))} کالری بیشتر از هدف ثبت شده` : 'هدف کالری تکمیل شد ✓'}
      </p>
    </div>
  );
}

// ============================================================================
// Full MacroSummary card
// ============================================================================

interface MacroSummaryProps {
  targets: MacroTargets;
  consumed: MacroTargets;
  isWorkoutDay: boolean;
  planned?: MacroTargets;
}

export function MacroSummary({ targets, consumed, isWorkoutDay }: MacroSummaryProps) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 p-5 space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-neutral-900 dark:text-neutral-100">خلاصه امروز</h2>
        {isWorkoutDay && (
          <span className="text-xs font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2.5 py-1 rounded-full">
            🏋️ روز ورزشی
          </span>
        )}
      </div>

      {/* Calorie bar */}
      <CalorieBar consumed={consumed.targetCalories} target={targets.targetCalories} />

      {/* Macro rings */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <MacroRing
          label="پروتئین"
          value={consumed.proteinGrams}
          max={targets.proteinGrams}
          unit="گرم"
          color="#10b981"
          bgColor="#d1fae5"
        />
        <MacroRing
          label="کربوهیدرات"
          value={consumed.carbGrams}
          max={targets.carbGrams}
          unit="گرم"
          color="#3b82f6"
          bgColor="#dbeafe"
        />
        <MacroRing
          label="چربی"
          value={consumed.fatGrams}
          max={targets.fatGrams}
          unit="گرم"
          color="#f59e0b"
          bgColor="#fef3c7"
        />
      </div>

      {/* Numeric summary */}
      <div className="grid grid-cols-3 gap-2 border-t border-neutral-100 dark:border-neutral-800 pt-4">
        {[
          { label: 'پروتئین', val: targets.proteinGrams, unit: 'گرم' },
          { label: 'کربوهیدرات', val: targets.carbGrams, unit: 'گرم' },
          { label: 'چربی', val: targets.fatGrams, unit: 'گرم' },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{m.label}</p>
            <p className="font-bold text-neutral-900 dark:text-neutral-100 tabular-fa">
              {toPersianDigits(m.val)}<span className="text-xs font-normal text-neutral-500 mr-0.5">{m.unit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
