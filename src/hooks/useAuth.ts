/**
 * useAuth.ts — No-OTP Phone Auth (register + silent returning-login)
 * ─────────────────────────────────────────────────────────────────────────────
 * Auth model (temporary MVP/testing bridge):
 *   • Phone number is normalized and mapped to a synthetic email.
 *   • The app first attempts sign-in. If no matching auth account exists, it
 *     attempts sign-up, then creates/repairs the user's profile row.
 *   • We intentionally DO NOT query user_profiles before authentication: RLS
 *     correctly blocks that anonymous lookup and it previously caused returning
 *     users to fall into signUp() and receive HTTP 422.
 *   • Sessions persist in localStorage (Supabase default: 60-day TTL with
 *     auto-refresh), so on top of this, most returning users never even see
 *     the phone screen again — this path only matters after signOut(),
 *     cleared storage, or a new device.
 *
 * ⚠️  SUPABASE PREREQUISITE (one-time dashboard step, already done):
 *   Authentication → Settings → uncheck "Enable email confirmations"
 *   Without this, signUp/signIn won't return a usable session.
 *
 * Synthetic email format:  989123456789@salahatiman.ir
 * Derived password:        98912345678_slmt
 * SECURITY BLOCKER BEFORE PUBLIC LAUNCH:
 * The derived password is predictable from the phone number. This flow is only
 * a functional bridge for MVP testing and MUST be replaced by a real ownership
 * proof (OTP or another secure authentication method) before public launch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Normalises an Iranian mobile number to E.164 (+98XXXXXXXXXX). */
function normalizeIranPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('98') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+98${digits.slice(1)}`;
  if (digits.startsWith('9') && digits.length === 10) return `+98${digits}`;
  return `+${digits}`;
}

function isValidIranPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  // Accepts: 09XXXXXXXXX (11 digits), 9XXXXXXXXX (10 digits), 989XXXXXXXXX (12 digits)
  return (
    (digits.startsWith('09') && digits.length === 11) ||
    (digits.startsWith('9') && digits.length === 10) ||
    (digits.startsWith('989') && digits.length === 12)
  );
}

function toSyntheticEmail(normalizedPhone: string): string {
  // Strip leading + so the email is valid
  return `${normalizedPhone.replace('+', '')}@salahatiman.ir`;
}

function toDerivedPassword(normalizedPhone: string): string {
  return `${normalizedPhone.replace('+', '')}_slmt`;
}

// ── types ────────────────────────────────────────────────────────────────────

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface UseAuthReturn extends AuthState {
  /**
   * Single entry point for the phone screen. Looks up the phone number:
   *   - New number      → registers a new account.
   *   - Existing number  → silently signs the returning user back in.
   * Throws only on genuine failure (bad format, network error, or an
   * existing phone whose synthetic credentials somehow don't match —
   * a rare edge case, not the normal "already registered" case anymore).
   */
  loginOrRegisterPhone: (phone: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

// ── hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    error: null,
  });

  // Hydrate from existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((s) => ({
        ...s,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({
        ...s,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ── loginOrRegisterPhone ───────────────────────────────────────────────────

  const loginOrRegisterPhone = async (phone: string): Promise<void> => {
    setState((s) => ({ ...s, loading: true, error: null }));

    if (!isValidIranPhone(phone)) {
      setState((s) => ({
        ...s,
        loading: false,
        error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹',
      }));
      return;
    }

    const normalized = normalizeIranPhone(phone);
    const email = toSyntheticEmail(normalized);
    const password = toDerivedPassword(normalized);

    const ensureProfileRow = async (userId: string) => {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, phone: normalized }, { onConflict: 'id' });

      if (profileError) {
        throw new Error('خطا در ذخیره اطلاعات حساب. دوباره تلاش کنید.');
      }
    };

    try {
      // Returning users are resolved by Auth itself. This avoids the previous
      // anonymous SELECT on user_profiles, which RLS correctly prevents.
      const signInResult = await supabase.auth.signInWithPassword({ email, password });

      if (!signInResult.error && signInResult.data.user) {
        await ensureProfileRow(signInResult.data.user.id);
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      // No usable session with the deterministic credentials: attempt account
      // creation. If Auth says the user already exists, credentials no longer
      // match and we fail closed instead of repeatedly calling signup.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        const lowerMessage = signUpError.message.toLowerCase();
        if (
          lowerMessage.includes('already registered') ||
          lowerMessage.includes('user already registered') ||
          signUpError.status === 422
        ) {
          throw new Error(
            'این شماره قبلاً ثبت شده اما ورود امن با آن انجام نشد. لطفاً با پشتیبانی تماس بگیرید.'
          );
        }
        throw new Error('خطا در ایجاد حساب. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
      }

      if (!data.session || !data.user) {
        await supabase.auth.signOut();
        throw new Error(
          'ایجاد نشست کاربری انجام نشد. تنظیمات تأیید ایمیل Supabase را بررسی کنید.'
        );
      }

      await ensureProfileRow(data.user.id);
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'خطای ناشناخته. دوباره تلاش کنید.';
      setState((s) => ({ ...s, loading: false, error: message }));
      throw err;
    }
  };

  // ── signOut ────────────────────────────────────────────────────────────────

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const clearError = () => setState((s) => ({ ...s, error: null }));

  return { ...state, loginOrRegisterPhone, signOut, clearError };
}
