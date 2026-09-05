import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard, CheckboxCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { Allergy, ProteinBudgetPreference, VegetarianStatus } from '@/types';

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
  { value: 'tree_nut', icon: '🌰', label: 'گردو، بادام و پسته' },
  { value: 'soy', icon: '🌱', label: 'سویا' },
  { value: 'seafood', icon: '🦐', label: 'غذاهای دریایی' },
];

const PROTEIN_BUDGET_OPTIONS: {
  value: ProteinBudgetPreference;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    value: 'economic',
    icon: '💰',
    label: 'اقتصادی',
    description: 'پروتئین کافی با تمرکز بیشتر روی پایین نگه داشتن هزینه مواد غذایی',
  },
  {
    value: 'balanced',
    icon: '⚖️',
    label: 'متعادل',
    description: 'تعادل بین هزینه مواد غذایی و پروتئین بالاتر برای ترکیب بدنی بهتر',
  },
  {
    value: 'performance',
    icon: '💪',
    label: 'عملکردی',
    description: 'اولویت بیشتر به حفظ یا ساخت عضله؛ ممکن است هزینه مواد غذایی بالاتر باشد',
  },
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
        title="رژیم غذایی، آلرژی و بودجه"
        subtitle="نوع غذاها و سطح هدف پروتئین بر اساس پاسخ‌های این مرحله شخصی‌سازی می‌شود."
        onBack={prevStep}
      />

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

      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
          اولویت هزینه برای پروتئین
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

      <Button onClick={nextStep} disabled={!data.proteinBudgetPreference}>ادامه</Button>
    </div>
  );
}
