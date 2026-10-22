import { issueLabels, viewLabels, type BodyReport } from "./contracts";
export function reportMetrics(r: BodyReport) {
  const fa = (n: number | null) =>
    n === null
      ? "ثبت نشده"
      : n.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
  return [
    ["وزن", fa(r.weight_kg) + " کیلوگرم", "ثبت‌شده در پرونده"],
    ["قد", fa(r.height_cm) + " سانتی‌متر", "ثبت‌شده در پرونده"],
    ["BMI", fa(r.bmi), "محاسبه از قد و وزن؛ شاخص ترکیب بدن نیست"],
    [
      "دور کمر",
      r.measurements.waist_cm
        ? fa(r.measurements.waist_cm) + " سانتی‌متر"
        : "ثبت نشده",
      "اندازه واردشده توسط متخصص",
    ],
    [
      "دور باسن",
      r.measurements.hip_cm
        ? fa(r.measurements.hip_cm) + " سانتی‌متر"
        : "ثبت نشده",
      "اندازه واردشده توسط متخصص",
    ],
    [
      "نسبت کمر به قد",
      fa(r.waist_height_ratio),
      "محاسبه از اندازه‌های ثبت‌شده",
    ],
    ["نسبت کمر به باسن", fa(r.waist_hip_ratio), "محاسبه از اندازه‌های ثبت‌شده"],
    [
      "درصد چربی",
      r.measurements.body_fat_pct !== undefined
        ? fa(r.measurements.body_fat_pct) + "٪"
        : "اندازه‌گیری نشده",
      r.measurements.body_fat_pct !== undefined
        ? "ورودی متخصص · " + r.measurements.body_fat_method?.toUpperCase()
        : "از عکس تخمین زده نشده",
    ],
    [
      "توده چربی",
      r.fat_mass_kg === null
        ? "اندازه‌گیری نشده"
        : fa(r.fat_mass_kg) + " کیلوگرم",
      "محاسبه از وزن و درصد چربی واردشده",
    ],
    [
      "توده بدون چربی",
      r.fat_free_mass_kg === null
        ? "اندازه‌گیری نشده"
        : fa(r.fat_free_mass_kg) + " کیلوگرم",
      "شامل عضله، آب، استخوان و سایر بافت‌ها؛ معادل توده عضله نیست",
    ],
  ];
}
export function BodyReportView({ report: r }: { report: BodyReport }) {
  return (
    <section className="body-report">
      <p className="pro-section-kicker">گزارش تصویری و اندازه‌های بدن</p>
      <h3>تصویری روشن‌تر از اطلاعات مراجع</h3>
      <p className="pro-muted">
        {new Date(r.created_at).toLocaleDateString("fa-IR")} · نسخه اطلاعات{" "}
        {r.intake_revision.toLocaleString("fa-IR")} ·{" "}
        {r.photo_count.toLocaleString("fa-IR")} نما
      </p>
      <div className="body-metrics">
        {reportMetrics(r).map(([label, value, source]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{source}</span>
          </article>
        ))}
      </div>
      <h4>کیفیت نماها · بررسی هوش مصنوعی</h4>
      <ul className="body-photo-quality">
        {r.photos.map((p) => (
          <li key={p.view}>
            <strong>{viewLabels[p.view]}</strong>
            <span>
              {p.usable
                ? "مناسب برای ثبت تصویری"
                : p.issues.length
                  ? p.issues.map((i) => issueLabels[i]).join("، ")
                  : "نیازمند عکس واضح‌تر"}
            </span>
          </li>
        ))}
      </ul>
      <p className="pro-muted">
        این گزارش بازسازی سه‌بعدی یا آزمایش ترکیب بدن نیست. آب بدن، چربی احشایی،
        توده عضله، سن زیستی و امپدانس از عکس قابل اندازه‌گیری نیستند. داده‌های
        تصویری، کالری و ماکروهای رژیم را تغییر نمی‌دهند.
      </p>
      <small>
        پردازش تصویر: OpenAI · <bdi>{r.model}</bdi> · گزارش نیازمند بازبینی
        متخصص
      </small>
    </section>
  );
}
