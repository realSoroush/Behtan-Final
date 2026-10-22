import { supabase } from "@/lib/supabaseClient";
import { rpc } from "../api";
import type {
  BodyReport,
  StoredBodyReport,
  Measurements,
  View,
} from "./contracts";
export const bodyApi = {
  list: (org: string, record: string) =>
    rpc<StoredBodyReport[]>("pro_body_reports", {
      p_org: org,
      p_record: record,
    }),
  approve: (org: string, id: string) =>
    rpc("pro_approve_body_report", { p_org: org, p_report: id }),
  attach: (org: string, plan: string, report: string) =>
    rpc("pro_attach_body_report", {
      p_org: org,
      p_plan: plan,
      p_report: report,
    }),
  forPlan: (org: string, plan: string) =>
    rpc<BodyReport | null>("pro_plan_body_report", {
      p_org: org,
      p_plan: plan,
    }),
  async analyze(
    org: string,
    record: string,
    revision: number,
    photos: { view: View; data: string }[],
    measurements: Measurements,
    key: string,
  ) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("PRO_AUTH_REQUIRED");
    let response;
    try {
      response = await fetch("/api/pro-body-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          org,
          record,
          revision,
          photos,
          measurements,
          key,
          consent: true,
        }),
        signal: AbortSignal.timeout(65000),
      });
    } catch {
      throw new Error("PRO_CONNECTION_ERROR");
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("PRO_SCAN_NOT_CONFIGURED");
    }
    if (!response.ok)
      throw new Error(
        (result.error || "PRO_CONNECTION_ERROR") +
          " [" +
          (response.headers.get("X-Request-Id") || "") +
          "]",
      );
    return result as { id: string; report: BodyReport };
  },
};
// Decode and draw strips original filename, EXIF/GPS and full-resolution pixels.
export async function preparePhoto(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw new Error("عکس JPEG، PNG یا WebP تا ۱۲ مگابایت انتخاب کنید.");
  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width < 320 ||
      bitmap.height < 320 ||
      bitmap.width * bitmap.height > 50_000_000
    )
      throw new Error(
        "ابعاد عکس مناسب نیست؛ تصویر واضح با حداقل ۳۲۰ پیکسل انتخاب کنید.",
      );
    const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("مرورگر امکان آماده‌سازی عکس را ندارد.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length < 1_050_000) return data;
    }
    throw new Error("عکس بیش از حد حجیم است؛ تصویر ساده‌تری انتخاب کنید.");
  } finally {
    bitmap.close();
  }
}
export function bodyError(e: unknown) {
  const raw = e instanceof Error ? e.message : "";
  const texts: Record<string, string> = {
    PRO_SCAN_NOT_CONFIGURED:
      "سرویس تحلیل عکس هنوز فعال نشده است؛ تنظیمات سرور را بررسی کنید.",
    PRO_SCAN_PROCESSING:
      "همین درخواست در حال پردازش است. کمی بعد «بررسی دوباره» را بزنید؛ درخواست جدید نسازید.",
    PRO_SCAN_LIMIT: "سقف تحلیل این ساعت تکمیل شده است؛ بعداً دوباره تلاش کنید.",
    PRO_SCAN_PROVIDER_BUSY: "سرویس تحلیل شلوغ است؛ دوباره تلاش کنید.",
    PRO_SCAN_PROVIDER_ERROR:
      "سرویس تحلیل پاسخ نداد؛ عکس‌ها حفظ شده‌اند، دوباره تلاش کنید.",
    PRO_SCAN_INVALID_RESULT: "خروجی تحلیل قابل تأیید نبود؛ دوباره تلاش کنید.",
    PRO_SCAN_REVIEW_REQUIRED:
      "ابتدا گزارش سازگار با همین نسخه برنامه را بازبینی و تأیید کنید.",
    PRO_SUBSCRIPTION_EXPIRED:
      "ساخت و ویرایش غیرفعال است؛ سوابق قابل مشاهده‌اند.",
    PRO_CASE_ARCHIVED: "پرونده بایگانی‌شده فقط قابل مشاهده است.",
    PRO_CONNECTION_ERROR:
      "اتصال برقرار نشد. عکس‌ها در همین پنجره محفوظ‌اند؛ با همان درخواست دوباره تلاش کنید.",
    PRO_STALE_REVISION:
      "اطلاعات پرونده تغییر کرده است؛ پرونده را دوباره باز کنید.",
    PRO_REQUEST_CONFLICT:
      "درخواست با نتیجه قبلی سازگار نیست؛ گزارش ثبت‌شده را بررسی کنید.",
    PRO_ACCESS_DENIED: "اجازه دسترسی به این پرونده را ندارید.",
    PRO_MIGRATION_REQUIRED: "Migration جدید گزارش بدن اجرا نشده است.",
  };
  const code = /PRO_[A-Z_]+/.exec(raw)?.[0];
  return code
    ? (texts[code] || "عملیات انجام نشد؛ دوباره بررسی کنید.") +
        (raw.match(/\[[0-9a-f-]{36}\]/)?.[0]
          ? " · کد پیگیری: " + raw.match(/\[[0-9a-f-]{36}\]/)![0]
          : "")
    : raw || "عملیات انجام نشد.";
}
