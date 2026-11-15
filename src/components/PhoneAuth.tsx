import { pilotTimingsEnabled, recordPilotTiming } from '@/utils/pilotTimings';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import './onboarding/onboarding.css';
import './auth/phoneAuth.css';
import { normalizeOnboardingDigits } from '@/utils/onboardingExperience';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { AUTH_CONFIG } from '@/config/authConfig';
import { AuthServiceError } from '@/services/auth/types';

type AuthStep = 'phone' | 'otp';

interface PhoneAuthProps {
  onBack?: () => void;
}

export function PhoneAuth({ onBack }: PhoneAuthProps) {
  const { beginPhoneAuth, verifyPhoneOtp, loading, error, clearError } = useAuth();
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [captchaError, setCaptchaError] = useState(false);
  const sending = useRef(false);
  const smsStarted = useRef<number>();
  const [smsMarked, setSmsMarked] = useState(false);
  const handleCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
    if (token) setCaptchaError(false);
  }, []);
  const handleCaptchaError = useCallback(() => setCaptchaError(true), []);
  const retryCaptcha = () => {
    setCaptchaError(false);
    setCaptchaResetKey(value => value + 1);
  };

  const coolingDown = resendSeconds > 0;
  useEffect(() => {
    if (!coolingDown) return;
    const timer = window.setInterval(() => {
      setResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [coolingDown]);

  const handlePhoneChange = (value: string) => {
    setPhone(normalizeOnboardingDigits(value).replace(/[^\d\s\-+]/g, ''));
    if (error) clearError();
  };

  const handleOtpChange = (value: string) => {
    setOtp(normalizeOnboardingDigits(value).replace(/\D/g, '').slice(0, 6));
    if (error) clearError();
  };

  const sendCode = async (targetPhone: string) => {
    if (coolingDown || loading || sending.current) return;
    if (!captchaToken) { setCaptchaError(true); return; }
    sending.current = true;
    smsStarted.current = pilotTimingsEnabled() ? performance.now() : undefined;
    setSmsMarked(false);
    clearError();
    try {
      const result = await beginPhoneAuth(targetPhone, captchaToken);
      setNormalizedPhone(result.normalizedPhone);
      if (result.status === 'otp_required') {
        setOtp('');
        setStep('otp');
        setResendSeconds(AUTH_CONFIG.otp.resendSeconds);
      }
    } catch (failure) {
      if (failure instanceof AuthServiceError && (failure.code === 'rate_limited' || failure.code === 'request_timeout')) {
        setResendSeconds(AUTH_CONFIG.otp.resendSeconds);
        if (failure.code === 'request_timeout') {
          setNormalizedPhone(targetPhone);
          setStep('otp');
        }
      }
    } finally {
      sending.current = false;
      setCaptchaToken(null);
      setCaptchaResetKey(value => value + 1);
    }
  };

  const handleStartAuth = () => sendCode(phone);

  const handleVerifyOtp = async () => {
    clearError();
    try {
      await verifyPhoneOtp(normalizedPhone || phone, otp);
      // Root App observes the resulting session; this child does not force a route.
    } catch {
      // useAuth owns the user-facing error message.
    }
  };

  const handleResend = () => sendCode(normalizedPhone || phone);

  const markSmsSeen = () => {
    if (smsStarted.current === undefined) return;
    recordPilotTiming({ event: 'sms_seen', elapsed_ms: performance.now() - smsStarted.current, status: 'ok' });
    smsStarted.current = undefined;
    setSmsMarked(true);
  };

  const handleChangePhone = () => {
    clearError();
    setStep('phone');
    setOtp('');
    setNormalizedPhone('');
    setResendSeconds(0);
  };

  return (
    <div className="onboarding-app onboarding-auth relative min-h-screen flex flex-col" dir="rtl">
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
      <div className="onboarding-auth-intro flex-1 flex flex-col items-center justify-center px-6 text-center pb-8">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-primary-200 dark:shadow-primary-900/40 overflow-hidden"
        >
          <img
            src={APP_LOGO_PATH}
            alt={`لوگوی ${APP_NAME_FA}`}
            className="w-full h-full object-contain"
          />
        </div>

        <div
        >
          <h1 className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
            {APP_NAME_FA}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed text-sm">
            برنامه تغذیه هوشمند و شخصی‌سازی‌شده
          </p>
        </div>

        <div
          className="flex flex-wrap justify-center gap-2 mt-6"
        >
          {['کالری و ماکروها', 'وعده‌های روزانه', 'جایگزینی غذا'].map((feature) => (
            <span
              key={feature}
              className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800 rounded-full px-3 py-1"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>

      <div
        className="phone-auth-card onboarding-auth-panel bg-white dark:bg-neutral-900 rounded-t-3xl px-6 pt-8 pb-10 border-t border-neutral-100 dark:border-neutral-800 shadow-2xl shadow-black/5"
      >
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-1">
          {step === 'phone' ? 'ورود به برنامه' : 'تأیید شماره موبایل'}
        </h2>

        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
          {step === 'phone'
            ? 'شماره موبایل خود را وارد کنید تا کد تأیید یک‌بارمصرف برایتان ارسال شود.'
            : `کد ۶ رقمی شمارهٔ ${normalizedPhone || phone} را وارد کنید.`}
        </p>

        {step === 'phone' ? (
          <div className="flex flex-col gap-1.5 mb-4">
            <label htmlFor="auth-phone" className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              شماره موبایل
            </label>
            <div className="relative flex items-center">
              <span className="absolute right-4 text-lg select-none pointer-events-none">📱</span>
              <input
                id="auth-phone"
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
            <label htmlFor="auth-otp" className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              کد تأیید
            </label>
            <input
              id="auth-otp"
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

        <div className="mb-4">
          <TurnstileWidget
            resetKey={captchaResetKey}
            onToken={handleCaptchaToken}
            onError={handleCaptchaError}
          />
          {captchaError && !captchaToken && (
            <button type="button" className="mt-1 text-sm underline" onClick={retryCaptcha}>
              بارگذاری دوبارهٔ تأیید امنیتی
            </button>
          )}
        </div>

        {error && (
          <div role="alert"
            className="phone-auth-error flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3 mb-4"
          >
            <span className="text-red-500 text-base flex-shrink-0 mt-0.5">⚠️</span>
            <p className="text-sm text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
          </div>
        )}

        {step === 'phone' && coolingDown && (
          <p role="status" className="mb-2 text-sm">تلاش دوباره پس از {resendSeconds.toLocaleString('fa-IR')} ثانیه</p>
        )}
        {step === 'phone' ? (
          <Button onClick={handleStartAuth} loading={loading} disabled={!phone.trim() || !captchaToken || coolingDown}>
            {loading ? 'در حال ارسال...' : 'ارسال کد تأیید ←'}
          </Button>
        ) : (
          <>
            {pilotTimingsEnabled() && (
              <button type="button" disabled={smsMarked} className="mb-3 block text-sm underline" onClick={markSmsSeen}>
                {smsMarked ? 'زمان مشاهدهٔ پیامک ثبت شد' : 'پیامک رسید'}
              </button>
            )}
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
          ورود به حساب فقط پس از تأیید مالکیت شماره موبایل انجام می‌شود.
        </p>
      </div>
    </div>
  );
}
