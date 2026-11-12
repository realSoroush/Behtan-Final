import { mealDescription, roundFa, type PrintedPlan } from "./menuPlan";
import { nutritionMealSections, nutritionTargetRows } from './nutritionPresentation';
export function PlanPreview({ plan: p }: { plan: PrintedPlan }) {
  return (
    <article className="pro-plan-preview">
      <h3>برنامه {p.display_name}</h3>
      <p className="pro-muted">
        نسخه اطلاعات {roundFa(p.intake_revision)} · از هر وعده یک منو انتخاب کنید. اگر نوع روز مشخص شده، از گزینه‌های همان روز استفاده کنید.
      </p>
      {nutritionTargetRows(p.days).map(({ label, targets }) => (
        <p key={label ?? 'daily'} className="pro-targets">
          {label && `${label} · `}هدف روزانه: {roundFa(targets.targetCalories)} کیلوکالری · پروتئین{' '}
          {roundFa(targets.proteinGrams)} · کربوهیدرات {roundFa(targets.carbGrams)} · چربی {roundFa(targets.fatGrams)} گرم
        </p>
      ))}
      {nutritionMealSections(p).map(({ slot, label, groups }) => (
        <section key={slot} className="pro-plan-meal">
          <h4>{label}</h4>
          {groups.map(group => (
            <div key={group.label ?? 'daily'}>
              {group.label && <h5 className="pro-plan-day-label">{group.label}</h5>}
              <ol>{group.options.map((meal, index) => (
                <li key={`${meal.templateId}:${index}`}><p>{mealDescription(meal)}</p></li>
              ))}</ol>
              {group.options.length < p.requested_menus && (
                <p className="pro-muted">برای این وعده {roundFa(group.options.length)} گزینه سازگار پیدا شد.</p>
              )}
            </div>
          ))}
        </section>
      ))}
      {p.notes && <p className="pro-plan-notes">{p.notes}</p>}
    </article>
  );
}
