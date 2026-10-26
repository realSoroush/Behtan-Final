import { lineDescription, nutritionTotals, dayLabel, trainingGroups, groupLabel, fa, type FoodSnapshot, type TrainingPrescription, type NutritionTotals } from './studioModel.ts';
export interface AuthoredLine {
  name: string;
  details: string;
  training?: TrainingPrescription;
  food?: FoodSnapshot;
}
export interface AuthoredSection {
  title: string;
  lines: AuthoredLine[];
  nutritionDay?: string;
}
export interface AuthoredContent {
  version: 1;
  title: string;
  notes: string;
  reviewed: boolean;
  sections: AuthoredSection[];
  nutritionTargets?: Record<string, NutritionTotals>;
}
export interface AuthoredSnapshot {
  id: string;
  kind: "nutrition" | "training";
  content: AuthoredContent;
  intake_revision: number;
  recorded_at: string;
  display_name?: string;
}
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function authoredHtml(content: AuthoredContent, name: string, kind: string, origin: string) {
  const multipleDays = new Set(content.sections.map(s => s.nutritionDay || 'daily')).size > 1;
  const sections = content.sections.map(section => {
    const heading = kind === 'nutrition' && multipleDays ? dayLabel(section.nutritionDay || 'daily') + ' · ' + section.title : section.title;
    const row = (line: AuthoredLine) => `<tr><td>${esc(line.name)}</td><td>${esc(lineDescription(line))}</td></tr>`;
    const rows = kind === 'training'
      ? trainingGroups(section).map((group, i) => {
          const label = section.lines[group.indices[0]]?.training ? `<tr><th colspan="2">${esc(groupLabel(group.kind))} ${i + 1}</th></tr>` : '';
          return label + group.indices.map(j => row(section.lines[j])).join('');
        }).join('')
      : section.lines.map(row).join('');
    return `<section><h2>${esc(heading)}</h2><table><thead><tr><th>${kind === 'training' ? 'حرکت' : 'مواد غذایی'}</th><th>${kind === 'training' ? 'ست، تکرار و توضیحات' : 'مقدار و توضیحات'}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
  const totals = kind === 'nutrition' ? [...new Set(content.sections.map(s => s.nutritionDay || 'daily'))].map(key => {
    const daily = content.sections.filter(s => (s.nutritionDay || 'daily') === key), total = nutritionTotals(daily);
    if (!daily.some(s => s.lines.some(l => l.food))) return '';
    return `<p class="totals">${esc(dayLabel(key))} · ${fa(total.kcal)} کالری · پروتئین ${fa(total.protein)} · کربوهیدرات ${fa(total.carbs)} · چربی ${fa(total.fat)} گرم${daily.some(s => s.lines.some(l => !l.food)) ? ' · سطرهای متنی در جمع محاسبه نشده‌اند' : ''}</p>`;
  }).join('') : '';
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(content.title)}</title><style>
    @font-face{font-family:Behtan;src:url("${esc(origin)}/fonts/IRANSansX-Regular.woff")}
    @page{size:A4;margin:15mm}body{font:12px/2 Behtan,sans-serif;color:#193e33}
    header{border-bottom:2px solid #227153;margin-bottom:25px;padding-bottom:16px}h1{font-size:23px}h2{font-size:17px;break-after:avoid}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}thead{display:table-header-group}td,th{border:1px solid #d7e3dc;padding:10px;text-align:right;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#edf4ed}tr{break-inside:avoid}
    p{white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:#64736b;font-size:10px}.notes{border-right:3px solid #227153;padding-right:12px}.totals{padding:12px;border:1px solid #d7e3dc;break-inside:avoid}
    </style></head><body><header><h1>به‌تن | ${esc(content.title)}</h1><p>${esc(name)}</p><p class="meta">${kind === 'training' ? 'برنامه تمرینی' : 'برنامه تغذیه'} · تدوین و تأیید توسط متخصص</p></header>
    ${sections}${totals}${content.notes ? `<p class="notes">${esc(content.notes)}</p>` : ''}
    <p class="meta">نسخهٔ تأییدشدهٔ متخصص${kind === 'nutrition' ? '؛ مقادیر غذایی از نسخهٔ کاتالوگ هنگام تدوین محاسبه شده‌اند. سطرهای متنی محاسبهٔ تغذیه ندارند.' : '؛ ارتباط گروه‌ها و دستورهای تمرینی در نسخهٔ ثبت‌شده حفظ شده‌اند.'}</p></body></html>`;
}
export async function printAuthored(p: AuthoredSnapshot, name: string) {
  const w = window.open("", "_blank");
  if (!w)
    throw new Error("پنجره چاپ مسدود شد؛ اجازهٔ بازشدن پنجره را فعال کنید.");
  w.opener = null;
  w.document.open();
  w.document.write(
    authoredHtml(
      p.content,
      p.display_name ?? name,
      p.kind,
      window.location.origin,
    ),
  );
  w.document.close();
  await Promise.race([w.document.fonts.ready, new Promise(resolve => setTimeout(resolve, 4000))]);
  w.focus();
  w.print();
}
