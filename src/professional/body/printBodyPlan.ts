import { printedPlanHtml } from "../printPlan.ts";
import type { PrintedPlan } from "../menuPlan.ts";
import { bodyAppendixHtml } from "./appendix.ts";
import { bodyApi } from "./api";
export async function printPlanWithBody(
  p: PrintedPlan,
  org: string,
  planId: string,
) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("اجازه بازشدن پنجره چاپ را در مرورگر فعال کنید.");
  popup.opener = null;
  popup.document.body.textContent = "در حال آماده‌سازی خروجی…";
  try {
    const report = await bodyApi.forPlan(org, planId);
    const html = printedPlanHtml(p, window.location.origin);
    popup.document.open();
    popup.document.write(
      report
        ? html.replace("</body>", bodyAppendixHtml(report) + "</body>")
        : html,
    );
    popup.document.close();
    await popup.document.fonts.ready;
    popup.focus();
    popup.print();
  } catch (e) {
    popup.close();
    throw e;
  }
}
