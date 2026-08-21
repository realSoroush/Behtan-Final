import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { CheckboxCard } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { MedicalCondition } from '@/types';

const CONDITIONS: { value: MedicalCondition; icon: string; label: string; description: string }[] = [
  { value: 'diabetes', icon: '🩸', label: 'دیابت', description: 'دیابت نوع ۱ یا ۲' },
  { value: 'fatty_liver', icon: '🫀', label: 'کبد چرب', description: 'استئاتوهپاتیت غیرالکلی' },
  { value: 'pcos', icon: '🔬', label: 'سندروم تخمدان پلی‌کیستیک (PCOS)', description: 'ویژه بانوان' },
  { value: 'thyroid', icon: '🦋', label: 'مشکل تیروئید', description: 'کم‌کاری یا پرکاری' },
];

export function Step6Medical() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();

  const toggleCondition = (condition: MedicalCondition) => {
    const has = data.medicalConditions.includes(condition);
    updateData({
      medicalConditions: has
        ? data.medicalConditions.filter((c) => c !== condition)
        : [...data.medicalConditions, condition],
    });
  };

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="وضعیت پزشکی"
        subtitle="در صورت داشتن هر کدام از شرایط زیر، تیک بزنید. این اطلاعات فقط برای شخصی‌سازی برنامه استفاده می‌شود."
        onBack={prevStep}
      />

      {/* Conditions */}
      <div className="space-y-3">
        {CONDITIONS.map((c) => (
          <CheckboxCard
            key={c.value}
            checked={data.medicalConditions.includes(c.value)}
            onChange={() => toggleCondition(c.value)}
            icon={c.icon}
            label={c.label}
            description={c.description}
          />
        ))}
      </div>

      {/* Free text */}
      <Input
        label="آسیب‌دیدگی یا محدودیت جسمی (اختیاری)"
        placeholder="مثال: زانو درد، کمر درد، دیسک..."
        value={data.injuries}
        onChange={(e) => updateData({ injuries: e.target.value })}
      />

      <Input
        label="داروهای مصرفی (اختیاری)"
        placeholder="مثال: متفورمین، لووتیروکسین..."
        value={data.medications}
        onChange={(e) => updateData({ medications: e.target.value })}
      />

      <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed">
        ⚠️ این اپلیکیشن جایگزین مشاوره پزشکی نیست. در صورت داشتن بیماری خاص، حتماً با پزشک مشورت کنید.
      </p>

      <Button onClick={nextStep}>ادامه</Button>
    </div>
  );
}
