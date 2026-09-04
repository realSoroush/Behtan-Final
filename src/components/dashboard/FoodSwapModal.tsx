import { X, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPersianDigits } from '@/utils/nutritionHelpers';
import type { FoodSwapOption, MealComponent } from '@/types';

const ROLE_LABELS: Record<string, string> = {
  protein: 'منبع پروتئین',
  starch: 'منبع کربوهیدرات',
  vegetable: 'سبزیجات',
  fat: 'چربی',
  dairy: 'لبنیات',
  fruit: 'میوه',
};

function componentAmount(component: MealComponent): string {
  const { foodItem, grams, units } = component;
  if (foodItem.id === 'low_fat_milk') {
    return `${toPersianDigits(grams)} میلی‌لیتر`;
  }
  if (foodItem.unitLabel === 'گرم') {
    return `${toPersianDigits(grams)} گرم`;
  }
  return `${toPersianDigits(units)} ${foodItem.unitLabel}`;
}

interface FoodSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentComponent: MealComponent | null;
  candidates: FoodSwapOption[];
  onSelect: (option: FoodSwapOption) => void;
}

export function FoodSwapModal({ isOpen, onClose, currentComponent, candidates, onSelect }: FoodSwapModalProps) {
  return (
    <AnimatePresence>
      {isOpen && currentComponent && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[82vh] overflow-hidden flex flex-col"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-neutral-300 dark:bg-neutral-700 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 dark:border-neutral-800">
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors">
                <X size={22} />
              </button>
              <div className="text-right">
                <h3 className="font-bold text-neutral-900 dark:text-neutral-100">جایگزینی ماده غذایی</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  در حال جایگزینی: {currentComponent.foodItem.name}
                </p>
              </div>
            </div>

            <div className="px-5 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  {ROLE_LABELS[currentComponent.foodItem.role] ?? currentComponent.foodItem.role}
                </span>
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {componentAmount(currentComponent)}
                </span>
              </div>
              <div className="flex gap-3 text-xs text-neutral-600 dark:text-neutral-400 flex-wrap">
                <span>🔥 {toPersianDigits(currentComponent.kcal)} kcal</span>
                <span>P {toPersianDigits(currentComponent.protein)}g</span>
                <span>C {toPersianDigits(currentComponent.carbs)}g</span>
                <span>F {toPersianDigits(currentComponent.fat)}g</span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
              {candidates.length === 0 ? (
                <div className="text-center py-10 text-neutral-400 dark:text-neutral-500">
                  <RefreshCw size={32} className="mx-auto mb-3 opacity-50" />
                  <p>جایگزین مناسبی برای این ماده یافت نشد</p>
                </div>
              ) : (
                candidates.map((option) => {
                  const replacement = option.replacementComponent;
                  return (
                    <button
                      key={option.foodItem.id}
                      type="button"
                      disabled={!option.isEquivalent}
                      onClick={() => {
                        if (!option.isEquivalent) return;
                        onSelect(option);
                        onClose();
                      }}
                      className={`w-full text-right p-3.5 rounded-2xl border transition-all ${
                        option.isEquivalent
                          ? 'border-neutral-200 dark:border-neutral-700 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                          : 'border-neutral-100 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/30 opacity-70 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">{option.foodItem.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">{option.foodItem.name}</p>
                              {option.isOriginal && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 whitespace-nowrap">
                                  انتخاب اصلی
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                              {componentAmount(replacement)}
                            </span>
                          </div>
                          <div className="flex gap-3 flex-wrap text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                            <span>🔥 {toPersianDigits(replacement.kcal)}</span>
                            <span>P {toPersianDigits(replacement.protein)}g</span>
                            <span>C {toPersianDigits(replacement.carbs)}g</span>
                            <span>F {toPersianDigits(replacement.fat)}g</span>
                          </div>
                          <div className="mt-2 flex items-start gap-1.5 text-xs">
                            {option.isEquivalent ? (
                              <>
                                <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                <span className="text-emerald-600 dark:text-emerald-400">معادل ماکرویی قابل قبول</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                <span className="text-amber-700 dark:text-amber-400">{option.reason}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <p className="px-5 pb-4 pt-1 text-xs text-neutral-400 dark:text-neutral-500 text-center leading-5">
              فقط گزینه‌های مناسب همین وعده نمایش داده می‌شوند. مقدار جایگزین بر اساس نقش غذایی، کالری و ماکروهای ماده اصلی محاسبه می‌شود.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
