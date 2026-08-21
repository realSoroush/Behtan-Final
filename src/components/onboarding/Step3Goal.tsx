import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { Goal } from '@/types';

interface GoalOption {
  value: Goal;
  icon: string;
  label: string;
  description: string;
}

const GOALS: GoalOption[] = [
  {
    value: 'weight_loss',
    icon: '🔥',
    label: 'کاهش وزن',
    description: 'می‌خواهم چربی بسوزانم و سبک‌تر شوم',
  },
  {
    value: 'weight_gain',
    icon: '💪',
    label: 'افزایش وزن / حجم',
    description: 'می‌خواهم عضله بسازم و وزن اضافه کنم',
  },
  {
    value: 'maintenance',
    icon: '⚖️',
    label: 'حفظ وزن فعلی',
    description: 'وزنم مناسب است، فقط سالم بمانم',
  },
];

export function Step3Goal() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="هدف شما چیست؟"
        subtitle="برنامه تغذیه بر اساس هدف شما طراحی خواهد شد."
        onBack={prevStep}
      />

      <div className="space-y-3">
        {GOALS.map((goal) => (
          <OptionCard
            key={goal.value}
            selected={data.goal === goal.value}
            onClick={() => updateData({ goal: goal.value })}
            icon={goal.icon}
            label={goal.label}
            description={goal.description}
          />
        ))}
      </div>

      <Button onClick={nextStep} disabled={!data.goal}>
        ادامه
      </Button>
    </div>
  );
}
