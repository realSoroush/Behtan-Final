import { CheckboxCard, OptionCard } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import type {
  EatingDisorderStatus,
  Gender,
  MedicalCondition,
  OnboardingData,
  PregnancyStatus,
} from '@/types';
import { MEDICAL_SAFETY_SCREENING_VERSION } from '@/utils/medicalEligibility';

export type MedicalSafetyFormValue = Pick<
  OnboardingData,
  | 'medicalConditions'
  | 'injuries'
  | 'medications'
  | 'pregnancyStatus'
  | 'eatingDisorderStatus'
  | 'safetyScreeningVersion'
  | 'safetyAnswersConfirmed'
>;

interface MedicalSafetyFormProps {
  gender: Gender;
  value: MedicalSafetyFormValue;
  onChange: (patch: Partial<MedicalSafetyFormValue>) => void;
}

const CONDITIONS: Array<{
  value: MedicalCondition;
  icon: string;
  label: string;
  description: string;
}> = [
  { value: 'diabetes', icon: '🩸', label: 'دیابت', description: 'دیابت نوع ۱ یا ۲، به‌ویژه در صورت مصرف دارو یا انسولین' },
  { value: 'kidney_disease', icon: '🫘', label: 'بیماری کلیه', description: 'نارسایی کلیه، کاهش عملکرد کلیه یا دیالیز' },
  { value: 'heart_disease', icon: '🫀', label: 'بیماری قلبی', description: 'بیماری قلبی یا نارسایی قلبی تشخیص‌داده‌شده' },
  { value: 'advanced_liver_disease', icon: '🏥', label: 'بیماری پیشرفته کبدی', description: 'سیروز، نارسایی کبد یا بیماری کبدی نیازمند رژیم درمانی' },
  { value: 'fatty_liver', icon: '🧬', label: 'کبد چرب', description: 'کبد چرب تشخیص‌داده‌شده بدون بیماری پیشرفته کبدی' },
  { value: 'pcos', icon: '🔬', label: 'سندروم تخمدان پلی‌کیستیک (PCOS)', description: 'ویژه بانوان' },
  { value: 'thyroid', icon: '🦋', label: 'مشکل تیروئید', description: 'کم‌کاری یا پرکاری تیروئید' },
];

const PREGNANCY_OPTIONS: Array<{
  value: PregnancyStatus;
  icon: string;
  label: string;
  description?: string;
}> = [
  { value: 'not_pregnant', icon: '✓', label: 'باردار یا شیرده نیستم' },
  { value: 'pregnant', icon: '🤰', label: 'باردار هستم', description: 'برنامه تغییر وزن باید توسط پزشک تنظیم شود' },
  { value: 'breastfeeding', icon: '🤱', label: 'در دوران شیردهی هستم', description: 'نیاز انرژی و مواد مغذی در این دوره متفاوت است' },
];

const EATING_DISORDER_OPTIONS: Array<{
  value: EatingDisorderStatus;
  icon: string;
  label: string;
  description: string;
}> = [
  { value: 'none', icon: '✓', label: 'خیر', description: 'سابقه یا وضعیت فعال ندارم' },
  { value: 'history', icon: '🕊️', label: 'سابقه داشته‌ام', description: 'در حال حاضر فعال یا تحت درمان نیست' },
  { value: 'active_or_treatment', icon: '🩺', label: 'فعال یا تحت درمان است', description: 'از جمله بی‌اشتهایی، پرخوری عصبی یا پرخوری دوره‌ای' },
];

export function MedicalSafetyForm({ gender, value, onChange }: MedicalSafetyFormProps) {
  const updateAnswer = (patch: Partial<MedicalSafetyFormValue>) => {
    onChange({
      ...patch,
      safetyScreeningVersion: null,
      safetyAnswersConfirmed: false,
    });
  };

  const toggleCondition = (condition: MedicalCondition) => {
    const hasCondition = value.medicalConditions.includes(condition);
    updateAnswer({
      medicalConditions: hasCondition
        ? value.medicalConditions.filter((item) => item !== condition)
        : [...value.medicalConditions, condition],
    });
  };

  const visibleConditions = CONDITIONS.filter(
    (condition) => gender === 'female' || condition.value !== 'pcos'
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="medical-conditions-heading">
        <div>
          <h2 id="medical-conditions-heading" className="font-bold text-neutral-900 dark:text-neutral-100">
            بیماری‌های تشخیص‌داده‌شده
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            هر موردی را که پزشک برای شما تشخیص داده انتخاب کنید. اگر هیچ‌کدام را ندارید، موردی انتخاب نکنید.
          </p>
        </div>
        {visibleConditions.map((condition) => (
          <CheckboxCard
            key={condition.value}
            checked={value.medicalConditions.includes(condition.value)}
            onChange={() => toggleCondition(condition.value)}
            icon={condition.icon}
            label={condition.label}
            description={condition.description}
          />
        ))}
      </section>

      {gender === 'female' && (
        <section className="space-y-3" aria-labelledby="pregnancy-heading">
          <div>
            <h2 id="pregnancy-heading" className="font-bold text-neutral-900 dark:text-neutral-100">
              بارداری و شیردهی
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">یک گزینه را انتخاب کنید.</p>
          </div>
          {PREGNANCY_OPTIONS.map((option) => (
            <OptionCard
              key={option.value}
              selected={value.pregnancyStatus === option.value}
              onClick={() => updateAnswer({ pregnancyStatus: option.value })}
              icon={option.icon}
              label={option.label}
              description={option.description}
            />
          ))}
        </section>
      )}

      <section className="space-y-3" aria-labelledby="eating-disorder-heading">
        <div>
          <h2 id="eating-disorder-heading" className="font-bold text-neutral-900 dark:text-neutral-100">
            آیا اختلال خوردن داشته‌اید؟
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            این سؤال برای جلوگیری از محدودیت کالری نامناسب است و جای تشخیص پزشکی را نمی‌گیرد.
          </p>
        </div>
        {EATING_DISORDER_OPTIONS.map((option) => (
          <OptionCard
            key={option.value}
            selected={value.eatingDisorderStatus === option.value}
            onClick={() => updateAnswer({ eatingDisorderStatus: option.value })}
            icon={option.icon}
            label={option.label}
            description={option.description}
          />
        ))}
      </section>

      <div className="space-y-4">
        <Input
          label="آسیب‌دیدگی یا محدودیت جسمی (اختیاری)"
          placeholder="مثال: زانو درد، کمر درد، دیسک..."
          value={value.injuries}
          onChange={(event) => updateAnswer({ injuries: event.target.value })}
        />
        <Input
          label="داروهای مصرفی (اختیاری)"
          placeholder="مثال: متفورمین، لووتیروکسین..."
          value={value.medications}
          onChange={(event) => updateAnswer({ medications: event.target.value })}
        />
      </div>

      <CheckboxCard
        checked={value.safetyAnswersConfirmed}
        onChange={(checked) => onChange({
          safetyAnswersConfirmed: checked,
          safetyScreeningVersion: checked ? MEDICAL_SAFETY_SCREENING_VERSION : null,
        })}
        icon="🔒"
        label="درستی پاسخ‌ها را تأیید می‌کنم"
        description="می‌دانم این ارزیابی جایگزین پزشک نیست و پنهان‌کردن بیماری یا دارو می‌تواند برنامه را ناایمن کند."
      />
    </div>
  );
}
