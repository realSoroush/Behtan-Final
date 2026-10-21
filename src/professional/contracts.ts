export type ProRole = "owner" | "assistant" | "practitioner";
export interface ProOrganization {
  id: string;
  name: string;
  mode: "sandbox";
  status: "active" | "suspended";
}
export interface ProMembership {
  organization_id: string;
  user_id: string;
  roles: ProRole[];
  status: "active" | "revoked";
}
export interface SandboxPatient {
  id: string;
  organization_id: string;
  case_code: string;
  created_at: string;
}
export function canCreateSandboxPatient(roles: ProRole[]): boolean {
  return roles.includes("owner") || roles.includes("assistant");
}
export function proErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  if (code.includes('PRO_SERVER_NOT_CONFIGURED')) return 'سرویس ساخت برنامه هنوز تنظیم نشده است؛ تنظیمات سرور پنل را بررسی کنید.';
  if (code.includes('PRO_AUTH_REQUIRED')) return 'نشست ورود منقضی شده است؛ دوباره وارد شوید.';
  if (code.includes('PRO_CONNECTION_ERROR')) return 'ارتباط موقتاً برقرار نیست؛ اطلاعات شما حفظ شده است. دوباره تلاش کنید.';
  if (code.includes('PRO_DRAFT_EXPIRED')) return 'زمان پیش‌نمایش تمام شده است؛ برنامه را دوباره تولید کنید.';
  if (code.includes('PRO_GENERATION_LIMIT')) return 'تعداد درخواست‌های ساخت برنامه زیاد شده است؛ کمی بعد دوباره تلاش کنید.';
  if (code.includes('PRO_MEDICAL_STOP')) return 'با پاسخ‌های ثبت‌شده، موتور اجازه ساخت برنامه خودکار نمی‌دهد.';
  if (code.includes('PRO_GENERATION_FAILED')) return 'موتور نتوانست برنامه سازگار بسازد؛ اطلاعات و محدودیت‌های غذایی را بررسی کنید.';
  if (code.includes("PRO_STALE_REVISION"))
    return "نسخهٔ پرونده تغییر کرده است. آخرین نسخه را دریافت و تغییرات را دوباره بررسی کنید؛ اطلاعات بازنویسی نشد.";
  if (code.includes("PRO_CLINICAL_ACCESS_DENIED"))
    return "دسترسی به اطلاعات سلامت فعال نیست؛ نقش، تخصیص، دسترسی تخصصی آزمایش و مجوز پردازش باید معتبر باشند.";
  if (code.includes("PRO_INVALID_PLAN"))
    return "ساختار برنامه معتبر نیست؛ برنامه را دوباره تولید کنید.";
  if (code.includes("PRO_INVALID_INTAKE"))
    return "نام، شماره تماس، تاریخ تولد، محدودهٔ عددها و تأیید پاسخ‌ها را بررسی کنید.";
  if (code.includes("PRO_INVALID_PRACTITIONER"))
    return "فرد انتخاب‌شده عضویت فعال با نقش متخصص ندارد.";
  if (code.includes("PRO_ACCESS_DENIED"))
    return "دسترسی معتبر نیست؛ فهرست را دوباره دریافت کنید یا با مدیر آزمایش تماس بگیرید.";
  if (code.includes("PRO_SANDBOX_LIMIT"))
    return "ظرفیت این محیط آزمایش تکمیل شده است.";
  if (code.includes("PRO_REQUEST_CONFLICT"))
    return "این درخواست با عملیات دیگری تداخل دارد. فهرست را دوباره دریافت کنید.";
  return "ارتباط کامل نشد. دوباره تلاش کنید؛ درخواست قبلی دوباره ساخته نمی‌شود.";
}
