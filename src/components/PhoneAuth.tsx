/**
 * PhoneAuth.tsx — Single-screen phone login/registration (no OTP)
 * ─────────────────────────────────────────────────────────
 * New number:      account created silently → onboarding
 * Existing number:  signed back in silently → dashboard
 * Returning user with an active session: App.tsx skips this screen entirely
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

interface PhoneAuthProps {
  onAuthenticated: () => void;
}

export function PhoneAuth({ onAuthenticated }: PhoneAuthProps) {
  const { loginOrRegisterPhone, loading, error, clearError } = useAuth();
  const [phone, setPhone] = useState('');

  const handleSubmit = async () => {
    clearError();
    try {
      await loginOrRegisterPhone(phone);
      onAuthenticated();
    } catch {
      // Error is set inside useAuth and displayed below
    }
  };

  const handlePhoneChange = (value: string) => {
    // Accept only digits, spaces, dashes, and leading +
    setPhone(value.replace(/[^\d\s\-+]/g, ''));
    if (error) clearError();
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col">

      {/* ── Hero ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="w-24 h-24 bg-primary-500 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-primary-200 dark:shadow-primary-900/40"
        >
          <span className="text-5xl">🥗</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h1 className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
            سلامتی من
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed text-sm">
            برنامه تغذیه هوشمند و شخصی‌سازی‌شده
          </p>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap justify-center gap-2 mt-6"
        >
          {['🔥 محاسبه کالری دقیق', '🍽️ ۶ وعده روزانه', '🔄 جایگزینی غذا'].map((f) => (
            <span
              key={f}
              className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800 rounded-full px-3 py-1"
            >
              {f}
            </span>
          ))}
        </motion.div>
      </div>

      {/* ── Auth card ───────────────────────────────────────── */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 25 }}
        className="bg-white dark:bg-neutral-900 rounded-t-3xl px-6 pt-8 pb-10 border-t border-neutral-100 dark:border-neutral-800 shadow-2xl shadow-black/5"
      >
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-1">
          ورود به برنامه
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
          شماره موبایل خود را وارد کنید. اگر قبلاً ثبت‌نام کرده باشید مستقیم وارد می‌شوید،
          در غیر این صورت حساب جدید برایتان ساخته می‌شود.
        </p>

        {/* Phone input */}
        <div className="flex flex-col gap-1.5 mb-4">
          <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            شماره موبایل
          </label>
          <div className="relative flex items-center">
            <span className="absolute right-4 text-lg select-none pointer-events-none">📱</span>
            <input
              type="tel"
              inputMode="numeric"
              dir="ltr"
              placeholder="09123456789"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmit()}
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

        {/* Error message */}
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

        {/* Submit */}
        <Button onClick={handleSubmit} loading={loading} disabled={!phone.trim()}>
          {loading ? 'در حال بررسی...' : 'ورود به برنامه ←'}
        </Button>

        {/* Fine print */}
        <p className="text-xs text-center text-neutral-400 dark:text-neutral-600 mt-4 leading-relaxed">
          با ورود، شماره موبایل شما به عنوان شناسه ثبت می‌شود.
          <br />
          نیازی به رمز عبور یا کد تأیید نیست.
        </p>
      </motion.div>
    </div>
  );
}
