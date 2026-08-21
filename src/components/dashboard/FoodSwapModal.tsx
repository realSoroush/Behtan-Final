import { X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPersianDigits } from '@/utils/nutritionHelpers';
import type { FoodItem, MealComponent } from '@/types';

const ROLE_LABELS: Record<string, string> = {
  protein: 'منبع پروتئین',
  starch: 'منبع کربوهیدرات',
  vegetable: 'سبزیجات',
  fat: 'چربی',
  dairy: 'لبنیات',
  fruit: 'میوه',
};

interface FoodSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentComponent: MealComponent | null;
  candidates: FoodItem[];
  onSelect: (food: FoodItem) => void;
}

export function FoodSwapModal({ isOpen, onClose, currentComponent, candidates, onSelect }: FoodSwapModalProps) {
  return (
    <AnimatePresence>
      {isOpen && currentComponent && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[80vh] overflow-hidden flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-neutral-300 dark:bg-neutral-700 rounded-full" />
            </div>

            {/* Header */}
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

            {/* Current food summary */}
            <div className="px-5 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800">
              <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
                {ROLE_LABELS[currentComponent.foodItem.role] ?? currentComponent.foodItem.role}
              </p>
              <div className="flex gap-4 text-xs text-neutral-600 dark:text-neutral-400">
                <span>🔥 {toPersianDigits(currentComponent.kcal)} کالری</span>
                <span>P {toPersianDigits(currentComponent.protein)}g</span>
                <span>C {toPersianDigits(currentComponent.carbs)}g</span>
                <span>F {toPersianDigits(currentComponent.fat)}g</span>
              </div>
            </div>

            {/* Candidates */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
              {candidates.length === 0 ? (
                <div className="text-center py-10 text-neutral-400 dark:text-neutral-500">
                  <RefreshCw size={32} className="mx-auto mb-3 opacity-50" />
                  <p>جایگزین مناسبی برای این ماده یافت نشد</p>
                </div>
              ) : (
                candidates.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => { onSelect(food); onClose(); }}
                    className="w-full text-right flex items-center gap-3 p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-700 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                  >
                    <span className="text-xl flex-shrink-0">{food.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">{food.name}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        به ازای هر {toPersianDigits(food.gramsPerUnit)} گرم: {toPersianDigits(food.kcalPerUnit)} کالری
                      </p>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        P {toPersianDigits(food.proteinPerUnit)}g
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            <p className="px-5 pb-4 pt-1 text-xs text-neutral-400 dark:text-neutral-500 text-center">
              مقدار جایگزین بر اساس هدف پروتئین این وعده به‌صورت خودکار محاسبه می‌شود.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
