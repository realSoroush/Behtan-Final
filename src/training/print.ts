import type { TrainingPlan } from "./types.ts";
import { WEEKDAYS, EQUIPMENT } from "./engine.ts";
const esc = (x: unknown) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fa = (x: number) => x.toLocaleString("fa-IR");
export const guideUrl = (id: string) =>
  "https://pro.behtan.fit/?exercise=" + encodeURIComponent(id);
export function trainingHtml(p: TrainingPlan, origin: string): string {
  // Only a validated http(s) origin is interpolated into asset URLs.
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol))
    throw new Error("Invalid origin");
  const o = esc(base.origin);
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>برنامه تمرینی ${esc(p.display_name)}</title><style>
 @font-face{font-family:Behtan;src:url("${o}/fonts/IRANSansX-Regular.woff")}@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font:11px/1.9 Behtan,sans-serif;color:#152e25;margin:0}h1{font-size:23px}h2{font-size:17px}h3{font-size:14px;margin:8px 0 4px}p{margin:5px 0}header{border-bottom:2px solid #13815d;padding-bottom:10px}small,.muted{color:#526b60}.week{break-before:page}.session{break-inside:avoid}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #d7e7dc;text-align:right;padding:7px}th{background:#eff7f1}tr{break-inside:avoid}thead{display:table-header-group}.pill{padding:8px 12px;background:#eff7f1;border-radius:8px}.guide{break-before:page}.move{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #d7e7dc;break-inside:avoid}.move h3{margin:0 0 4px}.move p{margin:3px 0}.move img{width:95px;height:95px;object-fit:contain}.move img.qr{width:74px;height:74px}a{color:#14684e;font-size:9px;overflow-wrap:anywhere}.notes li{margin:8px 0}h2,h3{break-after:avoid}</style></head><body>
 <header><h1>به‌تن | برنامه تمرینی</h1><h2>${esc(p.display_name)}</h2><p>شروع ${esc(new Date(p.input.start_date + "T12:00:00Z").toLocaleDateString("fa-IR", { timeZone: "UTC" }))} · چهار هفته · نسخه اطلاعات ${fa(p.intake_revision)}</p></header>
 <p class="pill">${p.input.location === "home" ? "خانه" : "باشگاه"} · ${fa(p.input.days.length)} جلسه در هفته · ${fa(p.input.minutes)} دقیقه زمان در دسترس</p>
 <p>تجهیزات: ${p.input.equipment.map((e) => esc(EQUIPMENT[e])).join("، ")}</p><h2>آرام شروع کن، قابل‌ادامه بساز.</h2><ul class="notes">${p.notes.map((n) => "<li>" + esc(n) + "</li>").join("")}</ul>
 ${p.weeks.map((w) => `<section class="week"><h2>هفته ${fa(w.week)}</h2>${w.sessions.map((s) => `<section class="session"><h3>${WEEKDAYS[s.day]} ${esc(new Date(s.date + "T12:00:00Z").toLocaleDateString("fa-IR", { timeZone: "UTC" }))} · ${esc(s.title)} · حدود ${fa(s.estimated_minutes)} دقیقه</h3><table><thead><tr><th>حرکت</th><th>ست × تکرار</th><th>استراحت</th><th>تکرار ذخیره</th></tr></thead><tbody>${s.lines.map((l) => `<tr><td>${esc(l.exercise.name)}</td><td>${fa(l.sets)} × ${fa(l.reps[0])} تا ${fa(l.reps[1])}${l.per_side ? " هر سمت" : ""}</td><td>${fa(l.rest_seconds)} ثانیه</td><td>${fa(l.rir)}</td></tr>`).join("")}</tbody></table></section>`).join("")}</section>`).join("")}
 <section class="guide"><h2>راهنمای حرکات</h2><p>کد هر حرکت را اسکن کن یا لینک را باز کن تا آموزش متحرک را ببینی. این لینک‌ها حاوی اطلاعات شخصی نیستند.</p>${[...new Map(p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.lines.map((l) => [l.exercise.id, l.exercise] as const)))).values()].map((e) => `<section class="move"><img src="${o}${esc(e.poster)}" alt="${esc(e.name)}"><div><h3>${esc(e.name)}</h3>${e.cues.map((c) => "<p>" + esc(c) + "</p>").join("")}<a href="${esc(guideUrl(e.id))}">${esc(guideUrl(e.id))}</a></div><img class="qr" src="${o}/training/qr/${esc(e.id)}.png" alt="کد آموزش"></section>`).join("")}</section>
 <footer><p class="muted">نسخه موتور ${esc(p.engine)} · ACSM 2026 / WHO 2020 · این خروجی پس از بازبینی پنل صادر شده است.</p></footer></body></html>`;
}
export async function printTraining(p: TrainingPlan) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("اجازه بازشدن پنجره چاپ را فعال کن.");
  win.opener = null;
  let timer: number | undefined;
  try {
    win.document.open();
    win.document.write(trainingHtml(p, window.location.origin));
    win.document.close();
    const preparation = (async () => {
      await win.document.fonts.ready;
      await Promise.all([...win.document.images].map((i) => i.decode()));
      return true;
    })();
    const closedOrTimeout = new Promise<boolean>((resolve, reject) => {
      const deadline = Date.now() + 15000;
      timer = window.setInterval(() => {
        if (win.closed) resolve(false);
        else if (Date.now() > deadline)
          reject(
            new Error(
              "آماده‌سازی تصاویر چاپ کامل نشد؛ اتصال را بررسی و دوباره تلاش کن.",
            ),
          );
      }, 100);
    });
    const ready = await Promise.race([preparation, closedOrTimeout]);
    if (!ready || win.closed) return;
    win.focus();
    win.print();
  } catch (e) {
    if (win.closed) return;
    win.close();
    throw new Error(
      e instanceof Error && e.message.includes("آماده‌سازی")
        ? e.message
        : "تصاویر چاپ بارگیری نشدند؛ اتصال را بررسی و دوباره تلاش کن.",
    );
  } finally {
    if (timer !== undefined) window.clearInterval(timer);
  }
}
