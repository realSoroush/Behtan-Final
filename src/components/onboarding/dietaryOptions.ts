import type { Allergy, ProteinBudgetPreference, VegetarianStatus } from '@/types';

export const VEGETARIAN_OPTIONS: { value: VegetarianStatus; icon: string; label: string; description: string }[] = [
  { value: 'none', icon: '🍖', label: 'بدون محدودیت', description: 'هیچ محدودیتی ندارم' },
  { value: 'lacto_ovo', icon: '🥚', label: 'گیاه‌خوار (لاکتو-اوو)', description: 'لبنیات و تخم‌مرغ مجاز' },
  { value: 'pescatarian', icon: '🐟', label: 'ماهی‌خوار', description: 'ماهی و غذاهای دریایی مجاز' },
  { value: 'vegan', icon: '🌿', label: 'وگان', description: 'فقط محصولات گیاهی' },
  { value: 'raw', icon: '🥦', label: 'خام‌خواری', description: 'غذاهای خام و فرآوری‌نشده' },
];

export const ALLERGIES: { value: Allergy; icon: string; label: string }[] = [
  { value: 'dairy', icon: '🥛', label: 'لبنیات' },
  { value: 'gluten', icon: '🌾', label: 'گلوتن' },
  { value: 'peanut', icon: '🥜', label: 'بادام زمینی' },
  { value: 'tree_nut', icon: '🌰', label: 'گردو، بادام و پسته' },
  { value: 'soy', icon: '🌱', label: 'سویا' },
  { value: 'seafood', icon: '🦐', label: 'غذاهای دریایی' },
  { value: 'celery', icon: '🥬', label: 'کرفس' },
  { value: 'egg', icon: '🥚', label: 'تخم‌مرغ' },
  { value: 'sesame', icon: '🌱', label: 'کنجد' },
];

export const PROTEIN_BUDGET_OPTIONS: {
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
    label: 'بدون محدودیت مالی',
    description: 'اولویت بیشتر به حفظ یا ساخت عضله؛ ممکن است هزینه مواد غذایی بالاتر باشد',
  },
];
