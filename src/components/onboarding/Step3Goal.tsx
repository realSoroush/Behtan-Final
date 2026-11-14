import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import { GOALS } from './goalOptions';

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

      <div className="onboarding-actions"><Button onClick={nextStep} disabled={!data.goal}>
        ادامه
      </Button></div>
    </div>
  );
}
