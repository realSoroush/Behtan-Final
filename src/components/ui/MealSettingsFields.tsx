import { PanelSelect } from './PanelSelect';
import type { MealSettings } from '../../utils/mealSettings';
export function MealSettingsFields({ value, onChange, disabled = false }: {
  value: MealSettings; onChange: (value: MealSettings) => void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="space-y-3">
    <legend>چیدمان وعده‌ها</legend>
    <label>تعداد وعده‌های عادی <PanelSelect aria-label="تعداد وعده‌های عادی" value={value.regularMeals}
      onChange={e => onChange({ ...value, regularMeals: Number(e.target.value) })}>
      {[3, 4, 5, 6].map(n => <option key={n} value={n}>{n.toLocaleString('fa-IR')}</option>)}
    </PanelSelect></label>
    <label><input type="checkbox" checked={value.includePostWorkout}
      onChange={e => onChange({ ...value, includePostWorkout: e.target.checked })}/> وعدهٔ جداگانه پس از تمرین</label>
    <p className="text-xs">هدف کل روز ثابت می‌ماند و بین وعده‌های انتخاب‌شده تقسیم می‌شود.</p>
  </fieldset>;
}
