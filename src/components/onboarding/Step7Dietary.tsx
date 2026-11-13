import { NEW_ALLERGEN_NOTICE } from '@/utils/allergens';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard, CheckboxCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { Allergy } from '@/types';
import { VEGETARIAN_OPTIONS, ALLERGIES, PROTEIN_BUDGET_OPTIONS } from './dietaryOptions';

export function Step7Dietary() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();

  const toggleAllergy = (allergy: Allergy) => {
    const has = data.allergies.includes(allergy);
    updateData({
      allergies: has
        ? data.allergies.filter((a) => a !== allergy)
        : [...data.allergies, allergy],
    });
  };

  return (
    <div className="space-y-7">
      <StepHeader
        step={currentStep}
        title="رژیم غذایی، آلرژی و بودجه"
        subtitle="نوع غذاها و سطح هدف پروتئین بر اساس پاسخ‌های این مرحله شخصی‌سازی می‌شود."
        onBack={prevStep}
      />

      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">الگوی غذایی</p>
        <div className="space-y-2">
          {VEGETARIAN_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              selected={data.vegetarianStatus === opt.value}
              onClick={() => updateData({ vegetarianStatus: opt.value })}
              icon={opt.icon}
              label={opt.label}
              description={opt.description}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
          آلرژی یا عدم تحمل غذایی{' '}
          <span className="font-normal text-neutral-400">(اختیاری)</span>
        </p>
        {(data.allergies.includes('egg') || data.allergies.includes('sesame')) && <p className="text-xs mb-3" role="status">{NEW_ALLERGEN_NOTICE}</p>}
        <div className="grid grid-cols-2 gap-2">
          {ALLERGIES.map((a) => (
            <CheckboxCard
              key={a.value}
              checked={data.allergies.includes(a.value)}
              onChange={() => toggleAllergy(a.value)}
              icon={a.icon}
              label={a.label}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
          میزان بودجه موردنظر
        </p>
        <p className="mb-3 text-xs leading-5 text-neutral-400 dark:text-neutral-500">
          این انتخاب کیفیت و ایمنی رژیم را تغییر نمی‌دهد؛ فقط مشخص می‌کند هدف پروتئین شما در محدوده به‌تن چقدر به سمت حد اقتصادی یا هدف عملکردی نزدیک باشد.
        </p>
        <div className="space-y-2">
          {PROTEIN_BUDGET_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              selected={data.proteinBudgetPreference === opt.value}
              onClick={() => updateData({ proteinBudgetPreference: opt.value })}
              icon={opt.icon}
              label={opt.label}
              description={opt.description}
            />
          ))}
        </div>
      </div>

      <div className="onboarding-actions"><Button onClick={nextStep} disabled={!data.proteinBudgetPreference}>ادامه</Button></div>
    </div>
  );
}
