import { useCallback, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Upload,
  X,
} from 'lucide-react';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/Card';
import { BodyScanCamera } from './BodyScanCamera';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import {
  BODY_SCAN_CONSENT_VERSION,
  hasCurrentBodyScanConsent,
} from '@/utils/bodyScanPrivacy';
import { normalizeBodyScanFile, BodyScanImageError } from '@/utils/bodyScanImage';
import type { BodyType } from '@/types';

const BODY_TYPES: { value: BodyType; icon: string; label: string; description: string }[] = [
  { value: 'ectomorph', icon: '🦒', label: 'اکتومورف', description: 'لاغراندام، متابولیسم بالا، سخت وزن می‌گیرد' },
  { value: 'mesomorph', icon: '🏋️', label: 'مزومورف', description: 'عضلانی، تناسب اندام طبیعی' },
  { value: 'endomorph', icon: '🐻', label: 'اندومورف', description: 'تمایل به انباشت چربی، متابولیسم پایین‌تر' },
];

export function Step9BodyScan() {
  const {
    data,
    updateData,
    nextStep,
    prevStep,
    currentStep,
    isSubmitting,
  } = useOnboardingStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showManualSelection, setShowManualSelection] = useState(false);

  const consentGranted = hasCurrentBodyScanConsent(data);

  const clearBodyScanImage = useCallback(() => {
    updateData({
      bodyScanImage: null,
      bodyScanResult: null,
      bodyScanAnalysisRequestedAt: null,
    });
    setImageError(null);
  }, [updateData]);

  const handleImageReady = useCallback((imageDataUrl: string) => {
    updateData({
      bodyScanImage: imageDataUrl,
      bodyScanSkipped: false,
      manualBodyType: null,
      bodyScanResult: null,
      bodyScanAnalysisRequestedAt: null,
    });
    setImageError(null);
  }, [updateData]);

  const handleFile = useCallback(async (file: File) => {
    if (!consentGranted) {
      setImageError('ابتدا رضایت تحلیل تصویر را تأیید کنید.');
      return;
    }

    setIsPreparingImage(true);
    setImageError(null);

    try {
      const safeImageDataUrl = await normalizeBodyScanFile(file);
      handleImageReady(safeImageDataUrl);
    } catch (error) {
      setImageError(
        error instanceof BodyScanImageError
          ? error.message
          : 'آماده‌سازی تصویر انجام نشد. لطفاً فایل دیگری انتخاب کنید.'
      );
    } finally {
      setIsPreparingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [consentGranted, handleImageReady]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleConsentChange = (accepted: boolean) => {
    if (accepted) {
      updateData({
        bodyScanConsentAccepted: true,
        bodyScanConsentVersion: BODY_SCAN_CONSENT_VERSION,
        bodyScanConsentAcceptedAt: new Date().toISOString(),
        bodyScanAnalysisRequestedAt: null,
      });
      setImageError(null);
      return;
    }

    updateData({
      bodyScanConsentAccepted: false,
      bodyScanConsentVersion: null,
      bodyScanConsentAcceptedAt: null,
      bodyScanAnalysisRequestedAt: null,
      bodyScanImage: null,
      bodyScanResult: null,
    });
    setImageError(null);
  };

  const handleSkip = () => {
    updateData({
      bodyScanSkipped: true,
      bodyScanImage: null,
      bodyScanResult: null,
      bodyScanConsentAccepted: false,
      bodyScanConsentVersion: null,
      bodyScanConsentAcceptedAt: null,
      bodyScanAnalysisRequestedAt: null,
    });
    setShowManualSelection(true);
    setImageError(null);
  };

  const handleManualSelect = (bodyType: BodyType) => {
    updateData({ manualBodyType: bodyType, bodyScanSkipped: true });
  };

  const handleAnalyze = async () => {
    if (!data.bodyScanImage || !consentGranted) {
      setImageError('برای تحلیل، رضایت را تأیید و یک تصویر معتبر ثبت یا آپلود کنید.');
      return;
    }

    updateData({ bodyScanAnalysisRequestedAt: new Date().toISOString() });
    await nextStep();
  };

  const canContinueManually = data.bodyScanSkipped && Boolean(data.manualBodyType);

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
          {BODY_TYPES.map((bodyType) => (
            <OptionCard
              key={bodyType.value}
              selected={data.manualBodyType === bodyType.value}
              onClick={() => handleManualSelect(bodyType.value)}
              icon={bodyType.icon}
              label={bodyType.label}
              description={bodyType.description}
            />
          ))}
        </div>

        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400"
          onClick={() => {
            updateData({ bodyScanSkipped: false, manualBodyType: null });
            setShowManualSelection(false);
          }}
        >
          <ArrowLeft size={16} />
          برگشت به ثبت یا آپلود تصویر
        </button>

        <Button onClick={() => void nextStep()} disabled={!canContinueManually} loading={isSubmitting}>
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
        subtitle="روبه‌روی دوربین بایستید یا یک عکس تمام‌قد آپلود کنید."
        onBack={prevStep}
      />

      <div className="space-y-3 rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-200">
        <div className="flex items-start gap-2 leading-relaxed">
          <LockKeyhole size={19} className="mt-0.5 shrink-0" />
          <p>
            عکس فقط پس از زدن «تحلیل تصویر» از مسیر امن به Google Gemini ارسال می‌شود.
            به‌تن عکس خام را در پروفایل، دیتابیس یا Storage ذخیره نمی‌کند و فقط نتیجه تخمینی را نگه می‌دارد.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/70 p-3 text-neutral-700 dark:bg-neutral-950/30 dark:text-neutral-200">
          <input
            type="checkbox"
            checked={consentGranted}
            onChange={(event) => handleConsentChange(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-primary-600"
          />
          <span className="leading-relaxed">
            با پردازش این عکس برای همین تحلیل موافقم و می‌دانم نتیجه تقریبی است و جایگزین ارزیابی پزشکی نیست.
          </span>
        </label>
      </div>

      {data.bodyScanImage ? (
        <div className="space-y-2">
          <div className="relative aspect-[3/4] overflow-hidden rounded-3xl border-2 border-primary-500 bg-neutral-900">
            <img
              src={data.bodyScanImage}
              alt="پیش‌نمایش تصویر آماده تحلیل"
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={clearBodyScanImage}
              className="absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
              aria-label="حذف تصویر و گرفتن عکس دوباره"
            >
              <X size={19} />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl bg-black/60 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm">
              <CheckCircle2 size={16} className="text-primary-300" />
              تصویر آماده تحلیل است
            </div>
          </div>
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            پیش‌نمایش دوربین جلو آینه‌ای است؛ فایل نهایی با جهت واقعی تحلیل می‌شود.
          </p>
        </div>
      ) : (
        <BodyScanCamera consentGranted={consentGranted} onCapture={handleImageReady} />
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (consentGranted && !isPreparingImage) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!consentGranted) {
            setImageError('ابتدا رضایت تحلیل تصویر را تأیید کنید.');
            return;
          }
          if (!isPreparingImage) fileInputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (!consentGranted) {
            setImageError('ابتدا رضایت تحلیل تصویر را تأیید کنید.');
            return;
          }
          if (!isPreparingImage) fileInputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-disabled={!consentGranted || isPreparingImage}
        className={`cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition-all ${
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-neutral-300 bg-neutral-50 hover:border-primary-400 dark:border-neutral-600 dark:bg-neutral-800/50'
        } ${!consentGranted || isPreparingImage ? 'opacity-60' : ''}`}
      >
        <div className="mb-4 flex justify-center gap-4 text-neutral-400">
          {isPreparingImage ? (
            <Loader2 size={36} className="animate-spin text-primary-500" />
          ) : (
            <>
              <Camera size={36} />
              <Upload size={36} />
            </>
          )}
        </div>
        <p className="font-semibold text-neutral-700 dark:text-neutral-300">
          {isPreparingImage ? 'در حال آماده‌سازی امن تصویر…' : 'عکس بکشید یا آپلود کنید'}
        </p>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">JPG، PNG — حداکثر ۱۰ مگابایت</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {imageError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
        >
          {imageError}
        </div>
      )}

      <Button
        onClick={() => void handleAnalyze()}
        disabled={!data.bodyScanImage || !consentGranted || isPreparingImage}
        loading={isSubmitting}
      >
        تحلیل تصویر با هوش مصنوعی
      </Button>

      <button
        type="button"
        onClick={handleSkip}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-neutral-200 py-3 font-semibold text-neutral-600 transition-all hover:border-primary-400 hover:text-primary-600 dark:border-neutral-700 dark:text-neutral-400"
      >
        <ArrowLeft size={18} />
        رد کردن و انتخاب دستی نوع بدن
      </button>
    </div>
  );
}
