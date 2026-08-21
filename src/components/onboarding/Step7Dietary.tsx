import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard, CheckboxCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { Allergy, VegetarianStatus } from '@/types';

const VEGETARIAN_OPTIONS: { value: VegetarianStatus; icon: string; label: string; description: string }[] = [
  { value: 'none', icon: '🍖', label: 'همه‌چیزخوار', description: 'هیچ محدودیتی ندارم' },
  { value: 'lacto_ovo', icon: '🥚', label: 'گیاه‌خوار (لاکتو-اوو)', description: 'لبنیات و تخم‌مرغ مجاز' },
  { value: 'pescatarian', icon: '🐟', label: 'ماهی‌خوار', description: 'ماهی و غذاهای دریایی مجاز' },
  { value: 'vegan', icon: '🌿', label: 'وگان', description: 'فقط محصولات گیاهی' },
  { value: 'raw', icon: '🥦', label: 'خام‌خواری', description: 'غذاهای خام و فرآوری‌نشده' },
];

const ALLERGIES: { value: Allergy; icon: string; label: string }[] = [
  { value: 'dairy', icon: '🥛', label: 'لبنیات' },
  { value: 'gluten', icon: '🌾', label: 'گلوتن' },
  { value: 'peanut', icon: '🥜', label: 'بادام زمینی' },
  { value: 'soy', icon: '🌱', label: 'سویا' },
  { value: 'seafood', icon: '🦐', label: 'غذاهای دریایی' },
];

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
        title="رژیم غذایی و آلرژی‌ها"
        subtitle="فیلتر دقیق غذاها بر اساس پاسخ‌های این مرحله انجام می‌شود."
        onBack={prevStep}
      />

      {/* Vegetarian status */}
      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">نوع رژیم</p>
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

      {/* Allergies */}
      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
          آلرژی یا عدم تحمل غذایی{' '}
          <span className="font-normal text-neutral-400">(اختیاری)</span>
        </p>
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

      <Button onClick={nextStep}>ادامه</Button>
    </div>
  );
}
