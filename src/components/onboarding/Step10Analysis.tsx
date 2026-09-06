import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import { analyzeBodyScan, BodyScanError } from '@/lib/geminiClient';
import { hasCurrentBodyScanConsent } from '@/utils/bodyScanPrivacy';
import { calculateAge, toPersianDigits } from '@/utils/nutritionHelpers';
import type { BodyScanResult, BodyType } from '@/types';

const BODY_TYPE_LABELS: Record<BodyType, string> = {
  ectomorph: 'اکتومورف',
  mesomorph: 'مزومورف',
  endomorph: 'اندومورف',
};

const CONFIDENCE_LABELS = { low: 'پایین', medium: 'متوسط', high: 'بالا' } as const;

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

type DisplayAnalysis = {
  bodyFatPct: number | null;
  biologicalAge: number | null;
  bodyType: BodyType;
  estimatedMuscleMass: 'low' | 'average' | 'high' | null;
  narrative: string;
  confidence: 'low' | 'medium' | 'high' | null;
  source: 'ai' | 'manual';
};

function StatCard({ emoji, label, value, sub }: { emoji: string; label: string; value: string; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-neutral-100 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span className="text-3xl">{emoji}</span>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-neutral-900 dark:text-neutral-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
    </motion.div>
  );
}

function manualDisplay(bodyType: BodyType): DisplayAnalysis {
  return {
    bodyFatPct: null,
    biologicalAge: null,
    bodyType,
    estimatedMuscleMass: null,
    narrative: `نوع بدن ${BODY_TYPE_LABELS[bodyType]} بر اساس انتخاب خود شما ثبت شد. چون تصویری تحلیل نشده است، درصد چربی، سن بیولوژیک و توده عضلانی حدس زده نمی‌شوند و در محاسبه کالری نیز وارد نخواهند شد.`,
    confidence: null,
    source: 'manual',
  };
}

function aiDisplay(result: BodyScanResult): DisplayAnalysis {
  return { ...result, source: 'ai' };
}

export function Step10Analysis() {
  const {
    data,
    updateData,
    nextStep,
    saveCurrentStep,
    prevStep,
    currentStep,
    isSubmitting,
  } = useOnboardingStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [error, setError] = useState('');
  const [manualFallback, setManualFallback] = useState(false);

  const result: BodyScanResult | null = data.bodyScanResult;
  const imageBase64 = data.bodyScanImage;
  const consentGranted = hasCurrentBodyScanConsent(data);

  const abortActiveAnalysis = useCallback(() => {
    requestSequenceRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!imageBase64 || !data.weight || !data.height || !data.birthDate || !data.gender) {
      setError('اطلاعات لازم برای تحلیل کامل نیست. به مرحله قبل برگردید و تصویر را دوباره ثبت کنید.');
      setStatus('error');
      return;
    }

    if (!consentGranted) {
      setError('رضایت معتبر برای پردازش تصویر ثبت نشده است. به مرحله قبل برگردید.');
      setStatus('error');
      return;
    }

    abortActiveAnalysis();
    const requestId = requestSequenceRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus('loading');
    setError('');
    setManualFallback(false);
    updateData({ bodyScanAnalysisRequestedAt: new Date().toISOString() });

    try {
      const age = calculateAge(data.birthDate);
      const scanResult = await analyzeBodyScan(
        {
          imageBase64,
          gender: data.gender,
          heightCm: data.height,
          weightKg: data.weight,
          age,
        },
        { signal: controller.signal, timeoutMs: 45_000 }
      );

      if (controller.signal.aborted || requestId !== requestSequenceRef.current) return;

      // The result may persist; the raw photo must not remain in app state once
      // the analysis has completed successfully.
      updateData({ bodyScanResult: scanResult, bodyScanImage: null });
      setStatus('success');
      // Persist only the validated result/consent metadata so a refresh does
      // not force a second paid analysis request. The profile saver strips the
      // raw image defensively even though it was already cleared above.
      await saveCurrentStep();
    } catch (caughtError) {
      if (controller.signal.aborted || requestId !== requestSequenceRef.current) return;
      setError(
        caughtError instanceof BodyScanError
          ? caughtError.message
          : 'خطای ناشناخته‌ای رخ داد. لطفاً دوباره تلاش کنید.'
      );
      setStatus('error');
    } finally {
      if (requestId === requestSequenceRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, [
    abortActiveAnalysis,
    consentGranted,
    data.birthDate,
    data.gender,
    data.height,
    data.weight,
    imageBase64,
    saveCurrentStep,
    updateData,
  ]);

  const handleBackToImage = () => {
    abortActiveAnalysis();
    setStatus('idle');
    setError('');
    prevStep();
  };

  useEffect(() => {
    if (data.bodyScanResult) {
      setStatus('success');
      return undefined;
    }

    if (data.bodyScanSkipped && data.manualBodyType) {
      setManualFallback(true);
      setStatus('success');
      return undefined;
    }

    if (!imageBase64) {
      setError('تصویر خام ذخیره نمی‌شود و برای ادامه باید یک عکس تازه ثبت یا آپلود کنید.');
      setStatus('error');
      return undefined;
    }

    // As in the camera step, scheduling prevents React StrictMode from issuing
    // two development-only requests during its setup/cleanup probe.
    const startTimer = window.setTimeout(() => {
      void runAnalysis();
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
      abortActiveAnalysis();
    };
  }, [
    abortActiveAnalysis,
    imageBase64,
    data.bodyScanResult,
    data.bodyScanSkipped,
    data.manualBodyType,
    runAnalysis,
  ]);

  const displayResult = useMemo<DisplayAnalysis | null>(() => {
    if (result) return aiDisplay(result);
    if ((data.bodyScanSkipped || manualFallback) && data.manualBodyType) {
      return manualDisplay(data.manualBodyType);
    }
    return null;
  }, [result, data.bodyScanSkipped, data.manualBodyType, manualFallback]);

  const muscleLabel = (value: DisplayAnalysis['estimatedMuscleMass']) => {
    if (value == null) return 'اندازه‌گیری نشده';
    if (value === 'low') return 'پایین';
    if (value === 'average') return 'متوسط';
    return 'بالا';
  };

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="تحلیل ترکیب بدنی"
        subtitle="نتایج تخمینی بر اساس تصویر یا انتخاب شما"
        onBack={handleBackToImage}
      />

      <AnimatePresence mode="wait">
        {status === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-12"
          >
            <Loader2 size={40} className="animate-spin text-primary-500" />
            <p className="font-medium text-neutral-600 dark:text-neutral-400">در حال تحلیل امن تصویر…</p>
            <p className="text-center text-sm text-neutral-400">
              بسته به سرعت اینترنت ممکن است تا ۴۵ ثانیه طول بکشد.
            </p>
            <button
              type="button"
              onClick={handleBackToImage}
              className="mt-2 flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <X size={17} /> لغو و بازگشت
            </button>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-8"
          >
            <AlertCircle size={40} className="text-red-500" />
            <p className="text-center font-medium text-red-600 dark:text-red-400">{error}</p>
            {imageBase64 && consentGranted && (
              <button
                type="button"
                onClick={() => void runAnalysis()}
                className="flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
              >
                <RefreshCw size={17} /> تلاش مجدد با همین تصویر
              </button>
            )}
            <button
              type="button"
              onClick={handleBackToImage}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <ArrowRight size={17} /> بازگشت و انتخاب تصویر جدید
            </button>
          </motion.div>
        )}

        {displayResult && status === 'success' && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                emoji="💧"
                label="درصد چربی بدن"
                value={displayResult.bodyFatPct == null ? 'اندازه‌گیری نشده' : `${toPersianDigits(displayResult.bodyFatPct)}٪`}
                sub={displayResult.confidence ? `اطمینان: ${CONFIDENCE_LABELS[displayResult.confidence]}` : undefined}
              />
              <StatCard
                emoji="🎂"
                label="سن بیولوژیک تخمینی"
                value={displayResult.biologicalAge == null ? 'محاسبه نشده' : `${toPersianDigits(displayResult.biologicalAge)} سال`}
                sub={displayResult.source === 'ai' ? 'نمایشی؛ در فرمول کالری استفاده نمی‌شود' : undefined}
              />
              <StatCard emoji="🏗️" label="نوع بدن" value={BODY_TYPE_LABELS[displayResult.bodyType]} />
              <StatCard emoji="💪" label="توده عضلانی تخمینی" value={muscleLabel(displayResult.estimatedMuscleMass)} />
            </div>

            <div className="rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 to-emerald-50 p-5 dark:border-primary-800 dark:from-primary-900/20 dark:to-emerald-900/20">
              <p className="mb-2 text-2xl">🌟</p>
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {displayResult.narrative}
              </p>
            </div>

            {displayResult.source === 'ai' && (
              <div className="flex items-start gap-2 rounded-2xl bg-neutral-100 p-3 text-xs leading-relaxed text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary-500" />
                عکس خام در حساب شما ذخیره نشده و پس از دریافت نتیجه از حافظه برنامه پاک شده است.
              </div>
            )}

            <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
              ⚠️ این نتایج تخمینی هستند و جایگزین ارزیابی پزشکی نمی‌شوند.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {displayResult && status === 'success' && (
        <Button onClick={() => void nextStep()} loading={isSubmitting}>
          ادامه به مرحله پایانی
        </Button>
      )}
    </div>
  );
}
