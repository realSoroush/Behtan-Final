import { useEffect, useState } from 'react';
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

const CONFIDENCE_LABELS = { low: 'پایین', medium: 'متوسط', high: 'بالا' };

// ============================================================================
// Stat card
// ============================================================================
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

// ============================================================================
// Step component
// ============================================================================
export function Step10Analysis() {
  const { data, updateData, nextStep, prevStep, currentStep } = useOnboardingStore();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  const result: BodyScanResult | null = data.bodyScanResult;

  // If body scan was skipped, build a simulated result from the manually chosen body type
  const buildManualResult = (): BodyScanResult | null => {
    if (!data.manualBodyType || !data.weight || !data.birthDate || !data.gender) return null;
    const age = calculateAge(data.birthDate);

    const defaults: Record<BodyType, { fat: number; muscle: 'low' | 'average' | 'high' }> = {
      ectomorph: { fat: 14, muscle: 'low' },
      mesomorph: { fat: 18, muscle: 'high' },
      endomorph: { fat: 28, muscle: 'average' },
    };

    const { fat, muscle } = defaults[data.manualBodyType];
    const genderAdj = data.gender === 'female' ? 8 : 0;

    return {
      bodyFatPct: fat + genderAdj,
      biologicalAge: age + (data.manualBodyType === 'endomorph' ? 2 : -1),
      bodyType: data.manualBodyType,
      estimatedMuscleMass: muscle,
      narrative: `بر اساس انتخاب شما، بدن شما از نوع ${BODY_TYPE_LABELS[data.manualBodyType]} است. برنامه تغذیه‌ای که برایتان طراحی خواهد شد، دقیقاً با این ساختار بدنی هماهنگ شده است. شما قدم اول را برداشته‌اید — ادامه دهید!`,
      confidence: 'medium',
    };
  };

  const runAnalysis = async () => {
    if (!data.bodyScanImage || !data.weight || !data.height || !data.birthDate || !data.gender) return;
    setStatus('loading');
    setError('');
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

  // Auto-run scan when component mounts (if we have an image and no result yet)
  useEffect(() => {
    if (data.bodyScanImage && !data.bodyScanResult && status === 'idle') {
      runAnalysis();
    }
    if (data.bodyScanSkipped && !data.bodyScanResult && status === 'idle') {
      const manual = buildManualResult();
      if (manual) {
        updateData({ bodyScanResult: manual });
        setStatus('success');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayResult = result ?? (status === 'success' ? buildManualResult() : null);

  return (
    <div className="space-y-6">
      <StepHeader
        step={currentStep}
        title="تحلیل ترکیب بدنی"
        subtitle="نتایج تخمینی بر اساس تصویر یا انتخاب شما"
        onBack={prevStep}
      />

      <AnimatePresence mode="wait">
        {/* Loading */}
        {status === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-12">
            <Loader2 size={40} className="animate-spin text-primary-500" />
            <p className="text-neutral-600 dark:text-neutral-400 font-medium">در حال تحلیل تصویر با هوش مصنوعی...</p>
            <p className="text-sm text-neutral-400">چند ثانیه صبر کنید</p>
          </motion.div>
        )}

        {/* Error */}
        {status === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-8">
            <AlertCircle size={40} className="text-red-500" />
            <p className="text-red-600 dark:text-red-400 font-medium text-center">{error}</p>
            <button onClick={runAnalysis} className="flex items-center gap-2 text-primary-600 font-semibold">
              <RefreshCw size={16} /> تلاش مجدد
            </button>
            <button onClick={() => {
              const manual = buildManualResult();
              if (manual) { updateData({ bodyScanResult: manual }); setStatus('success'); }
            }} className="text-neutral-500 text-sm underline">
              استفاده از انتخاب دستی
            </button>
          </motion.div>
        )}

        {/* Results */}
        {displayResult && (status === 'success' || !!result) && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard emoji="💧" label="درصد چربی بدن (تخمینی)"
                value={`${toPersianDigits(displayResult.bodyFatPct)}٪`}
                sub={`اطمینان: ${CONFIDENCE_LABELS[displayResult.confidence]}`} />
              <StatCard emoji="🎂" label="سن بیولوژیک"
                value={`${toPersianDigits(displayResult.biologicalAge)} سال`} />
              <StatCard emoji="🏗️" label="نوع بدن"
                value={BODY_TYPE_LABELS[displayResult.bodyType]} />
              <StatCard emoji="💪" label="توده عضلانی تخمینی"
                value={displayResult.estimatedMuscleMass === 'low' ? 'پایین' : displayResult.estimatedMuscleMass === 'average' ? 'متوسط' : 'بالا'} />
            </div>

            {/* Narrative */}
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
