import { Leaf, Wheat } from 'lucide-react';
import type { FoodQualitySummary } from '@/types';
import { toPersianDigits } from '@/utils/nutritionHelpers';

function QualityBar({ value, target }: { value: number; target: number }) {
  const pct = Math.min(100, (value / Math.max(1, target)) * 100);
  return (
    <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
      <div
        className="h-full rounded-full bg-primary-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function NutritionQualitySummary({ quality }: { quality: FoodQualitySummary }) {
  const fiberLabel = quality.fiberStatus === 'good'
    ? 'مناسب'
    : quality.fiberStatus === 'needs_improvement'
      ? 'قابل بهبود'
      : 'کم';

  return (
    <section className="rounded-3xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-neutral-900 dark:text-neutral-100">کیفیت برنامه امروز</h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">کنترل فیبر و کیفیت منابع غذایی</p>
        </div>
        <Leaf size={20} className="text-primary-500" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">فیبر</span>
          <span className="text-neutral-500 dark:text-neutral-400">
            {toPersianDigits(quality.fiberGrams)} / {toPersianDigits(quality.fiberTargetGrams)} گرم
          </span>
        </div>
        <QualityBar value={quality.fiberGrams} target={quality.fiberTargetGrams} />
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">وضعیت: {fiberLabel}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">میوه و سبزیجات</span>
          <span className="text-neutral-500 dark:text-neutral-400">
            {toPersianDigits(quality.fruitVegGrams)} / {toPersianDigits(quality.fruitVegTargetGrams)} گرم
          </span>
        </div>
        <QualityBar value={quality.fruitVegGrams} target={quality.fruitVegTargetGrams} />
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-neutral-100 dark:border-neutral-800 pt-3">
        <div className="text-center">
          <Wheat size={14} className="mx-auto mb-1 text-amber-600 dark:text-amber-400" />
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">غلات کامل</p>
          <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{toPersianDigits(quality.wholeGrainGrams)}g</p>
        </div>
        <div className="text-center">
          <p className="mb-1 text-sm">🍚</p>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">غلات تصفیه‌شده</p>
          <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{toPersianDigits(quality.refinedGrainGrams)}g</p>
        </div>
        <div className="text-center">
          <p className="mb-1 text-sm">🫘</p>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">حبوبات</p>
          <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{toPersianDigits(quality.legumeGrams)}g</p>
        </div>
      </div>
    </section>
  );
}
