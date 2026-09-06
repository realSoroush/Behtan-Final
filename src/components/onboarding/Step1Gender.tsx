import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { Gender } from '@/types';

const PROVINCES = [
  'تهران', 'اصفهان', 'فارس', 'خراسان رضوی', 'مازندران',
  'آذربایجان شرقی', 'آذربایجان غربی', 'کرمانشاه', 'البرز', 'گیلان',
  'خوزستان', 'کرمان', 'گلستان', 'قم', 'هرمزگان',
  'لرستان', 'سیستان و بلوچستان', 'همدان', 'مرکزی', 'بوشهر',
  'زنجان', 'اردبیل', 'چهارمحال و بختیاری', 'کهگیلویه و بویراحمد',
  'سمنان', 'ایلام', 'خراسان شمالی', 'خراسان جنوبی', 'قزوین', 'یزد', 'گلستان'
];

const CITIES_BY_PROVINCE: Record<string, string[]> = {
  تهران: ['تهران', 'ری', 'شهریار', 'اسلامشهر', 'پردیس', 'دماوند', 'ورامین', 'رباط‌کریم'],
  اصفهان: ['اصفهان', 'کاشان', 'خمینی‌شهر', 'نجف‌آباد', 'شاهین‌شهر', 'فلاورجان', 'زرین‌شهر'],
  'خراسان رضوی': ['مشهد', 'نیشابور', 'سبزوار', 'قوچان', 'تربت‌حیدریه', 'کاشمر'],
  البرز: ['کرج', 'نظرآباد', 'هشتگرد', 'طالقان', 'ساوجبلاغ'],
  فارس: ['شیراز', 'مرودشت', 'کازرون', 'جهرم', 'لارستان', 'فسا', 'داراب'],
  گیلان: ['رشت', 'بندر انزلی', 'لاهیجان', 'رودبار', 'آستارا'],
  مازندران: ['ساری', 'بابل', 'آمل', 'قائم‌شهر', 'نوشهر', 'چالوس', 'تنکابن'],
};

const DEFAULT_CITIES = ['مرکز استان', 'شهرهای دیگر'];

export function Step1Gender() {
  const { data, updateData, nextStep, currentStep, prevStep } = useOnboardingStore();
  const cities = CITIES_BY_PROVINCE[data.province] ?? DEFAULT_CITIES;

  const canContinue = !!data.gender && !!data.province && !!data.city;

  const handleGender = (g: Gender) => updateData({
    gender: g,
    city: '',
    medicalConditions: g === 'male'
      ? data.medicalConditions.filter((condition) => condition !== 'pcos')
      : data.medicalConditions,
    pregnancyStatus: g === 'male' ? 'not_applicable' : null,
    safetyScreeningVersion: null,
    safetyAnswersConfirmed: false,
  });
  const handleProvince = (province: string) => updateData({ province, city: '' });

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="اطلاعات پایه"
        subtitle="برای شروع، جنسیت و محل سکونت خود را مشخص کنید."
        onBack={prevStep}
      />

      {/* Gender */}
      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">جنسیت</p>
        <div className="grid grid-cols-2 gap-3">
          <OptionCard
            selected={data.gender === 'male'}
            onClick={() => handleGender('male')}
            icon="🧔"
            label="مرد"
          />
          <OptionCard
            selected={data.gender === 'female'}
            onClick={() => handleGender('female')}
            icon="👩"
            label="زن"
          />
        </div>
      </div>

      {/* Province */}
      <Select
        label="استان"
        value={data.province}
        onChange={(e) => handleProvince(e.target.value)}
        placeholder="استان را انتخاب کنید"
        options={PROVINCES.map((p) => ({ value: p, label: p }))}
      />

      {/* City */}
      <Select
        label="شهر"
        value={data.city}
        onChange={(e) => updateData({ city: e.target.value })}
        placeholder="شهر را انتخاب کنید"
        options={cities.map((c) => ({ value: c, label: c }))}
        disabled={!data.province}
      />

      <Button onClick={nextStep} disabled={!canContinue}>
        ادامه
      </Button>
    </div>
  );
}
