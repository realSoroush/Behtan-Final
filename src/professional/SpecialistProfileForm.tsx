import { useRef, useState, type FormEvent } from 'react';
import { ArrowUpLeft, MapPin, ShieldCheck } from 'lucide-react';
import { PanelSelect } from '@/components/ui/PanelSelect';
import { proErrorMessage } from './contracts';
import { specialistApi } from './specialistApi';
import { contactPhone, profileError, PROFESSIONS, type SpecialistProfile } from './specialistProfile';
import './specialist-profile.css';

export function SpecialistProfileForm({ initial, onSaved, editing = false }: {
  initial: SpecialistProfile; onSaved: (profile: SpecialistProfile) => void; editing?: boolean;
}) {
  const [form, setForm] = useState(() => ({ ...initial }));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  function change(key: keyof SpecialistProfile, value: string) {
    setForm(current => ({ ...current, [key]: value })); setError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const invalid = profileError(form);
    if (invalid) { setError(invalid); return; }
    pending.current = true; setBusy(true); setError('');
    try { onSaved(await specialistApi.save({ ...form, contact_phone: contactPhone(form.contact_phone) })); }
    catch (failure) { setError(proErrorMessage(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="specialist-profile pro-panel" aria-labelledby={editing ? 'specialist-edit-title' : 'specialist-title'}>
    <header className="specialist-profile-heading">
      <img src="/behtan-logo.png" width="43" height="52" alt="به‌تن" />
      <div><p className="pro-eyebrow">به‌تن حرفه‌ای · مشخصات متخصص</p><h1 id={editing ? 'specialist-edit-title' : 'specialist-title'}>{editing ? 'ویرایش مشخصات حرفه‌ای' : 'آشنایی کوتاه، شروع حرفه‌ای.'}</h1></div>
    </header>
    <p className="specialist-profile-intro">{editing ? 'مشخصات تماس در خروجی‌های بعدی برنامه‌ها استفاده می‌شود.' : 'برای آماده‌سازی پنل، مشخصات حرفه‌ای خود را یک بار کامل کنید.'} نام، شماره تماس و آدرس شما در PDF برنامهٔ مراجع نمایش داده می‌شود.</p>
    <form onSubmit={event => void submit(event)} aria-label="مشخصات حرفه‌ای متخصص">
      <fieldset disabled={busy} className="specialist-profile-grid">
        <label>نام و نام خانوادگی<input type="text" name="full_name" autoComplete="name" required minLength={3} maxLength={100} value={form.full_name} onChange={e => change('full_name', e.target.value)} /></label>
        <label>شماره تماس<input type="text" name="contact_phone" aria-label="شماره تماس" autoComplete="tel" inputMode="tel" dir="ltr" required maxLength={30} value={form.contact_phone} onChange={e => change('contact_phone', e.target.value)} aria-describedby="specialist-phone-help" /><small id="specialist-phone-help">شمارهٔ تماس کاری؛ تغییر آن، شمارهٔ ورود پیامکی را عوض نمی‌کند.</small></label>
        <label className="specialist-profile-wide">رسته کاری شما<PanelSelect value={form.profession} onChange={e => change('profession', e.target.value)} aria-label="رسته کاری شما"><option value="" disabled>رسته کاری را انتخاب کنید</option>{PROFESSIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</PanelSelect></label>
        <label>استان<input type="text" name="province" autoComplete="address-level1" required maxLength={80} value={form.province} onChange={e => change('province', e.target.value)} /></label>
        <label>شهر<input type="text" name="city" autoComplete="address-level2" required maxLength={80} value={form.city} onChange={e => change('city', e.target.value)} /></label>
        <label className="specialist-profile-wide">آدرس<input type="text" name="address" autoComplete="street-address" required minLength={5} maxLength={500} value={form.address} onChange={e => change('address', e.target.value)} placeholder="خیابان، ساختمان و واحد محل فعالیت" /></label>
      </fieldset>
      {error && <p className="pro-error" role="alert">{error}</p>}
      <div className="specialist-profile-bottom"><span><ShieldCheck size={18} />ذخیره در حساب اختصاصی شما</span><button className="pro-primary" type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : editing ? 'ذخیره مشخصات' : 'ذخیره و ادامه'}<ArrowUpLeft size={18} /></button></div>
      <p className="specialist-profile-note"><MapPin size={15} />آدرس محل فعالیت را وارد کنید؛ این اطلاعات برای مراجع قابل مشاهده است.</p>
    </form>
  </section>;
}
