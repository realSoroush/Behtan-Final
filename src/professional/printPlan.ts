import { mealDescription, roundFa, type PrintedPlan } from './menuPlan.ts';
import { specialistHtml, type SpecialistIdentity } from './specialistProfile.ts';

const escape = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
);

export function printedPlanHtml(p: PrintedPlan, origin: string, specialist?: SpecialistIdentity): string {
  const days = p.days.map(day => {
    const title = day.workout ? 'روزهای تمرین' : 'روزهای استراحت';
    const targets = day.targets;
    const meals = day.slots.map(slot => `
      <table class="meal-table">
        <thead>
          <tr class="meal-title"><th colspan="2"><h3>${escape(slot.label)} <small>${title}</small></h3></th></tr>
          <tr><th scope="col">منو</th><th scope="col">مواد و مقدار مصرف</th></tr>
        </thead>
        <tbody>${slot.options.map((meal, index) => `
          <tr><th scope="row">${roundFa(index + 1)}</th><td>${escape(mealDescription(meal))}
            <span class="macros">${roundFa(meal.totalKcal)} کیلوکالری · پروتئین ${roundFa(meal.totalProtein)} · کربوهیدرات ${roundFa(meal.totalCarbs)} · چربی ${roundFa(meal.totalFat)} گرم</span>
          </td></tr>`).join('')}
        </tbody>
      </table>`).join('');
    return `<section class="day">
      <div class="day-intro"><h2>${title}</h2>
        <p class="targets">هدف روزانه: ${roundFa(targets.targetCalories)} کیلوکالری · پروتئین ${roundFa(targets.proteinGrams)} گرم · کربوهیدرات ${roundFa(targets.carbGrams)} گرم · چربی ${roundFa(targets.fatGrams)} گرم</p>
      </div>${meals}
    </section>`;
  }).join('');

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
      h2{font-size:17px;margin:12px 0 4px;break-after:avoid}
      h3{font-size:13px;margin:0;break-after:avoid}
      h3 small{font-size:9px;color:#53665c;font-weight:400;margin-inline-start:8px}
      p{margin:4px 0}
      .meta{color:#53665c}
      .targets{padding:6px 8px;background:#edf5ef;border-radius:6px}
      .day-intro{margin-bottom:8px;break-inside:avoid;break-after:avoid}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      td,th{border:1px solid #d6e0d9;padding:5px 7px;text-align:right;vertical-align:top;overflow-wrap:anywhere}
      thead{display:table-header-group}
      thead th{background:#edf5ef}
      .meal-table{break-inside:avoid}
      .meal-table th[scope=row]{width:9%;white-space:nowrap}
      tbody tr:nth-child(even){background:#f5f8f5}
      tr{break-inside:avoid}
      .macros{display:block;color:#54665b;font-size:9px}
      .notes{white-space:pre-wrap;overflow-wrap:anywhere;border-right:3px solid #176b50;padding-right:10px}
      .footer{border-top:1px solid #d6e0d9;margin-top:12px;padding-top:6px;color:#66756c;font-size:9px;break-inside:avoid}
      @media print{.document-header{padding-top:12mm}}
      @media screen{body{max-width:900px;margin:auto;padding:20px}}
    </style></head><body>
      <header class="document-header"><h1>به‌تن | برنامه غذایی</h1><p>${escape(p.display_name)}</p>
        <p class="meta">تاریخ: ${escape(new Date(p.date + 'T12:00:00').toLocaleDateString('fa-IR'))} · نسخه اطلاعات: ${roundFa(p.intake_revision)}</p>
      </header>${specialistHtml(specialist)}
      <p>از هر وعده فقط یک منو انتخاب کنید. مقدارها به گرم و در صورت وجود، با واحد خانگی هم نوشته شده‌اند.</p>
      ${days}
      ${p.notes ? '<h2>توضیحات برنامه</h2><p class="notes">' + escape(p.notes) + '</p>' : ''}
      <p class="footer">این برنامه با موتور تغذیه به‌تن و بر اساس اطلاعات ثبت‌شده ساخته شده است.</p>
    </body></html>`;
}

export async function printSavedPlan(p: PrintedPlan): Promise<void> {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('برای خروجی PDF، اجازه بازشدن پنجره چاپ را در مرورگر فعال کنید.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(printedPlanHtml(p, window.location.origin));
  popup.document.close();
  await popup.document.fonts.ready;
  popup.focus();
  popup.print();
}
