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
  if (code.includes("PRO_STALE_REVISION"))
    return "نسخهٔ پرونده تغییر کرده است. آخرین نسخه را دریافت و تغییرات را دوباره بررسی کنید؛ اطلاعات بازنویسی نشد.";
  if (code.includes("PRO_CLINICAL_ACCESS_DENIED"))
    return "دسترسی به اطلاعات سلامت فعال نیست؛ نقش، تخصیص، دسترسی تخصصی آزمایش و مجوز پردازش باید معتبر باشند.";
  if (code.includes("PRO_INVALID_INTAKE"))
    return "پاسخ‌ها معتبر نیستند؛ تاریخ تولد، محدودهٔ عددها و تأیید پرسش‌های ایمنی را بررسی کنید.";
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
