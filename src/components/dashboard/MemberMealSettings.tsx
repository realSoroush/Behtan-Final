import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { UserProfile } from '../../types';
import { parseMealSettings } from '../../utils/mealSettings';
import { MealSettingsFields } from '../ui/MealSettingsFields';
export function MemberMealSettings({ profile, disabled }: { profile: UserProfile; disabled: boolean }) {
  const [value, setValue] = useState(() => parseMealSettings(profile.meal_settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const { error } = await supabase.rpc('member_set_meal_settings', {
        p_expected: profile.meal_settings ?? null, p_settings: value,
      }).abortSignal(AbortSignal.timeout(15000)).retry(false);
      if (error) throw error;
      window.dispatchEvent(new Event('member-profile-changed'));
    } catch { setError('تنظیمات ذخیره نشد؛ نسخهٔ تازه را بررسی کن. وعدهٔ ثبت‌شده قابل حذف نیست.'); }
    finally { setSaving(false); }
  }
  return <details className="member-notice"><summary>تنظیم تعداد وعده‌ها</summary>
    <MealSettingsFields value={value} disabled={disabled || saving} onChange={setValue}/>
    <p>با ذخیره، پیشنهادهای روزهای آینده دوباره ساخته می‌شوند. سابقهٔ مصرف حفظ می‌شود.</p>
    <button type="button" disabled={disabled || saving} onClick={() => void save()}>{saving ? 'در حال ذخیره…' : 'ذخیرهٔ چیدمان'}</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}
