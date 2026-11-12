import { mealDescription, roundFa, type PrintedPlan } from './menuPlan.ts';
import { specialistHtml, type SpecialistIdentity } from './specialistProfile.ts';
import { nutritionMealSections, nutritionTargetRows } from './nutritionPresentation.ts';
import { showPrintLoading } from '../utils/printLoading.ts';

const escape = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
);

export function printedPlanHtml(p: PrintedPlan, origin: string, specialist?: SpecialistIdentity): string {
  const targetRows = nutritionTargetRows(p.days).map(({ label, targets }) => `
    <p class="targets">${label ? label + ' · ' : ''}هدف روزانه: ${roundFa(targets.targetCalories)} کیلوکالری · پروتئین ${roundFa(targets.proteinGrams)} گرم · کربوهیدرات ${roundFa(targets.carbGrams)} گرم · چربی ${roundFa(targets.fatGrams)} گرم</p>`).join('');
  const meals = nutritionMealSections(p).map(section => `
    <table class="meal-table">
      <thead><tr><th colspan="2"><h2>${escape(section.label)}</h2></th></tr></thead>
      ${section.groups.map(group => `
        <tbody>
          ${group.label ? `<tr class="day-label"><th colspan="2" scope="rowgroup">${escape(group.label)}</th></tr>` : ''}
          ${group.options.map((meal, index) => `
          <tr><th scope="row">${roundFa(index + 1)}</th><td>${escape(mealDescription(meal))}</td></tr>`).join('')}</tbody>
      `).join('')}
    </table>`).join('');

  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
    <title>برنامه غذایی ${escape(p.display_name)}</title><style>
      @font-face{font-display:swap;font-family:Behtan;src:url("${escape(origin)}/fonts/IRANSansX-Regular.woff") format("woff");font-weight:400}
      @font-face{font-display:swap;font-family:Behtan;src:url("${escape(origin)}/fonts/IRANSansX-Bold.woff") format("woff");font-weight:700}
      @page{size:A4;margin:12mm 13mm}
      @page :first{margin-top:0;margin-bottom:0}
      *{box-sizing:border-box}
      body{font:11px/1.65 Behtan,sans-serif;color:#172d25;margin:0}
      header{border-bottom:2px solid #176b50;padding-bottom:8px;margin-bottom:10px}
      h1{font-size:22px;margin:0}
      h2{font-size:13px;margin:10px 0 4px;break-after:avoid}
      p{margin:4px 0}
      .meta{color:#53665c}
      .targets{padding:6px 8px;background:#edf5ef;border-radius:6px}
      table{width:100%;border-collapse:collapse;margin-bottom:4px}
      td,th{border-bottom:1px solid #d6e0d9;padding:4px 6px;text-align:right;vertical-align:top;overflow-wrap:anywhere}
      thead{display:table-header-group}
      thead th{background:#edf5ef}
      .meal-table{margin-block:8px}
      .meal-table h2{margin:0}
      .meal-table tbody{break-inside:avoid}
      .meal-table th[scope=row]{width:7%;white-space:nowrap}
      .day-label{color:#53665c;font-size:10px;break-after:avoid}
      tbody tr:nth-child(even){background:#f5f8f5}
      tr{break-inside:avoid}
      .notes{white-space:pre-wrap;overflow-wrap:anywhere;border-right:3px solid #176b50;padding-right:10px}
      .footer{border-top:1px solid #d6e0d9;margin-top:12px;padding-top:6px;color:#66756c;font-size:9px;break-inside:avoid}
      @media print{.document-header{padding-top:12mm}}
      @media screen{body{max-width:900px;margin:auto;padding:20px}}
    </style></head><body>
      <header class="document-header"><h1>به‌تن | برنامه غذایی</h1><p>${escape(p.display_name)}</p>
        <p class="meta">تاریخ: ${escape(new Date(p.date + 'T12:00:00').toLocaleDateString('fa-IR'))} · نسخه اطلاعات: ${roundFa(p.intake_revision)}</p>
      </header>${specialistHtml(specialist)}
      <p>برای هر وعده یک منو انتخاب کنید. اگر نوع روز مشخص شده، از گزینه‌های همان روز استفاده کنید.</p>
      ${targetRows}${meals}
      ${p.notes ? '<h2>توضیحات برنامه</h2><p class="notes">' + escape(p.notes) + '</p>' : ''}
      <p class="footer">این برنامه با موتور تغذیه به‌تن و بر اساس اطلاعات ثبت‌شده ساخته شده است.</p>
    </body></html>`;
}

export async function printSavedPlan(p: PrintedPlan, org: string, planId: string): Promise<void> {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('برای خروجی PDF، اجازه بازشدن پنجره چاپ را در مرورگر فعال کنید.');
  popup.opener = null;
  showPrintLoading(popup, window.location.origin);
  try {
    const { specialistApi } = await import('./specialistApi');
    const specialist = await specialistApi.forPlan(org, 'nutrition', planId);
    popup.document.open();
    popup.document.write(printedPlanHtml(p, window.location.origin, specialist));
    popup.document.close();
    await Promise.race([popup.document.fonts.ready, new Promise(resolve => setTimeout(resolve, 4000))]);
    popup.focus();
    popup.print();
  } catch (error) {
    popup.close();
    throw error;
  }
}
