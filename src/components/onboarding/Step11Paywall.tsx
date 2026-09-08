import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, RefreshCw, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import type { SubscriptionPlan, SubscriptionPlanTheme } from '@/types';
import { formatSubscriptionPrice, isSameSubscriptionOffer } from '@/utils/subscriptionPlans';

interface PlanCardProps {
  plan: SubscriptionPlan;
  selected: boolean;
  onSelect: () => void;
}

const THEME_STYLES: Record<SubscriptionPlanTheme, {
  selectedCard: string;
  title: string;
  price: string;
  selectedText: string;
}> = {
  silver: {
    selectedCard: 'border-neutral-400 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900',
    title: 'text-neutral-700 dark:text-neutral-200',
    price: 'text-neutral-900 dark:text-neutral-100',
    selectedText: 'text-primary-600 dark:text-primary-400',
  },
  gold: {
    selectedCard: 'border-yellow-400 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20',
    title: 'text-yellow-600 dark:text-yellow-400',
    price: 'text-yellow-600 dark:text-yellow-400',
    selectedText: 'text-yellow-600 dark:text-yellow-400',
  },
  green: {
    selectedCard: 'border-primary-500 bg-gradient-to-br from-primary-50 to-emerald-50 dark:from-primary-950/30 dark:to-emerald-950/20',
    title: 'text-primary-700 dark:text-primary-300',
    price: 'text-primary-700 dark:text-primary-300',
    selectedText: 'text-primary-600 dark:text-primary-400',
  },
};

function PlanCard({ plan, selected, onSelect }: PlanCardProps) {
  const theme = THEME_STYLES[plan.theme];
  const isFree = plan.priceToman === 0;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      aria-pressed={selected}
      className={`
        w-full rounded-3xl border-2 p-5 text-right transition-all duration-200
        ${selected
          ? theme.selectedCard
          : 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900'
        }
      `}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 break-words">
          {plan.emoji && <span className="text-2xl" aria-hidden="true">{plan.emoji}</span>}
          <span className={`text-lg font-bold ${theme.title}`}>پلن {plan.name}</span>
        </div>
        {plan.badge && (
          <span className="flex max-w-full items-center gap-1 break-words rounded-full bg-primary-500 px-2.5 py-1 text-xs font-bold text-white">
            <Star size={10} fill="white" aria-hidden="true" /> {plan.badge}
          </span>
        )}
      </div>

      <div className="mb-4">
        <span className={`text-2xl font-extrabold ${theme.price}`}>
          {formatSubscriptionPrice(plan.priceToman)}
        </span>
        <span className="mr-1 text-sm text-neutral-500">
          {!isFree && 'تومان '}/ {plan.priceNote}
        </span>
        <p className="mt-2 text-xs text-neutral-500">مدت اعتبار: {plan.durationDays.toLocaleString('fa-IR')} روز</p>
      </div>

      <ul className="space-y-2">
        {plan.features.map((feature, index) => (
          <li key={`${index}-${feature}`} className="flex items-start gap-2 break-words text-sm text-neutral-700 dark:text-neutral-300">
            <Check size={14} className="mt-0.5 flex-shrink-0 text-primary-500" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {selected && (
        <div className={`mt-4 text-center text-sm font-bold ${theme.selectedText}`}>
          ✓ انتخاب شده
        </div>
      )}
    </motion.button>
  );
}

export function Step11Paywall({ onComplete, checkout = false }: { onComplete: (planCode: string | null, plan?: SubscriptionPlan) => Promise<void>; checkout?: boolean }) {
  const { data, updateData, prevStep, currentStep } = useOnboardingStore();
  const { plans, loading, error, refetch } = useSubscriptionPlans();
  const selectedPlan = plans.find((plan) => plan.code === data.selectedTier) ?? null;
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A plan may be deactivated while an old onboarding draft still references
  // it. Never complete onboarding with a stale plan selection.
  useEffect(() => {
    if (!loading && !error && data.selectedTier && !plans.some((plan) => plan.code === data.selectedTier)) {
      updateData({ selectedTier: null });
      setNotice('پلن انتخاب‌شده دیگر فعال نیست. لطفاً پلن دیگری انتخاب کنید.');
    }
  }, [data.selectedTier, loading, error, plans, updateData]);

  const completeSelection = async () => {
    if (!selectedPlan || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setNotice(null);
    try {
      const latestPlans = await refetch();
      if (!latestPlans) return;
      const latestPlan = latestPlans.find((plan) => plan.code === selectedPlan.code);
      if (!latestPlan) {
        updateData({ selectedTier: null });
        setNotice('پلن انتخاب‌شده دیگر فعال نیست. لطفاً پلن دیگری انتخاب کنید.');
        return;
      }
      if (!isSameSubscriptionOffer(selectedPlan, latestPlan)) {
        setNotice('اطلاعات این پلن به‌روزرسانی شد. قیمت و جزئیات جدید را بررسی و دوباره تأیید کنید.');
        return;
      }
      await onComplete(latestPlan.code, latestPlan);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'شروع پرداخت ممکن نشد. دوباره تلاش کنید.');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      {!checkout && <StepHeader
        step={currentStep}
        title="شروع سفر سلامتی"
        subtitle="پلن مناسب خود را انتخاب کنید؛ اشتراک پس از تأیید پرداخت فعال می‌شود."
        onBack={() => { if (!checking) prevStep(); }}
      />}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-3xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="space-y-3 text-center text-neutral-500 dark:text-neutral-400" aria-live="polite">
            <Loader2 size={28} className="mx-auto animate-spin text-primary-500" />
            <p className="text-sm">در حال دریافت پلن‌ها...</p>
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <p className="text-sm leading-6">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-current px-3 py-2 text-sm font-bold"
          >
            <RefreshCw size={15} /> تلاش دوباره
          </button>
        </div>
      ) : plans.length === 0 ? (
        <div role="status" className="rounded-3xl border border-neutral-200 bg-white p-5 text-center text-sm leading-6 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          در حال حاضر پلن فعالی وجود ندارد. لطفاً کمی بعد دوباره مراجعه کنید.
        </div>
      ) : (
        <div className={`space-y-4 ${checking ? 'pointer-events-none' : ''}`} aria-busy={checking}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              selected={data.selectedTier === plan.code}
              onSelect={() => {
                if (checking) return;
                updateData({ selectedTier: plan.code });
                setNotice(null);
              }}
            />
          ))}
        </div>
      )}

      <div className="flex justify-center gap-6 text-xs text-neutral-400 dark:text-neutral-500">
        <span>🔒 پرداخت امن</span>
        <span>تمدید خودکار ندارد</span>
      </div>

      {notice && <p role="status" className="text-sm leading-6 text-neutral-600 dark:text-neutral-300">{notice}</p>}

      <Button onClick={() => void completeSelection()} loading={checking} disabled={!selectedPlan || loading || Boolean(error)}>
        {selectedPlan
          ? `${selectedPlan.priceToman === 0 ? 'فعال‌سازی رایگان' : 'پرداخت و فعال‌سازی'} — پلن ${selectedPlan.name}`
          : 'پلن را انتخاب کنید'}
      </Button>

    </div>
  );
}
