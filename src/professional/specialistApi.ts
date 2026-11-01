import { rpc } from './api';
import { profileError, type SpecialistIdentity, type SpecialistProfile } from './specialistProfile';
export const specialistApi = {
  get: () => rpc<SpecialistProfile>('pro_specialist_profile'),
  save: (profile: SpecialistIdentity) => rpc<SpecialistProfile>('pro_save_specialist_profile', {
    p_full_name: profile.full_name, p_contact_phone: profile.contact_phone,
    p_profession: profile.profession, p_province: profile.province,
    p_city: profile.city, p_address: profile.address,
  }),
  async forPlan(org: string, kind: 'nutrition' | 'training' | 'authored', plan: string): Promise<SpecialistIdentity> {
    const identity = await rpc<SpecialistIdentity | null>('pro_plan_specialist', { p_org: org, p_kind: kind, p_plan: plan });
    if (!identity || profileError(identity)) throw new Error('مشخصات متخصص این نسخه هنوز کامل نشده است؛ ثبت‌کنندهٔ برنامه باید مشخصات حرفه‌ای خود را تکمیل کند.');
    return identity;
  },
};
