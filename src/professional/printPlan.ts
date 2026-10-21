import { mealDescription, roundFa, type PrintedPlan } from "./menuPlan.ts";
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function printedPlanHtml(p: PrintedPlan, origin: string): string {
  return (
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>برنامه غذایی ' +
    escape(p.display_name) +
    "</title><style>" +
    '@font-face{font-family:Behtan;src:url("' +
    escape(origin) +
    '/fonts/IRANSansX-Regular.woff") format("woff");font-weight:400}@font-face{font-family:Behtan;src:url("' +
    escape(origin) +
    '/fonts/IRANSansX-Bold.woff") format("woff");font-weight:700}' +
    "@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:11px/1.9 Behtan,sans-serif;color:#172d25;margin:0}header{border-bottom:2px solid #176b50;padding-bottom:12px;margin-bottom:16px}h1{font-size:22px;margin:0}h2{font-size:17px;margin:12px 0}h3{font-size:13px;margin:12px 0 4px}p{margin:5px 0}.meta{color:#53665c}.targets{padding:10px;background:#edf5ef;border-radius:8px}table{width:100%;border-collapse:collapse;margin-bottom:10px}td,th{border:1px solid #d6e0d9;padding:7px;text-align:right;vertical-align:top}th{background:#edf5ef;font-weight:700}td:first-child{width:11%;white-space:nowrap}tbody tr:nth-child(even){background:#f5f8f5}tr{break-inside:avoid}thead{display:table-header-group}h2,h3{break-after:avoid}.day+.day{break-before:page}.macros{display:block;color:#54665b;font-size:9px}.notes{white-space:pre-wrap;border-right:3px solid #176b50;padding-right:10px}.footer{border-top:1px solid #d6e0d9;margin-top:16px;padding-top:8px;color:#66756c;font-size:9px}" +
    "</style></head><body><header><h1>به‌تن | برنامه غذایی</h1><p>" +
    escape(p.display_name) +
    '</p><p class="meta">تاریخ: ' +
    escape(new Date(p.date + "T12:00:00").toLocaleDateString("fa-IR")) +
    " · نسخه اطلاعات: " +
    roundFa(p.intake_revision) +
    "</p></header>" +
    p.days
      .map(
        (d) =>
          '<section class="day"><h2>' +
          (d.workout ? "روزهای تمرین" : "روزهای استراحت") +
          '</h2><p class="targets">هدف روزانه: ' +
          roundFa(d.targets.targetCalories) +
          " کیلوکالری · پروتئین " +
          roundFa(d.targets.proteinGrams) +
          " گرم · کربوهیدرات " +
          roundFa(d.targets.carbGrams) +
          " گرم · چربی " +
          roundFa(d.targets.fatGrams) +
          " گرم</p><p>از هر وعده فقط یک منو انتخاب کنید. مقدار هر ماده همراه با واحد خانگی و گرم نوشته شده است.</p>" +
          d.slots
            .map(
              (s) =>
                "<h3>" +
                escape(s.label) +
                "</h3><table><thead><tr><th>منو</th><th>مواد و مقدار مصرف</th></tr></thead><tbody>" +
                s.options
                  .map(
                    (m, i) =>
                      "<tr><td>" +
                      roundFa(i + 1) +
                      "</td><td>" +
                      escape(mealDescription(m)) +
                      '<span class="macros">' +
                      roundFa(m.totalKcal) +
                      " کیلوکالری · پروتئین " +
                      roundFa(m.totalProtein) +
                      " · کربوهیدرات " +
                      roundFa(m.totalCarbs) +
                      " · چربی " +
                      roundFa(m.totalFat) +
                      " گرم</span></td></tr>",
                  )
                  .join("") +
                "</tbody></table>",
            )
            .join("") +
          "</section>",
      )
      .join("") +
    (p.notes
      ? '<h3>توضیحات برنامه</h3><p class="notes">' + escape(p.notes) + "</p>"
      : "") +
    '<p class="footer">برنامه با موتور تغذیه به‌تن و بر اساس اطلاعات ثبت‌شده ساخته شده است. در هر وعده یک گزینه مصرف شود. تعداد گزینه‌ها به ترکیب‌های مجاز کاتالوگ بستگی دارد.</p></body></html>'
  );
}
export async function printSavedPlan(p: PrintedPlan): Promise<void> {
  const popup = window.open("", "_blank");
  if (!popup)
    throw new Error(
      "برای خروجی PDF، اجازه بازشدن پنجره چاپ را در مرورگر فعال کنید.",
    );
  popup.opener = null;
  popup.document.open();
  popup.document.write(printedPlanHtml(p, window.location.origin));
  popup.document.close();
  await popup.document.fonts.ready;
  popup.focus();
  popup.print();
}
