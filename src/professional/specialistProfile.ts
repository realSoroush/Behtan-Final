export const PROFESSIONS = [
  ['fitness_coach', 'مربی ورزشی'],
  ['bodybuilding_coach', 'مربی بدنسازی'],
  ['nutritionist', 'متخصص تغذیه و رژیم‌درمانی'],
  ['physician', 'پزشک'],
  ['sports_medicine', 'متخصص پزشکی ورزشی'],
  ['physiotherapist', 'فیزیوتراپیست'],
  ['gym_manager', 'مدیر باشگاه'],
  ['clinic_manager', 'مدیر کلینیک'],
] as const;
export interface SpecialistIdentity {
  full_name: string;
  contact_phone: string;
  profession: string;
  province: string;
  city: string;
  address: string;
}
export interface SpecialistProfile extends SpecialistIdentity { completed: boolean }
export function contactPhone(value: string): string {
  const phone = value.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s()-]/g, '');
  return phone.startsWith('00') ? '+' + phone.slice(2) : phone;
}
export function profileError(profile: SpecialistIdentity): string {
  if (profile.full_name.trim().length < 3 || profile.full_name.trim().length > 100) return 'نام و نام خانوادگی را کامل وارد کنید.';
  if (!/^\+?[0-9]{8,15}$/.test(contactPhone(profile.contact_phone))) return 'شماره تماس را همراه پیش‌شماره وارد کنید؛ مثل ۰۹۱۱۱۲۳۴۵۶۷ یا ۰۱۱۳۳۳۳۴۴۴۴.';
  if (!PROFESSIONS.some(([key]) => key === profile.profession)) return 'رسته کاری خود را انتخاب کنید.';
  if ([profile.province, profile.city].some(value => !value.trim() || value.trim().length > 80)) return 'استان و شهر را کامل وارد کنید.';
  if (profile.address.trim().length < 5 || profile.address.trim().length > 500) return 'آدرس محل فعالیت را کامل وارد کنید.';
  return '';
}
export function registrationField(profession: string): string {
  if (['fitness_coach', 'bodybuilding_coach'].includes(profession)) return 'training';
  if (profession === 'gym_manager') return 'gym';
  if (['physician', 'sports_medicine', 'physiotherapist', 'clinic_manager'].includes(profession)) return 'clinic';
  return 'nutrition';
}
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Shared by all Pro PDF templates. Never interpolate profile values as HTML. */
export function specialistHtml(profile?: SpecialistIdentity): string {
  if (!profile) return '';
  return `<section aria-label="مشخصات متخصص" style="border:1px solid #d7e3dc;border-radius:10px;padding:10px 14px;margin:14px 0;break-inside:avoid;overflow-wrap:anywhere"><strong>متخصص: ${esc(profile.full_name)}</strong><p style="margin:4px 0">شماره تماس: <bdi dir="ltr">${esc(profile.contact_phone)}</bdi></p><p style="margin:4px 0;white-space:pre-wrap">آدرس: ${esc([profile.province, profile.city, profile.address].join('، '))}</p></section>`;
}
