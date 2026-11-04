import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { DailyMealPlan, MealComponent } from '@/types';
import type { MemberSwapOption } from '@/utils/mealPlanEngine';
import { componentAmount, foodVisual } from '@/utils/mealPresentation';
import { FoodArt } from './visuals/FoodArt';
import { MemberDialog } from './MemberDialog';

const n = (value: number) => Math.round(value).toLocaleString('fa-IR');

export function MemberSwapSheet({ isOpen, onClose, currentComponent, currentPlan, candidates, onSelect }: {
  isOpen: boolean;
  onClose: () => void;
  currentComponent: MealComponent | null;
  currentPlan: DailyMealPlan | null;
  candidates: MemberSwapOption[];
  onSelect: (option: MemberSwapOption) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setSelectedId('');
    setError('');
  }, [isOpen, currentComponent?.foodItem.id]);

  if (!isOpen || !currentComponent || !currentPlan) return null;
  const pending = candidates.find(c => c.foodItem.id === selectedId);
  const adjustments = pending?.plan.meals.flatMap((meal, index) =>
    meal.components.flatMap((component, componentIndex) => {
      const before = currentPlan.meals[index]?.components[componentIndex];
      return before && before.foodItem.id === component.foodItem.id && before.units !== component.units
        ? [{ key: `${meal.slot}:${componentIndex}`, label: meal.label, before, after: component }]
        : [];
    }),
  ) ?? [];

  const confirm = async () => {
    if (!pending || saving) return;
    setError('');
    setSaving(true);
    try {
      await onSelect(pending);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'جایگزینی ذخیره نشد. دوباره تلاش کن.');
    } finally {
      setSaving(false);
    }
  };

  return <MemberDialog title="جایگزینی غذا" onClose={onClose} dismissible={!saving}>
    <div className="swap-current-v2"><span>به‌جای</span><strong>{currentComponent.foodItem.name}</strong><span>{componentAmount(currentComponent)}</span></div>
    <p className="member-muted">گزینه‌ها با ثبت‌های امروز و هدف روزانه سازگارند.</p>
    <div className="swap-options-v2">{candidates.length ? candidates.map(option => (
      <button type="button" className="swap-option-v2" key={option.foodItem.id} data-food-id={option.foodItem.id}
        disabled={saving} aria-pressed={option.foodItem.id === selectedId}
        onClick={() => { setSelectedId(option.foodItem.id); setError(''); }}>
        <svg viewBox="-45 -45 90 90" aria-hidden="true"><FoodArt kind={foodVisual(option.foodItem)} /></svg>
        <span>
          <b>{option.foodItem.name}</b>
          <span>{componentAmount(option.replacementComponent)} · {n(option.replacementComponent.kcal)} کالری</span>
          <em>{n(option.replacementComponent.protein)} گرم پروتئین · {n(option.replacementComponent.fat)} گرم چربی</em>
        </span>
        <i className="swap-choice-indicator">{option.foodItem.id === selectedId && <Check size={14} />}</i>
      </button>
    )) : <div className="member-empty">با ثبت‌ها و محدودیت‌های فعلی، جایگزین مناسبی پیدا نشد.</div>}</div>
    {adjustments.length > 0 && <section className="member-muted" aria-label="تنظیم مقدار سایر وعده‌ها">
      <p>این مقدارها هم برای نزدیک ماندن به هدف روز تغییر می‌کنند.</p>
      <ul>{adjustments.map(({ key, label, before, after }) => (
        <li key={key}>{label}، {after.foodItem.name} از {componentAmount(before)} به {componentAmount(after)}</li>
      ))}</ul>
    </section>}
    {error && <p role="alert">{error}</p>}
    <div className="swap-confirm-bar">
      <p aria-live="polite">{pending ? `${pending.foodItem.name} · ${componentAmount(pending.replacementComponent)}` : 'یک جایگزین انتخاب کن'}</p>
      <button type="button" className="member-primary" disabled={!pending || saving} onClick={() => void confirm()}>
        {saving ? 'در حال ذخیره…' : 'تأیید جایگزینی'}<Check size={17} />
      </button>
    </div>
  </MemberDialog>;
}
