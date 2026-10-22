export interface AuthoredContent {
  version: 1;
  title: string;
  notes: string;
  reviewed: boolean;
  sections: { title: string; lines: { name: string; details: string }[] }[];
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
export function authoredHtml(
  content: AuthoredContent,
  name: string,
  kind: string,
  origin: string,
) {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(content.title)}</title><style>@font-face{font-family:Behtan;src:url("${esc(origin)}/fonts/IRANSansX-Regular.woff")}@page{size:A4;margin:15mm}body{font:12px/2 Behtan,sans-serif;color:#193e33}header{border-bottom:2px solid #227153;margin-bottom:25px;padding-bottom:16px}h1{font-size:23px}h2{font-size:17px;break-after:avoid}table{width:100%;border-collapse:collapse;margin-bottom:20px}td,th{border:1px solid #d7e3dc;padding:10px;text-align:right;white-space:pre-wrap}th{background:#edf4ed}tr{break-inside:avoid}p{white-space:pre-wrap}.meta{color:#64736b;font-size:10px}.notes{border-right:3px solid #227153;padding-right:12px}</style></head><body><header><h1>به‌تن | ${esc(content.title)}</h1><p>${esc(name)}</p><p class="meta">${kind === "training" ? "برنامه تمرینی" : "برنامه تغذیه"} · تدوین و تأیید توسط متخصص</p></header>${content.sections.map((s) => `<section><h2>${esc(s.title)}</h2><table><thead><tr><th>${kind === "training" ? "حرکت" : "منو / مواد غذایی"}</th><th>${kind === "training" ? "ست، تکرار و توضیحات" : "مقدار و توضیحات"}</th></tr></thead><tbody>${s.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.details)}</td></tr>`).join("")}</tbody></table></section>`).join("")}${content.notes ? `<p class="notes">${esc(content.notes)}</p>` : ""}<p class="meta">نسخهٔ تأییدشدهٔ متخصص؛ محتوای این سند تدوین اختصاصی است و محاسبهٔ خودکار به آن نسبت داده نمی‌شود.</p></body></html>`;
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
  await w.document.fonts.ready;
  w.focus();
  w.print();
}
