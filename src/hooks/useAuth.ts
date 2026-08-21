/**
 * useAuth.ts — No-OTP Phone Auth (register + silent returning-login)
 * ─────────────────────────────────────────────────────────────────────────────
 * Auth model:
 *   • Phone number is the user's unique identity.
 *   • On phone entry the app checks user_profiles.phone:
 *       – Not found  → create Supabase account + insert profile row → session
 *                       (new user → App.tsx routes to onboarding).
 *       – Found      → silently sign in with the same derived credentials
 *                       (returning user → App.tsx routes to dashboard).
 *         No OTP, no extra screen — this is intentional for MVP/testing.
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
 * (Neither is a real email or a real secret — the phone IS the identity.
 *  This is an explicit MVP tradeoff: anyone who knows a phone number can
 *  sign in as that user. Fine for testing; revisit before real launch.)
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

    // 1. Validate format
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

    try {
      // 2. Look up the phone in user_profiles to decide the branch
      const { data: existing, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('phone', normalized)
        .maybeSingle();

      if (checkError) {
        throw new Error('خطا در بررسی شماره. اتصال اینترنت را بررسی کنید.');
      }

      if (existing) {
        // ── Returning user: silent sign-in, no OTP ──────────────────────────
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          // Rare edge case: profile row exists but auth credentials don't
          // match (e.g. manually edited DB). Not the common path.
          throw new Error(
            'ورود با این شماره ممکن نشد. لطفاً با پشتیبانی تماس بگیرید.'
          );
        }

        // onAuthStateChange fires → App.tsx sees an existing profile → dashboard
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      // ── New user: register ────────────────────────────────────────────────
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        // Handle the rare race where the auth row exists but profile doesn't
        if (
          signUpError.message.toLowerCase().includes('already registered') ||
          signUpError.message.toLowerCase().includes('user already registered')
        ) {
          // Someone else created the auth user without a profile row somehow.
          // Fall back to sign-in with the same derived credentials.
          const { error: fallbackSignInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (fallbackSignInError) {
            throw new Error('این شماره قبلاً استفاده شده و ورود با آن ممکن نیست.');
          }
          setState((s) => ({ ...s, loading: false }));
          return;
        }
        throw new Error('خطا در ایجاد حساب. دوباره تلاش کنید.');
      }

      // Guard: email confirmation is blocking the session
      if (!data.session) {
        await supabase.auth.signOut();
        throw new Error(
          'لطفاً در داشبورد Supabase، گزینه "Enable email confirmations" را غیرفعال کنید و دوباره تلاش کنید.'
        );
      }

      // Insert the phone number into user_profiles
      // (RLS: auth.uid() = id — the new session satisfies this)
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({ id: data.user!.id, phone: normalized });

      if (profileError) {
        // Auth user was created but profile insert failed.
        // Roll back the auth user to avoid orphans.
        await supabase.auth.signOut();
        throw new Error('خطا در ذخیره اطلاعات. دوباره تلاش کنید.');
      }

      // onAuthStateChange fires automatically → App.tsx transitions to onboarding
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
