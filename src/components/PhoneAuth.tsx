import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

type AuthStep = 'phone' | 'otp';

interface PhoneAuthProps {
  onBack?: () => void;
}

export function PhoneAuth({ onBack }: PhoneAuthProps) {
  const { beginPhoneAuth, verifyPhoneOtp, phoneAuthMode, loading, error, clearError } = useAuth();
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const handlePhoneChange = (value: string) => {
    setPhone(value.replace(/[^\d\s\-+]/g, ''));
    if (error) clearError();
  };

  const handleOtpChange = (value: string) => {
    setOtp(value.replace(/\D/g, '').slice(0, 6));
    if (error) clearError();
  };

  const handleStartAuth = async () => {
    clearError();
    try {
      const result = await beginPhoneAuth(phone);
      setNormalizedPhone(result.normalizedPhone);

      if (result.status === 'authenticated') {
        // Root App observes the shared Supabase session and decides whether
        // this user belongs in onboarding or Dashboard after profile hydration.
        return;
      }

      setOtp('');
      setStep('otp');
      setResendSeconds(60);
    } catch {
      // useAuth owns the user-facing error message.
    }
  };

  const handleVerifyOtp = async () => {
    clearError();
    try {
      await verifyPhoneOtp(normalizedPhone || phone, otp);
      // Root App observes the resulting session; this child does not force a route.
    } catch {
      // useAuth owns the user-facing error message.
    }
  };

  const handleResend = async () => {
    if (resendSeconds > 0 || loading) return;
    clearError();
    try {
      const result = await beginPhoneAuth(normalizedPhone || phone);
      setNormalizedPhone(result.normalizedPhone);
      setResendSeconds(60);
    } catch {
      // useAuth owns the user-facing error message.
    }
  };

  const handleChangePhone = () => {
    clearError();
    setStep('phone');
    setOtp('');
    setNormalizedPhone('');
    setResendSeconds(0);
  };

  return (
    <div className="relative min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col">
      <ThemeToggle className="fixed right-4 top-4 z-50" />
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="fixed left-4 top-4 z-50 inline-flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white/80 px-3 text-xs font-bold text-neutral-600 shadow-sm backdrop-blur transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          <ArrowRight size={16} aria-hidden="true" />
          صفحه اصلی
        </button>
      )}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-primary-200 dark:shadow-primary-900/40 overflow-hidden"
        >
          <img
            src={APP_LOGO_PATH}
            alt={`لوگوی ${APP_NAME_FA}`}
            className="w-full h-full object-contain"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h1 className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
            {APP_NAME_FA}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed text-sm">
            برنامه تغذیه هوشمند و شخصی‌سازی‌شده
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap justify-center gap-2 mt-6"
        >
          {['🔥 محاسبه کالری دقیق', '🍽️ ۶ وعده روزانه', '🔄 جایگزینی غذا'].map((feature) => (
            <span
              key={feature}
              className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800 rounded-full px-3 py-1"
            >
              {feature}
            </span>
          ))}
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 25 }}
        className="bg-white dark:bg-neutral-900 rounded-t-3xl px-6 pt-8 pb-10 border-t border-neutral-100 dark:border-neutral-800 shadow-2xl shadow-black/5"
      >
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-1">
          {step === 'phone' ? 'ورود به برنامه' : 'تأیید شماره موبایل'}
        </h2>

        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
          {step === 'phone'
            ? phoneAuthMode === 'otp'
              ? 'شماره موبایل خود را وارد کنید تا کد تأیید یک‌بارمصرف برایتان ارسال شود.'
              : 'شماره موبایل خود را برای ورود آزمایشی وارد کنید.'
            : `کد ۶ رقمی ارسال‌شده به ${normalizedPhone || phone} را وارد کنید.`}
        </p>

        {step === 'phone' ? (
          <div className="flex flex-col gap-1.5 mb-4">
            <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              شماره موبایل
            </label>
            <div className="relative flex items-center">
              <span className="absolute right-4 text-lg select-none pointer-events-none">📱</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                dir="ltr"
                placeholder="09123456789"
                value={phone}
                onChange={(event) => handlePhoneChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !loading && phone.trim()) void handleStartAuth();
                }}
                className={`
                  w-full bg-neutral-50 dark:bg-neutral-800
                  border rounded-2xl py-4 pr-12 pl-4
                  text-left text-lg tracking-widest
                  outline-none transition-all
                  placeholder:text-neutral-300 dark:placeholder:text-neutral-600
                  ${
                    error
                      ? 'border-red-400 focus:ring-2 focus:ring-red-300'
                      : 'border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                  }
                `}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mb-4">
            <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              کد تأیید
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(event) => handleOtpChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !loading && otp.length === 6) void handleVerifyOtp();
              }}
              autoFocus
              className={`
                w-full bg-neutral-50 dark:bg-neutral-800 border rounded-2xl py-4 px-4
                text-center text-2xl tracking-[0.45em] outline-none transition-all
                placeholder:text-neutral-300 dark:placeholder:text-neutral-600
                ${
                  error
                    ? 'border-red-400 focus:ring-2 focus:ring-red-300'
                    : 'border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                }
              `}
            />
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3 mb-4"
          >
            <span className="text-red-500 text-base flex-shrink-0 mt-0.5">⚠️</span>
            <p className="text-sm text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
          </motion.div>
        )}

        {step === 'phone' ? (
          <Button onClick={handleStartAuth} loading={loading} disabled={!phone.trim()}>
            {loading
              ? phoneAuthMode === 'otp'
                ? 'در حال ارسال...'
                : 'در حال ورود...'
              : phoneAuthMode === 'otp'
                ? 'ارسال کد تأیید ←'
                : 'ورود ←'}
          </Button>
        ) : (
          <>
            <Button onClick={handleVerifyOtp} loading={loading} disabled={otp.length !== 6}>
              {loading ? 'در حال تأیید...' : 'تأیید و ورود ←'}
            </Button>

            <div className="flex items-center justify-between gap-3 mt-4 text-sm">
              <button
                type="button"
                onClick={handleChangePhone}
                disabled={loading}
                className="text-neutral-500 dark:text-neutral-400 disabled:opacity-40"
              >
                تغییر شماره
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading || resendSeconds > 0}
                className="text-primary-600 dark:text-primary-400 disabled:text-neutral-400 dark:disabled:text-neutral-600"
              >
                {resendSeconds > 0 ? `ارسال مجدد (${resendSeconds})` : 'ارسال مجدد کد'}
              </button>
            </div>
          </>
        )}

        <p className="text-xs text-center text-neutral-400 dark:text-neutral-600 mt-5 leading-relaxed">
          {phoneAuthMode === 'otp'
            ? 'ورود به حساب فقط پس از تأیید مالکیت شماره موبایل انجام می‌شود.'
            : 'حالت تست فعال است؛ ارسال پیامک و تأیید OTP موقتاً غیرفعال است.'}
        </p>
      </motion.div>
    </div>
  );
}
