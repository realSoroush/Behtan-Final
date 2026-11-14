import { canRenderSnapshot } from './validateSnapshot';
import { MealCard } from '@/components/dashboard/MealCard';
import { MacroSummary } from '@/components/dashboard/MacroSummary';
import { NutritionQualitySummary } from '@/components/dashboard/NutritionQualitySummary';
import { evaluateDailyFoodQuality } from '@/utils/nutritionQuality';
import type { DailyMealPlan, MacroTargets } from '@/types';

export type AdminSavedSnapshot = { updated_at: string; revision: number; snapshot: { schemaVersion: number; plan: DailyMealPlan; targets: MacroTargets; isWorkoutDay: boolean; profile: Record<string, unknown> } };
const number = (n: number) => Number(n).toLocaleString('fa-IR');
const dateTime = (s: string | null) => s ? new Date(s).toLocaleString('fa-IR') : '—';
function JsonView({ value }: { value: unknown }) { return <pre dir="ltr" className="admin-json">{JSON.stringify(value, null, 2)}</pre>; }

export function AdminNutritionSnapshot({ saved }: { saved: AdminSavedSnapshot | null }) {
  if (!saved) return <div className="admin-card">برای این روز نسخهٔ کامل برنامه ذخیره نشده است. کاربر باید نسخهٔ جدید اپ را باز کند؛ برنامهٔ قدیمی را بازسازی یا حدس نمی‌زنیم.</div>;
  const snap = saved.snapshot;
  if (!canRenderSnapshot(snap)) return <p role="alert">ساختار نسخهٔ ذخیره‌شده پشتیبانی نمی‌شود.</p>;
  const meals = snap.plan.meals;
  const sum = (consumedOnly: boolean): MacroTargets => meals.filter(m => !consumedOnly || m.consumed).reduce((a,m) => ({ targetCalories:a.targetCalories+m.totalKcal, proteinGrams:a.proteinGrams+m.totalProtein, carbGrams:a.carbGrams+m.totalCarbs, fatGrams:a.fatGrams+m.totalFat, proteinCal:0,carbCal:0,fatCal:0 }), { targetCalories:0,proteinGrams:0,carbGrams:0,fatGrams:0,proteinCal:0,carbCal:0,fatCal:0 });
  const total = sum(false);
  return <><p className="admin-note">آخرین همگام‌سازی: {dateTime(saved.updated_at)} · نسخه {number(saved.revision)} · نمای فقط‌خواندنی آخرین گزارش اپ؛ نه اتصال زنده به صفحهٔ کاربر.</p><div className="admin-plan"><MacroSummary targets={snap.targets} consumed={sum(true)} planned={total} isWorkoutDay={snap.isWorkoutDay} /><div className="admin-card">جمع کل برنامه: {number(Math.round(total.targetCalories))} کالری · پروتئین {number(Math.round(total.proteinGrams))} · کربوهیدرات {number(Math.round(total.carbGrams))} · چربی {number(Math.round(total.fatGrams))} گرم</div><NutritionQualitySummary quality={evaluateDailyFoodQuality(meals, snap.targets.targetCalories)} />{meals.map(m => <MealCard key={m.slot} meal={m} readOnly onToggleConsumed={() => {}} onSwapComponent={() => {}} />)}</div><details><summary>دادهٔ کامل برنامه و ورودی محاسبات در زمان ثبت</summary><JsonView value={snap} /></details></>;
}
