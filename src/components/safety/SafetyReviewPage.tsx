import { useMemo, useState } from 'react';
import { AlertTriangle, LogOut, ShieldCheck } from 'lucide-react';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { MedicalSafetyForm, type MedicalSafetyFormValue } from './MedicalSafetyForm';
import type { MedicalConditionsJson, UserProfile } from '@/types';
import {
  evaluateProfileMedicalEligibility,
  MEDICAL_SAFETY_SCREENING_VERSION,
} from '@/utils/medicalEligibility';

interface SafetyReviewPageProps {
  profile: UserProfile;
  onSave: (medical: MedicalConditionsJson) => Promise<void>;
  onSignOut: () => void | Promise<void>;
}

function createInitialValue(profile: UserProfile): MedicalSafetyFormValue {
  const medical = profile.medical_conditions_json;
  return {
    medicalConditions: medical?.conditions ?? [],
    injuries: medical?.injuries ?? '',
    medications: medical?.medications ?? '',
    pregnancyStatus: profile.gender === 'male'
      ? 'not_applicable'
      : medical?.pregnancyStatus ?? null,
    eatingDisorderStatus: medical?.eatingDisorderStatus ?? null,
    safetyScreeningVersion: medical?.safetyScreeningVersion ?? null,
    safetyAnswersConfirmed: medical?.safetyAnswersConfirmed ?? false,
  };
}

export function SafetyReviewPage({ profile, onSave, onSignOut }: SafetyReviewPageProps) {
  const [value, setValue] = useState<MedicalSafetyFormValue>(() => createInitialValue(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const medical: MedicalConditionsJson = useMemo(() => ({
    conditions: value.medicalConditions,
    injuries: value.injuries,
    medications: value.medications,
    pregnancyStatus: profile.gender === 'male' ? 'not_applicable' : value.pregnancyStatus,
    eatingDisorderStatus: value.eatingDisorderStatus,
    safetyScreeningVersion: value.safetyScreeningVersion,
    safetyAnswersConfirmed: value.safetyAnswersConfirmed,
  }), [profile.gender, value]);

  const eligibility = useMemo(
    () => evaluateProfileMedicalEligibility({ ...profile, medical_conditions_json: medical }),
    [profile, medical]
  );
  const questionnaireComplete =
    value.safetyScreeningVersion === MEDICAL_SAFETY_SCREENING_VERSION
    && value.safetyAnswersConfirmed
    && eligibility.status !== 'needs_screening';

  const handleChange = (patch: Partial<MedicalSafetyFormValue>) => {
    setError(null);
    setValue((current) => ({ ...current, ...patch }));
  };

  const handleSave = async () => {
    if (!questionnaireComplete || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(medical);
    } catch (saveError) {
      console.error('Failed to save medical safety review:', saveError);
      setError('ذخیره ارزیابی انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
      setSaving(false);
    }
  };

  if (!profile.gender) return null;

  return (
    <div className="min-h-screen bg-neutral-50 pb-10 dark:bg-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white/85 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/85">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void onSignOut()}
              aria-label="خروج از حساب"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <LogOut size={19} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-900 dark:text-neutral-100">{APP_NAME_FA}</span>
            <img src={APP_LOGO_PATH} alt={`لوگوی ${APP_NAME_FA}`} className="h-8 w-8 object-contain" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-5 py-6">
        <div className="text-center">
          <ShieldCheck size={42} className="mx-auto text-primary-500" />
          <h1 className="mt-3 text-xl font-extrabold text-neutral-900 dark:text-neutral-100">به‌روزرسانی ضروری اطلاعات سلامت</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            این سؤال‌های جدید فقط برای جلوگیری از صدور برنامه خودکار در شرایط نیازمند متخصص اضافه شده‌اند.
          </p>
        </div>

        <MedicalSafetyForm gender={profile.gender} value={value} onChange={handleChange} />

        {questionnaireComplete && eligibility.status === 'blocked' && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
            <p className="font-bold text-red-800 dark:text-red-200">به بررسی پزشک یا متخصص تغذیه نیاز است</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-red-700 dark:text-red-300">
              {eligibility.blockers.map((blocker) => (
                <li key={blocker.code}><strong>{blocker.title}:</strong> {blocker.detail}</li>
              ))}
            </ul>
          </div>
        )}

        {questionnaireComplete && eligibility.cautions.length > 0 && eligibility.status !== 'blocked' && (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm leading-6 text-amber-700 dark:text-amber-300">
              برنامه با محدودیت ایمنی ساخته می‌شود و گزینه کاهش وزن سریع در دسترس نخواهد بود.
            </p>
          </div>
        )}

        {error && <p role="alert" className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

        <Button onClick={handleSave} disabled={!questionnaireComplete} loading={saving}>
          ذخیره ارزیابی ایمنی
        </Button>
      </main>
    </div>
  );
}
