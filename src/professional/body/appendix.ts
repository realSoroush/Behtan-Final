import { issueLabels, viewLabels, type BodyReport } from "./contracts.ts";
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fa = (n: number | null | undefined) =>
  n == null
    ? "ثبت نشده"
    : n.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
export function bodyAppendixHtml(r: BodyReport) {
  const m = r.measurements;
  const metrics = [
    ["وزن", fa(r.weight_kg) + " کیلوگرم", "ورودی پرونده"],
    ["قد", fa(r.height_cm) + " سانتی‌متر", "ورودی پرونده"],
    ["BMI", fa(r.bmi), "محاسبه از قد و وزن"],
    ["دور کمر", fa(m.waist_cm), "سانتی‌متر · ورودی متخصص"],
    ["دور باسن", fa(m.hip_cm), "سانتی‌متر · ورودی متخصص"],
    ["نسبت کمر به قد", fa(r.waist_height_ratio), "محاسبه از اندازه‌ها"],
    ["نسبت کمر به باسن", fa(r.waist_hip_ratio), "محاسبه از اندازه‌ها"],
    [
      "درصد چربی",
      m.body_fat_pct == null ? "اندازه‌گیری نشده" : fa(m.body_fat_pct) + "٪",
      m.body_fat_method
        ? "ورودی متخصص · " + m.body_fat_method.toUpperCase()
        : "از تصویر تخمین زده نشده",
    ],
    [
      "توده چربی",
      r.fat_mass_kg == null
        ? "اندازه‌گیری نشده"
        : fa(r.fat_mass_kg) + " کیلوگرم",
      "محاسبه از وزن و درصد چربی ثبت‌شده",
    ],
    [
      "توده بدون چربی",
      r.fat_free_mass_kg == null
        ? "اندازه‌گیری نشده"
        : fa(r.fat_free_mass_kg) + " کیلوگرم",
      "معادل توده عضله نیست",
    ],
  ];
  return (
    '<section class="body-appendix" style="break-before:page"><header><h1>به‌تن | گزارش تصویری و اندازه‌های بدن</h1><p class="meta">' +
    esc(new Date(r.created_at).toLocaleDateString("fa-IR")) +
    " · نسخه اطلاعات " +
    fa(r.intake_revision) +
    " · " +
    fa(r.photo_count) +
    " نما · بازبینی‌شده توسط متخصص</p></header><p>این گزارش، اندازه‌های ثبت‌شده و کیفیت نماهای تصویری را کنار هم قرار می‌دهد؛ بازسازی سه‌بعدی یا نتیجه دستگاه سنجش ترکیب بدن نیست.</p><table><thead><tr><th>شاخص</th><th>مقدار</th><th>منبع</th></tr></thead><tbody>" +
    metrics
      .map(
        (row) =>
          "<tr>" + row.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>",
      )
      .join("") +
    "</tbody></table><h2>کیفیت ثبت تصاویر</h2><table><thead><tr><th>نما</th><th>بررسی هوش مصنوعی</th></tr></thead><tbody>" +
    r.photos
      .map(
        (p) =>
          "<tr><td>" +
          esc(viewLabels[p.view]) +
          "</td><td>" +
          esc(
            p.usable
              ? "مناسب برای ثبت تصویری"
              : p.issues.length
                ? p.issues.map((i) => issueLabels[i]).join("، ")
                : "نیازمند عکس واضح‌تر",
          ) +
          "</td></tr>",
      )
      .join("") +
    '</tbody></table><p class="notes">آب بدن، امپدانس، چربی احشایی، سن زیستی و توده عضله از این تصاویر اندازه‌گیری نشده‌اند. توده بدون چربی شامل آب، عضله، استخوان و سایر بافت‌هاست. این گزارش کالری و ماکروهای رژیم را تغییر نمی‌دهد.</p><p class="footer">پردازش تصویر: OpenAI · ' +
    esc(r.model) +
    " · عکس‌ها در این فایل درج نشده‌اند.</p></section>"
  );
}
