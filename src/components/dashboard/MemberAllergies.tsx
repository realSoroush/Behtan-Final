import { useState } from 'react';
import { ALLERGIES } from '@/components/onboarding/Step7Dietary';
import { supabase } from '@/lib/supabaseClient';
import type { Allergy, DietaryPreferencesJson } from '@/types';
import { MemberDialog } from './MemberDialog';

export function MemberAllergies({ userId, preferences }: { userId: string; preferences: DietaryPreferencesJson }) {
  const [draft, setDraft] = useState<{ original: DietaryPreferencesJson; allergies: Allergy[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    try {
      const { data, error } = await supabase.from('user_profiles')
        .update({ dietary_preferences_json: { ...draft.original, allergies: draft.allergies } })
        .eq('id', userId)
        .eq('dietary_preferences_json', JSON.stringify(draft.original))
        .select('id')
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw error;
      if (!data?.length) {
        setDraft(null);
        setError('ترجیحات غذایی تغییر کرده‌اند. فهرست تازه را بررسی کن.');
        window.dispatchEvent(new Event('member-profile-changed'));
        return;
      }
      setDraft(null);
      setSaved(true);
      window.dispatchEvent(new Event('member-profile-changed'));
    } catch {
      setError('ذخیرهٔ حساسیت‌ها انجام نشد. دوباره تلاش کن.');
    } finally {
      setSaving(false);
    }
  };

  const labels = ALLERGIES.filter(({ value }) => preferences.allergies.includes(value)).map(({ label }) => label);
  return (
    <section className="account-membership space-y-2" aria-labelledby="member-allergies-title">
      <h2 id="member-allergies-title" className="font-bold">حساسیت‌های غذایی</h2>
      <p className="text-sm">{labels.length ? labels.join('، ') : 'حساسیتی ثبت نشده.'}</p>
      {saved && <p role="status" className="text-sm">حساسیت‌ها ذخیره شدند.</p>}
      {!draft && error && <p role="alert" className="text-sm">{error}</p>}
      <button type="button" className="member-secondary" onClick={() => {
        setError('');
        setSaved(false);
        setDraft({ original: preferences, allergies: preferences.allergies });
      }}>ویرایش حساسیت‌ها</button>
      {draft && (
        <MemberDialog title="ویرایش حساسیت‌های غذایی" onClose={() => setDraft(null)} dismissible={!saving}>
          <div className="meal-confirmation-content space-y-3">
            <p>به‌تن حساسیت‌های ثبت‌شده را در ساخت برنامه و پیشنهادهای جایگزین در نظر می‌گیرد.</p>
            <fieldset disabled={saving} className="grid gap-2">
              <legend className="sr-only">حساسیت‌های غذایی</legend>
              {ALLERGIES.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-3 min-h-11">
                  <input type="checkbox" checked={draft.allergies.includes(value)} onChange={e => {
                    setDraft({
                      ...draft,
                      allergies: e.target.checked ? [...draft.allergies, value] : draft.allergies.filter(item => item !== value),
                    });
                  }} />
                  {label}
                </label>
              ))}
            </fieldset>
            {error && <p role="alert" className="text-sm">{error}</p>}
            <button type="button" className="member-primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'در حال ذخیره…' : 'ذخیرهٔ حساسیت‌ها'}
            </button>
          </div>
        </MemberDialog>
      )}
    </section>
  );
}
