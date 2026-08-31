/**
 * UI-facing authentication state.
 *
 * This hook deliberately knows nothing about Supabase APIs. The active auth
 * backend is selected behind `authAdapter`, so a domestic backend can be
 * introduced later without rewriting PhoneAuth or the rest of the app.
 */

import { useEffect, useState } from 'react';
import {
  AuthServiceError,
  authAdapter,
  isValidIranPhone,
  normalizeIranPhone,
  type AuthSession,
  type AuthUser,
} from '@/services/auth';

interface AuthState {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

interface UseAuthReturn extends AuthState {
  sendPhoneOtp: (phone: string) => Promise<string>;
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
        return 'شماره تأیید شد اما ساخت پروفایل با خطا مواجه شد. دوباره تلاش کنید.';
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

  const sendPhoneOtp = async (phone: string): Promise<string> => {
    setState((current) => ({ ...current, loading: true, error: null }));

    if (!isValidIranPhone(phone)) {
      const message = 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹';
      setState((current) => ({ ...current, loading: false, error: message }));
      throw new Error(message);
    }

    const normalized = normalizeIranPhone(phone);

    try {
      await authAdapter.requestPhoneOtp(normalized);
      setState((current) => ({ ...current, loading: false }));
      return normalized;
    } catch (error) {
      const message = userMessageForAuthError(
        error,
        'ارسال کد تأیید انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.'
      );
      setState((current) => ({ ...current, loading: false, error: message }));
      throw new Error(message);
    }
  };

  const verifyPhoneOtp = async (phone: string, token: string): Promise<void> => {
    setState((current) => ({ ...current, loading: true, error: null }));

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
    sendPhoneOtp,
    verifyPhoneOtp,
    signOut,
    clearError,
  };
}
