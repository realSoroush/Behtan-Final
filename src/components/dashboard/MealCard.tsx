import { useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, CheckCircle2, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPersianDigits } from '@/utils/nutritionHelpers';
import type { Meal, MealComponent } from '@/types';

// ============================================================================
// ComponentRow - one food line inside a resolved meal
// ============================================================================

interface ComponentRowProps {
  component: MealComponent;
  onSwap: () => void;
  swapDisabled?: boolean;
  readOnly?: boolean;
}

function ComponentRow({ component, onSwap, swapDisabled = false, readOnly = false }: ComponentRowProps) {
  const { foodItem, grams, kcal } = component;

  // Display quantity in the food's natural unit (عدد/برش/اسکوپ) when it's
  // a countable item, otherwise show grams directly.
  const displayAmount =
    foodItem.id === 'low_fat_milk'
      ? `${toPersianDigits(component.units)} ${foodItem.unitLabel} (${toPersianDigits(grams)} میلی‌لیتر)`
      : foodItem.unitLabel === 'گرم'
        ? `${toPersianDigits(grams)} گرم`
        : `${toPersianDigits(component.units)} ${foodItem.unitLabel} (${toPersianDigits(grams)} گرم)`;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-neutral-50 dark:border-neutral-800 last:border-0">
      <span className="text-lg leading-none mt-0.5">{foodItem.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-neutral-800 dark:text-neutral-200 text-sm leading-snug">
          {foodItem.name}
        </p>
        <div className="flex gap-3 mt-1">
          <span className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-lg px-2 py-0.5">
            {displayAmount}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {toPersianDigits(kcal)} کالری
          </span>
        </div>
      </div>
      {!readOnly && <button
        type="button"
        onClick={onSwap}
        disabled={swapDisabled}
        title={swapDisabled ? 'برای تغییر غذای مصرف‌شده، ابتدا تیک وعده را بردارید' : 'جایگزینی این ماده غذایی'}
        className="flex-shrink-0 flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 font-medium hover:text-primary-700 transition-colors mt-0.5 py-1 px-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:text-neutral-300 dark:disabled:text-neutral-700 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      >
        <RefreshCw size={13} />
        <span>جایگزین</span>
      </button>}
    </div>
  );
}

// ============================================================================
// MealCard
// ============================================================================

interface MealCardProps {
  meal: Meal;
  readOnly?: boolean;
  isConsumedSaving?: boolean;
  consumedToggleDisabled?: boolean;
  onToggleConsumed: () => void;
  onSwapComponent: (componentIndex: number) => void;
}

export function MealCard({ meal, readOnly = false, isConsumedSaving = false, consumedToggleDisabled = false, onToggleConsumed, onSwapComponent }: MealCardProps) {
  const [expanded, setExpanded] = useState(!meal.consumed);

  return (
    <div
      className={`
        rounded-3xl border transition-all duration-200
        ${meal.consumed
          ? 'border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 opacity-75'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        {/* Consumed toggle */}
        <button
          type="button"
          onClick={onToggleConsumed}
          disabled={readOnly || isConsumedSaving || consumedToggleDisabled}
          aria-label={meal.consumed ? 'علامت‌گذاری وعده به‌عنوان مصرف‌نشده' : 'علامت‌گذاری وعده به‌عنوان مصرف‌شده'}
          title={consumedToggleDisabled ? 'همگام‌سازی وضعیت وعده‌ها در دسترس نیست' : undefined}
          className={`flex-shrink-0 text-primary-500 hover:text-primary-600 transition-colors disabled:cursor-not-allowed ${isConsumedSaving ? 'opacity-60' : ''}`}
        >
          {meal.consumed
            ? <CheckCircle2 size={22} className="text-primary-500" />
            : <Circle size={22} className="text-neutral-300 dark:text-neutral-600" />
          }
        </button>

        {/* Title + macros */}
        <div className="flex-1 min-w-0">
          <p className={`font-bold ${meal.consumed ? 'line-through text-neutral-400' : 'text-neutral-900 dark:text-neutral-100'}`}>
            {meal.label}
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            {meal.templateName}
          </p>
          <div className="flex gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {toPersianDigits(Math.round(meal.totalKcal))} کالری
            </span>
            <span className="text-xs text-primary-600 dark:text-primary-400">
              P: {toPersianDigits(Math.round(meal.totalProtein))}g
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-400">
              C: {toPersianDigits(Math.round(meal.totalCarbs))}g
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              F: {toPersianDigits(Math.round(meal.totalFat))}g
            </span>
          </div>
        </div>

        {/* Expand/collapse */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Components */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-0">
              {meal.components.map((component, idx) => (
                <ComponentRow
                  key={`${component.foodItem.id}-${idx}`}
                  component={component}
                  readOnly={readOnly}
                  swapDisabled={meal.consumed}
                  onSwap={() => onSwapComponent(idx)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
