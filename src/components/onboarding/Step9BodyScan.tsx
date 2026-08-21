import { useCallback, useRef, useState } from 'react';
import { Camera, Upload, X, ArrowLeft } from 'lucide-react';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import type { BodyType } from '@/types';

const BODY_TYPES: { value: BodyType; icon: string; label: string; description: string }[] = [
  { value: 'ectomorph', icon: '🦒', label: 'اکتومورف', description: 'لاغراندام، متابولیسم بالا، سخت وزن می‌گیرد' },
  { value: 'mesomorph', icon: '🏋️', label: 'مزومورف', description: 'عضلانی، تناسب اندام طبیعی' },
  { value: 'endomorph', icon: '🐻', label: 'اندومورف', description: 'تمایل به انباشت چربی، متابولیسم پایین‌تر' },
];

export function Step9BodyScan() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showManualSelection, setShowManualSelection] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        updateData({
          bodyScanImage: e.target?.result as string,
          bodyScanSkipped: false,
          manualBodyType: null,
        });
      };
      reader.readAsDataURL(file);
    },
    [updateData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSkip = () => {
    updateData({ bodyScanSkipped: true, bodyScanImage: null });
    setShowManualSelection(true);
  };

  const handleManualSelect = (bodyType: BodyType) => {
    updateData({ manualBodyType: bodyType, bodyScanSkipped: true });
  };

  const canContinue =
    !!data.bodyScanImage || (data.bodyScanSkipped && !!data.manualBodyType);

  if (showManualSelection || data.bodyScanSkipped) {
    return (
      <div className="space-y-6">
        <StepHeader
          step={currentStep}
          title="نوع بدن خود را انتخاب کنید"
          subtitle="بر اساس ساختار بدنی که در آینه می‌بینید، نزدیک‌ترین گزینه را انتخاب کنید."
          onBack={prevStep}
        />

        <div className="space-y-3">
          {BODY_TYPES.map((bt) => (
            <OptionCard
              key={bt.value}
              selected={data.manualBodyType === bt.value}
              onClick={() => handleManualSelect(bt.value)}
              icon={bt.icon}
              label={bt.label}
              description={bt.description}
            />
          ))}
        </div>

        <button
          type="button"
          className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 font-medium"
          onClick={() => {
            updateData({ bodyScanSkipped: false, manualBodyType: null });
            setShowManualSelection(false);
          }}
        >
          <ArrowLeft size={16} />
          برگشت به آپلود تصویر
        </button>

        <Button onClick={nextStep} disabled={!canContinue}>
          ادامه
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="اسکن بدن با هوش مصنوعی"
        subtitle="یک عکس تمام‌قد از خود آپلود کنید. AI ترکیب بدنی شما را تحلیل می‌کند."
        onBack={prevStep}
      />

      {/* Privacy notice */}
      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-2xl p-4 text-sm text-primary-700 dark:text-primary-300 leading-relaxed">
        🔒 تصویر شما به هیچ سرور خارجی ارسال نمی‌شود و فقط برای این تحلیل استفاده می‌شود.
      </div>

      {/* Drop zone */}
      {data.bodyScanImage ? (
        <div className="relative rounded-3xl overflow-hidden border-2 border-primary-500">
          <img src={data.bodyScanImage} alt="تصویر آپلود شده" className="w-full object-cover max-h-72" />
          <button
            onClick={() => updateData({ bodyScanImage: null })}
            className="absolute top-3 left-3 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all
            ${isDragging
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-neutral-300 dark:border-neutral-600 hover:border-primary-400 bg-neutral-50 dark:bg-neutral-800/50'
            }
          `}
        >
          <div className="flex justify-center gap-4 mb-4 text-neutral-400">
            <Camera size={36} />
            <Upload size={36} />
          </div>
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">عکس بکشید یا آپلود کنید</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">JPG، PNG — حداکثر ۱۰ مگابایت</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {/* Primary CTA */}
      <Button onClick={nextStep} disabled={!data.bodyScanImage}>
        تحلیل تصویر با هوش مصنوعی
      </Button>

      {/* PROMINENT skip button — spec requirement */}
      <button
        type="button"
        onClick={handleSkip}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 font-semibold hover:border-primary-400 hover:text-primary-600 transition-all"
      >
        <ArrowLeft size={18} />
        رد کردن و انتخاب دستی نوع بدن
      </button>
    </div>
  );
}
