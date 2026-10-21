import { mealDescription, roundFa, type PrintedPlan } from "./menuPlan";
export function PlanPreview({ plan: p }: { plan: PrintedPlan }) {
  return (
    <article className="pro-plan-preview">
      <h3>برنامه {p.display_name}</h3>
      <p className="pro-muted">
        نسخه اطلاعات {roundFa(p.intake_revision)} · از هر وعده فقط یک منو انتخاب
        شود.
      </p>
      {p.days.map((d) => (
        <section key={String(d.workout)}>
          <h3>{d.workout ? "روزهای تمرین" : "روزهای استراحت"}</h3>
          <p className="pro-targets">
            هدف روزانه: {roundFa(d.targets.targetCalories)} کیلوکالری · پروتئین{" "}
            {roundFa(d.targets.proteinGrams)} · کربوهیدرات{" "}
            {roundFa(d.targets.carbGrams)} · چربی {roundFa(d.targets.fatGrams)}{" "}
            گرم
          </p>
          {d.slots.map((s) => (
            <section key={s.slot}>
              <h4>
                {s.label} <small>({roundFa(s.options.length)} منو)</small>
              </h4>
              <ol>
                {s.options.map((m) => (
                  <li key={m.templateId}>
                    <p>{mealDescription(m)}</p>
                    <small>
                      {roundFa(m.totalKcal)} کیلوکالری · پروتئین{" "}
                      {roundFa(m.totalProtein)} · کربوهیدرات{" "}
                      {roundFa(m.totalCarbs)} · چربی {roundFa(m.totalFat)} گرم
                    </small>
                  </li>
                ))}
              </ol>
              {s.options.length < p.requested_menus && (
                <p className="pro-muted">
                  برای این وعده {roundFa(s.options.length)} گزینه سازگار پیدا
                  شد.
                </p>
              )}
            </section>
          ))}
        </section>
      ))}
      {p.notes && <p className="pro-plan-notes">{p.notes}</p>}
    </article>
  );
}
