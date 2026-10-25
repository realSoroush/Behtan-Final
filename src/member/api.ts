import { supabase } from "../lib/supabaseClient";
export async function memberRequest<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Error("دوباره وارد حساب شو.");
  const res = await fetch("/api/member", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(60000),
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
      AUTH_REQUIRED: "دوباره وارد حساب شو.",
      RATE_LIMITED: "تعداد درخواست‌ها زیاد است؛ یک دقیقه بعد تلاش کن.",
    };
    throw Error(messages[value.error] ?? value.error ?? "درخواست انجام نشد.");
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
