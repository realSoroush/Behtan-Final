import { ChevronRight } from 'lucide-react';
import { VISIBLE_ONBOARDING_STEPS, getVisibleOnboardingStep } from '@/utils/onboardingProgress';
import { toPersianDigits } from '@/utils/nutritionHelpers';

interface StepHeaderProps {
  step: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export function StepHeader({ step, title, subtitle, onBack }: StepHeaderProps) {
  const visibleStep = getVisibleOnboardingStep(step);
  const progress = (visibleStep / VISIBLE_ONBOARDING_STEPS) * 100;

  return (
    <div className="mb-8">
      {/* Top row: back + counter */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-neutral-400 dark:text-neutral-500 tabular-fa">
          {toPersianDigits(visibleStep)} از {toPersianDigits(VISIBLE_ONBOARDING_STEPS)}
        </span>
        {onBack && step > 1 && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-neutral-500 hover:text-primary-600 transition-colors text-sm font-medium"
          >
            <ChevronRight size={18} />
            <span>بازگشت</span>
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Title */}
      <div className="mt-5">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 text-neutral-500 dark:text-neutral-400 leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
