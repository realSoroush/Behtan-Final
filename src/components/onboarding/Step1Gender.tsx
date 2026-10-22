import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { Gender } from '@/types';

export const PROVINCES = [
  'تهران', 'اصفهان', 'فارس', 'خراسان رضوی', 'مازندران',
  'آذربایجان شرقی', 'آذربایجان غربی', 'کرمانشاه', 'البرز', 'گیلان',
  'خوزستان', 'کرمان', 'گلستان', 'قم', 'هرمزگان',
  'لرستان', 'سیستان و بلوچستان', 'همدان', 'مرکزی', 'بوشهر',
  'زنجان', 'اردبیل', 'چهارمحال و بختیاری', 'کهگیلویه و بویراحمد',
  'سمنان', 'ایلام', 'خراسان شمالی', 'خراسان جنوبی', 'قزوین', 'یزد', 'کردستان'
];

export const CITIES_BY_PROVINCE: Record<string, string[]> = {
  تهران: ['تهران', 'ری', 'شهریار', 'اسلامشهر', 'پردیس', 'دماوند', 'ورامین', 'رباط‌کریم'],
  اصفهان: ['اصفهان', 'کاشان', 'خمینی‌شهر', 'نجف‌آباد', 'شاهین‌شهر', 'فلاورجان', 'زرین‌شهر'],
  'خراسان رضوی': ['مشهد', 'نیشابور', 'سبزوار', 'قوچان', 'تربت‌حیدریه', 'کاشمر'],
  البرز: ['کرج', 'نظرآباد', 'هشتگرد', 'طالقان', 'ساوجبلاغ'],
  فارس: ['شیراز', 'مرودشت', 'کازرون', 'جهرم', 'لارستان', 'فسا', 'داراب'],
  گیلان: ['رشت', 'بندر انزلی', 'لاهیجان', 'رودبار', 'آستارا'],
  مازندران: ['ساری', 'بابل', 'آمل', 'قائم‌شهر', 'نوشهر', 'چالوس', 'تنکابن'],
};

// Retained for the existing admin scenario picker; onboarding accepts actual city names.
export const DEFAULT_CITIES = ['مرکز استان', 'شهرهای دیگر'];


export function Step1Gender() {
  const { data, updateData, nextStep, currentStep, prevStep } = useOnboardingStore();
  const cities = CITIES_BY_PROVINCE[data.province] ?? [];
  const [customCity,setCustomCity]=useState(()=>Boolean(data.city&&!cities.includes(data.city)));

  const canContinue = Boolean(data.displayName?.trim()) && !!data.gender && !!data.province && Boolean(data.city.trim());

  const handleGender = (g: Gender) => {if(g===data.gender)return;updateData({
    gender: g,
    medicalConditions: g === 'male'
      ? data.medicalConditions.filter((condition) => condition !== 'pcos')
      : data.medicalConditions,
    pregnancyStatus: g === 'male' ? 'not_applicable' : null,
    safetyScreeningVersion: null,
    safetyAnswersConfirmed: false,
  });};
  const handleProvince = (province: string) => {if(province===data.province)return;setCustomCity(false);updateData({ province, city: '' });};

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="از خودت بگو"
        subtitle="با نام و چند اطلاعات ساده شروع می‌کنیم."
        onBack={prevStep}
      />

      <label className="block space-y-2">
        <span className="text-sm font-semibold">چه اسمی صدات کنیم؟</span>
        <input aria-label="چه اسمی صدات کنیم؟" autoComplete="given-name" maxLength={80}
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent px-4 py-3"
          value={data.displayName ?? ''} onChange={(e) => updateData({ displayName: e.target.value })} />
      </label>
      {/* Gender */}
      <div>
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">جنسیت</p>
        <div className="grid grid-cols-2 gap-3">
          <OptionCard
            selected={data.gender === 'male'}
            onClick={() => handleGender('male')}
            icon={<UserRound size={24}/>}
            label="مرد"
          />
          <OptionCard
            selected={data.gender === 'female'}
            onClick={() => handleGender('female')}
            icon={<UserRound size={24}/>}
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
      {cities.length>0&&<Select
        label="شهر"
        value={customCity?'__other':data.city}
        onChange={(e) => {const other=e.target.value==='__other';setCustomCity(other);updateData({ city: other?'':e.target.value });}}
        placeholder="شهر را انتخاب کنید"
        options={[...cities.map((c) => ({ value: c, label: c })),{value:'__other',label:'شهر من در فهرست نیست'}]}
        disabled={!data.province}
      />}
      {(cities.length===0||customCity)&&<Input label="نام شهر" autoComplete="address-level2" maxLength={80} placeholder="نام شهرت را بنویس" value={data.city} disabled={!data.province} onChange={e=>updateData({city:e.target.value})}/>}

      <div className="onboarding-actions"><Button onClick={nextStep} disabled={!canContinue}>
        ادامه
      </Button></div>
    </div>
  );
}
