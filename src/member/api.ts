import { supabase } from "../lib/supabaseClient";
export class MemberRequestError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

export async function memberRequest<T>(
  action: string,
  payload: Record<string, unknown> = {},
  options: { signal?: AbortSignal; userId?: string } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session || (options.userId && data.session.user.id !== options.userId)) {
    throw new MemberRequestError("دوباره وارد حساب شو.", "AUTH_REQUIRED", 401);
  }
  const res = await fetch("/api/member", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
    signal: options.signal ?? AbortSignal.timeout(60000),
  });
  const value = await res
    .json()
    .catch(() => ({ error: "ارتباط با سرویس برقرار نشد." }));
  if (!res.ok) {
    const messages: Record<string, string> = {
      PROFILE_CHANGED:"اطلاعات پروفایل تغییر کرد؛ اطلاعات تازه را بررسی کن و دوباره برنامه را بساز.",
      TRAINING_LOCKED: "برای دریافت تمرین، اشتراکت را ارتقا بده.",
      TRAINING_REVIEW_REQUIRED:
        "برنامه تمرینی خودکار با این سوابق نیاز به بررسی متخصص دارد؛ پیش از پرداخت با پشتیبانی تماس بگیر.",
      STALE_PLAN: "برنامه در دستگاه یا پنجرهٔ دیگری تغییر کرده است. نسخهٔ تازه را باز کن و دوباره انتخاب کن.",
      STALE_INTAKE: "ثبت‌های روز تغییر کرده‌اند. نسخهٔ تازه را باز کن و دوباره انتخاب کن.",
      STALE_CONTEXT: "اطلاعات مبنای برنامه تغییر کرده است. نسخهٔ تازه را باز کن.",
      MEAL_NOT_EDITABLE: "این وعده قابل تغییر نیست. وضعیت تازهٔ آن را بررسی کن.",
      NO_FEASIBLE_PLAN: "با محدودیت‌های فعلی، ترکیب متفاوت مناسبی پیدا نشد.",
      MEDICAL_REVIEW_REQUIRED: "ساخت برنامهٔ خودکار به بررسی متخصص نیاز دارد.",
      INVALID_INTAKE: "بخشی از سابقهٔ مصرف نیازمند بررسی است. با پشتیبانی تماس بگیر.",
      MEAL_SCHEDULE_UNAVAILABLE: "ارتباط با سرویس برنامهٔ غذایی برقرار نشد. دوباره تلاش کن.",
      TIMEOUT: "پاسخ سرویس برنامهٔ غذایی به‌موقع نرسید. دوباره تلاش کن.",
      MEAL_SCHEDULE_MIGRATION_REQUIRED: "سرویس برنامهٔ غذایی هنوز آماده نیست.",
      ACCESS_DENIED: "دسترسی به برنامهٔ غذایی فعال نیست.",
      INVALID_MEAL_DATE: "روز برنامه تغییر کرده است. صفحه را تازه کن.",
      AUTH_REQUIRED: "دوباره وارد حساب شو.",
      RATE_LIMITED: "تعداد درخواست‌ها زیاد است؛ یک دقیقه بعد تلاش کن.",
    };
    const code = typeof value?.error === "string" ? value.error : "INVALID_RESPONSE";
    throw new MemberRequestError(messages[code] ?? value?.error ?? "درخواست انجام نشد.", code, res.status);
  }
  return value as T;
}
export async function memberRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw Error(error.message);
  return data as T;
}
