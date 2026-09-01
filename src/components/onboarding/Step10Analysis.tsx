import { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StepHeader } from '@/components/ui/StepHeader';
import { Button } from '@/components/ui/Button';
import { useOnboardingStore } from '@/hooks/useOnboardingStore';
import { analyzeBodyScan, BodyScanError } from '@/lib/geminiClient';
import { calculateAge, toPersianDigits } from '@/utils/nutritionHelpers';
import type { BodyScanResult, BodyType } from '@/types';

const BODY_TYPE_LABELS: Record<BodyType, string> = {
  ectomorph: 'اکتومورف',
  mesomorph: 'مزومورف',
  endomorph: 'اندومورف',
};

const CONFIDENCE_LABELS = { low: 'پایین', medium: 'متوسط', high: 'بالا' } as const;

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
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 p-4 text-center"
    >
      <span className="text-3xl">{emoji}</span>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{label}</p>
      <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
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
  return {
    ...result,
    source: 'ai',
  };
}

export function Step10Analysis() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [manualFallback, setManualFallback] = useState(false);

  const result: BodyScanResult | null = data.bodyScanResult;

  const runAnalysis = async () => {
    if (!data.bodyScanImage || !data.weight || !data.height || !data.birthDate || !data.gender) return;

    setStatus('loading');
    setError('');
    setManualFallback(false);

    try {
      const age = calculateAge(data.birthDate);
      const scanResult = await analyzeBodyScan({
        imageBase64: data.bodyScanImage,
        gender: data.gender,
        heightCm: data.height,
        weightKg: data.weight,
        age,
      });
      updateData({ bodyScanResult: scanResult });
      setStatus('success');
    } catch (err) {
      setError(err instanceof BodyScanError ? err.message : 'خطای ناشناخته. لطفاً دوباره تلاش کنید.');
      setStatus('error');
    }
  };

  const useManualSelection = () => {
    if (!data.manualBodyType) return;

    // Important: do NOT write a fabricated BodyScanResult into onboarding data.
    // OnboardingWizard will therefore save body_fat_pct = null while still saving
    // manualBodyType as body_type.
    updateData({ bodyScanResult: null });
    setManualFallback(true);
    setStatus('success');
    setError('');
  };

  useEffect(() => {
    if (data.bodyScanResult && status === 'idle') {
      setStatus('success');
      return;
    }

    if (data.bodyScanImage && !data.bodyScanResult && status === 'idle') {
      void runAnalysis();
      return;
    }

    if (data.bodyScanSkipped && !data.bodyScanResult && status === 'idle') {
      setManualFallback(true);
      setStatus('success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        onBack={prevStep}
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
            <p className="text-neutral-600 dark:text-neutral-400 font-medium">در حال تحلیل تصویر با هوش مصنوعی...</p>
            <p className="text-sm text-neutral-400">چند ثانیه صبر کنید</p>
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
            <p className="text-red-600 dark:text-red-400 font-medium text-center">{error}</p>
            <button onClick={() => void runAnalysis()} className="flex items-center gap-2 text-primary-600 font-semibold">
              <RefreshCw size={16} /> تلاش مجدد
            </button>
            {data.manualBodyType && (
              <button onClick={useManualSelection} className="text-neutral-500 text-sm underline">
                استفاده از انتخاب دستی
              </button>
            )}
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

            <div className="bg-gradient-to-br from-primary-50 to-emerald-50 dark:from-primary-900/20 dark:to-emerald-900/20 rounded-3xl p-5 border border-primary-100 dark:border-primary-800">
              <p className="text-2xl mb-2">🌟</p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed text-sm">
                {displayResult.narrative}
              </p>
            </div>

            <p className="text-xs text-center text-neutral-400 dark:text-neutral-500">
              ⚠️ این نتایج تخمینی هستند و جایگزین ارزیابی پزشکی نمی‌شوند.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {(displayResult || status === 'error') && (
        <Button onClick={nextStep}>ادامه به مرحله پایانی</Button>
      )}
    </div>
  );
}
