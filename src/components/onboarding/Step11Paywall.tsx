import { Check, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { SubscriptionTier } from '@/types';

interface PlanCardProps {
  tier: SubscriptionTier;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
}

const PLAN_DETAILS: Record<SubscriptionTier, {
  icon: string;
  label: string;
  price: string;
  priceNote: string;
  color: string;
  features: string[];
}> = {
  silver: {
    icon: '🥈',
    label: 'نقره‌ای',
    price: '۱۴۹,۰۰۰',
    priceNote: 'تومان / ماهانه',
    color: 'border-neutral-400',
    features: [
      'برنامه تغذیه شخصی‌سازی‌شده',
      'محاسبه دقیق کالری و ماکرو',
      '۶ وعده غذایی روزانه',
      'جایگزینی غذا (سواپ)',
      'پشتیبانی ۷/۲۴',
    ],
  },
  gold: {
    icon: '🥇',
    label: 'طلایی',
    price: '۲۴۹,۰۰۰',
    priceNote: 'تومان / ماهانه',
    color: 'border-yellow-400',
    features: [
      'همه مزایای نقره‌ای',
      '✨ برنامه تمرینی اختصاصی',
      '✨ تنظیم بر اساس ورزش روز',
      '✨ مشاوره با متخصص تغذیه',
      '✨ تحلیل پیشرفته ترکیب بدن',
    ],
  },
};

function PlanCard({ tier, selected, onSelect, badge }: PlanCardProps) {
  const plan = PLAN_DETAILS[tier];

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`
        w-full text-right rounded-3xl border-2 p-5 transition-all duration-200
        ${selected
          ? `${plan.color} bg-gradient-to-br ${tier === 'gold' ? 'from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20' : 'from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900'}`
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{plan.icon}</span>
          <span className={`font-bold text-lg ${tier === 'gold' ? 'text-yellow-600 dark:text-yellow-400' : 'text-neutral-700 dark:text-neutral-200'}`}>
            پلن {plan.label}
          </span>
        </div>
        {badge && (
          <span className="bg-primary-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <Star size={10} fill="white" /> {badge}
          </span>
        )}
      </div>

      {/* Price */}
      <div className="mb-4">
        <span className={`text-2xl font-extrabold ${tier === 'gold' ? 'text-yellow-600 dark:text-yellow-400' : 'text-neutral-900 dark:text-neutral-100'}`}>
          {plan.price}
        </span>
        <span className="text-sm text-neutral-500 mr-1">{plan.priceNote}</span>
      </div>

      {/* Features */}
      <ul className="space-y-2">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <Check size={14} className="text-primary-500 flex-shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* Selected indicator */}
      {selected && (
        <div className={`mt-4 text-center text-sm font-bold ${tier === 'gold' ? 'text-yellow-600' : 'text-primary-600'}`}>
          ✓ انتخاب شده
        </div>
      )}
    </motion.button>
  );
}

export function Step11Paywall({ onComplete }: { onComplete: () => void }) {
  const { data, updateData, prevStep, currentStep } = useOnboardingStore();

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="شروع سفر سلامتی"
        subtitle="پلن مناسب خود را انتخاب کنید. ۷ روز تضمین بازگشت وجه."
        onBack={prevStep}
      />

      <div className="space-y-4">
        <PlanCard
          tier="silver"
          selected={data.selectedTier === 'silver'}
          onSelect={() => updateData({ selectedTier: 'silver' })}
        />
        <PlanCard
          tier="gold"
          selected={data.selectedTier === 'gold'}
          onSelect={() => updateData({ selectedTier: 'gold' })}
          badge="محبوب‌ترین"
        />
      </div>

      {/* Trust signals */}
      <div className="flex justify-center gap-6 text-xs text-neutral-400 dark:text-neutral-500">
        <span>🔒 پرداخت امن</span>
        <span>↩️ بازگشت ۷ روزه</span>
        <span>❌ لغو آسان</span>
      </div>

      <Button onClick={onComplete} disabled={!data.selectedTier}>
        شروع کن — {data.selectedTier === 'gold' ? '🥇 پلن طلایی' : data.selectedTier === 'silver' ? '🥈 پلن نقره‌ای' : 'پلن را انتخاب کنید'}
      </Button>

      <button
        type="button"
        onClick={onComplete}
        className="w-full text-center text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors py-2"
      >
        فعلاً رایگان ادامه می‌دهم
      </button>
    </div>
  );
}
