import { supabase } from "@/lib/supabaseClient";
import { rpc } from "../api";
import type {
  TrainingInput,
  TrainingPlan,
  TrainingSnapshot,
} from "../../training/types";
export const trainingApi = {
  history: (org: string, record: string, page = 0) =>
    rpc<{ rows: TrainingSnapshot[]; total: number }>("pro_training_history", {
      p_org: org,
      p_record: record,
      p_page: page,
    }),
  approve: (org: string, id: string) =>
    rpc("pro_approve_training", { p_org: org, p_plan: id }),
  async generate(
    org: string,
    record: string,
    revision: number,
    input: TrainingInput,
    key: string,
  ): Promise<{ id: string; plan: TrainingPlan }> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("PRO_AUTH_REQUIRED");
    let response: Response;
    try {
      response = await fetch("/api/pro-training", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ org, record, revision, input, key }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error("PRO_CONNECTION_ERROR");
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("PRO_TRAINING_NOT_CONFIGURED");
    }
    if (!response.ok)
      throw new Error(
        (result.error || "PRO_CONNECTION_ERROR") +
          " [" +
          (response.headers.get("X-Request-Id") || "") +
          "]",
      );
    return result;
  },
};
export function trainingError(e: unknown): string {
  const raw = e instanceof Error ? e.message : "",
    code = /(?:PRO|TRAINING)_[A-Z_]+/.exec(raw)?.[0];
  const messages: Record<string, string> = {
    PRO_MODULE_DISABLED: "ماژول تمرین در اشتراک این پنل فعال نیست؛ سوابق قابل مشاهده‌اند.",
    TRAINING_SPECIALIST_AUTHORING: "برای این شرایط، برنامه را از بخش «تدوین اختصاصی متخصص» تنظیم کنید؛ قالب عمومی خودکار مناسب این سناریو نیست.",
    TRAINING_INVALID_INPUT:
      "گزینه‌های تمرین را بررسی کن؛ یکی از پاسخ‌ها معتبر نیست.",
    TRAINING_DAYS: "روزهای تمرین را انتخاب کن.",
    TRAINING_RECOVERY:
      "بین روزهای تمرین، حتی آخر و اول هفته، دست‌کم یک روز استراحت بگذار.",
    TRAINING_SCREENING_REQUIRED: "ابتدا پرسش‌های آمادگی تمرین را تأیید کن.",
    TRAINING_SCOPE:
      "این نسخه برای بزرگسالان ۱۸ تا ۶۴ سال با شرایط عمومی ساخته شده است.",
    TRAINING_REVIEW_REQUIRED:
      "این شرایط به بررسی و برنامه اختصاصی نیاز دارد؛ موتور عمومی فعلی برنامه تولید نمی‌کند.",
    TRAINING_PULL_EQUIPMENT:
      "برای پوشش عضلات پشت، یک جفت دمبل، کش بلند یا دستگاه کششی انتخاب کن.",
    TRAINING_BAND_SEAT:
      "برای پارویی با کش، یک نیمکت محکم هم انتخاب کن؛ یا از دمبل یا دستگاه کششی استفاده کن.",
    TRAINING_SUPPORTED_PUSH:
      "برای شروع قابل‌کنترل‌تر، سطح مرتفع محکم برای شنا یا دستگاه پرس سینه لازم است.",
    TRAINING_EQUIPMENT: "با تجهیزات انتخاب‌شده، برنامه متوازن قابل ساخت نیست.",
    TRAINING_TIME_BUDGET: "زمان انتخاب‌شده برای این ترکیب کافی نیست.",
    PRO_AUTH_REQUIRED: "دوباره وارد حساب شو.",
    PRO_ACCESS_DENIED: "دسترسی به این پرونده برقرار نیست.",
    PRO_TRAINING_NOT_CONFIGURED:
      "ساخت برنامه تمرینی هنوز در سرور فعال نشده است.",
    PRO_CONNECTION_ERROR:
      "ارتباط برقرار نشد؛ پاسخ‌ها حفظ شده‌اند. با همان درخواست دوباره تلاش کن.",
    PRO_REQUEST_CONFLICT:
      "این درخواست قبلاً با پاسخ‌های دیگری ثبت شده است؛ سوابق را بررسی کن.",
    PRO_STALE_REVISION: "پرونده تغییر کرده است؛ آخرین نسخه را دریافت کن.",
    PRO_SUBSCRIPTION_EXPIRED:
      "ساخت و تأیید متوقف است؛ مشاهده و دانلود سوابق فعال می‌ماند.",
    PRO_CASE_ARCHIVED: "پرونده بایگانی‌شده فقط قابل مشاهده است.",
    PRO_GENERATION_LIMIT: "سقف ساخت برنامه این ساعت تکمیل شده است.",
    PRO_MIGRATION_REQUIRED: "Migration شماره ۰۲۹ هنوز اجرا نشده است.",
  };
  return (
    (code
      ? messages[code] || "عملیات انجام نشد؛ دوباره بررسی کن."
      : raw || "عملیات انجام نشد.") +
    (raw.match(/\[[a-f0-9-]{36}\]/)?.[0]
      ? " · کد پیگیری: " + raw.match(/\[[a-f0-9-]{36}\]/)![0]
      : "")
  );
}
