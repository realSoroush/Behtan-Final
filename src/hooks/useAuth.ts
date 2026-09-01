/**
 * UI-facing authentication state.
 *
 * This hook knows nothing about concrete Supabase auth calls. The active mode
 * is selected behind authAdapter. OTP can be temporarily disabled for testing
 * without removing the OTP infrastructure.
 */

import { useEffect, useState } from 'react';
import {
  AuthServiceError,
  PHONE_AUTH_MODE,
  authAdapter,
  isValidIranPhone,
  normalizeIranPhone,
  type AuthSession,
  type AuthUser,
  type PhoneAuthMode,
} from '@/services/auth';

interface AuthState {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

export interface BeginPhoneAuthResult {
  normalizedPhone: string;
  status: 'otp_required' | 'authenticated';
}

interface UseAuthReturn extends AuthState {
  phoneAuthMode: PhoneAuthMode;
  beginPhoneAuth: (phone: string) => Promise<BeginPhoneAuthResult>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

function userMessageForAuthError(error: unknown, fallback: string): string {
  if (error instanceof AuthServiceError) {
    switch (error.code) {
      case 'rate_limited':
        return 'درخواست‌های زیادی ارسال شده است. کمی صبر کنید و دوباره تلاش کنید.';
      case 'invalid_otp':
        return 'کد تأیید صحیح نیست یا منقضی شده است. دوباره بررسی کنید.';
      case 'sms_delivery_failed':
        return 'ارسال پیامک تأیید انجام نشد. چند لحظه دیگر دوباره تلاش کنید.';
      case 'profile_bootstrap_failed':
        return 'ورود انجام شد اما ساخت پروفایل با خطا مواجه شد. دوباره تلاش کنید.';
      case 'test_bridge_failed':
        return error.message || 'ورود آزمایشی انجام نشد. دوباره تلاش کنید.';
      case 'network_error':
        return 'ارتباط با سرویس ورود برقرار نشد. اتصال اینترنت را بررسی کنید.';
      default:
        break;
    }
  }

  return fallback;
}

export { normalizeIranPhone, isValidIranPhone } from '@/services/auth';

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    authAdapter
      .getSession()
      .then((session) => {
        if (!mounted) return;
        setState((current) => ({
          ...current,
          session,
          user: session?.user ?? null,
          loading: false,
        }));
      })
      .catch((error) => {
        if (!mounted) return;
        setState((current) => ({
          ...current,
          session: null,
          user: null,
          loading: false,
          error: userMessageForAuthError(error, 'خطا در بررسی وضعیت ورود.'),
        }));
      });

    const unsubscribe = authAdapter.subscribe((session) => {
      if (!mounted) return;
      setState((current) => ({
        ...current,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const beginPhoneAuth = async (phone: string): Promise<BeginPhoneAuthResult> => {
    setState((current) => ({ ...current, loading: true, error: null }));

    if (!isValidIranPhone(phone)) {
      const message = 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹';
      setState((current) => ({ ...current, loading: false, error: message }));
      throw new Error(message);
    }

    const normalized = normalizeIranPhone(phone);

    try {
      const result = await authAdapter.startPhoneAuth(normalized);

      if (result.status === 'authenticated') {
        setState((current) => ({
          ...current,
          session: result.session,
          user: result.session.user,
          loading: false,
          error: null,
        }));
      } else {
        setState((current) => ({ ...current, loading: false }));
      }

      return {
        normalizedPhone: normalized,
        status: result.status,
      };
    } catch (error) {
      const fallback =
        PHONE_AUTH_MODE === 'otp'
          ? 'ارسال کد تأیید انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.'
          : 'ورود آزمایشی انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.';
      const message = userMessageForAuthError(error, fallback);
      setState((current) => ({ ...current, loading: false, error: message }));
      throw new Error(message);
    }
  };

  const verifyPhoneOtp = async (phone: string, token: string): Promise<void> => {
    setState((current) => ({ ...current, loading: true, error: null }));

    if (PHONE_AUTH_MODE !== 'otp') {
      const message = 'OTP در حالت تست غیرفعال است.';
      setState((current) => ({ ...current, loading: false, error: message }));
      throw new Error(message);
    }

    const normalized = normalizeIranPhone(phone);
    const cleanToken = token.replace(/\D/g, '');

    if (!isValidIranPhone(normalized) || !/^\d{6}$/.test(cleanToken)) {
      const message = 'کد تأیید باید ۶ رقم باشد.';
      setState((current) => ({ ...current, loading: false, error: message }));
      throw new Error(message);
    }

    try {
      const session = await authAdapter.verifyPhoneOtp(normalized, cleanToken);
      setState((current) => ({
        ...current,
        session,
        user: session.user,
        loading: false,
        error: null,
      }));
    } catch (error) {
      const message = userMessageForAuthError(
        error,
        'تأیید شماره موبایل انجام نشد. کد را بررسی کنید و دوباره تلاش کنید.'
      );
      setState((current) => ({ ...current, loading: false, error: message }));
      throw new Error(message);
    }
  };

  const signOut = async () => {
    try {
      await authAdapter.signOut();
    } catch (error) {
      const message = userMessageForAuthError(error, 'خروج از حساب انجام نشد. دوباره تلاش کنید.');
      setState((current) => ({ ...current, error: message }));
      throw new Error(message);
    }
  };

  const clearError = () => setState((current) => ({ ...current, error: null }));

  return {
    ...state,
    phoneAuthMode: PHONE_AUTH_MODE,
    beginPhoneAuth,
    verifyPhoneOtp,
    signOut,
    clearError,
  };
}
