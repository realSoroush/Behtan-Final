import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import {
  AuthServiceError,
  type AuthAdapter,
  type AuthSession,
  type PhoneAuthStartResult,
} from './types';

function mapSession(session: Session | null): AuthSession | null {
  if (!session?.user) return null;

  return {
    user: {
      id: session.user.id,
      // Legacy bridge accounts do not have a native Supabase phone identity.
      // The normalized phone is kept in user_profiles and attached on login.
      phone: session.user.phone ?? null,
    },
    expiresAt: session.expires_at ?? null,
  };
}

function toSyntheticEmail(normalizedPhone: string): string {
  return `${normalizedPhone.replace('+', '')}@salahatiman.ir`;
}

function toDerivedPassword(normalizedPhone: string): string {
  return `${normalizedPhone.replace('+', '')}_slmt`;
}

/**
 * Temporary no-OTP bridge used only while Behtan is in controlled testing.
 *
 * SECURITY: credentials are deterministic from the phone number. This adapter
 * intentionally reproduces the pre-OTP behavior so existing test accounts keep
 * working. It MUST NOT be used for a public launch.
 */
export class SupabaseTestBridgeAuthAdapter implements AuthAdapter {
  private sessionPhone: string | null = null;

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new AuthServiceError('test_bridge_failed', error.message);

    const mapped = mapSession(data.session);
    if (!mapped) return null;

    if (!mapped.user.phone && data.session?.user.id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('phone')
        .eq('id', data.session.user.id)
        .maybeSingle();
      mapped.user.phone = profile?.phone ?? null;
    }

    return mapped;
  }

  subscribe(listener: (session: AuthSession | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const mapped = mapSession(session);
      if (mapped && !mapped.user.phone && this.sessionPhone) {
        mapped.user.phone = this.sessionPhone;
      }
      listener(mapped);
    });

    return () => data.subscription.unsubscribe();
  }

  async startPhoneAuth(phone: string): Promise<PhoneAuthStartResult> {
    this.sessionPhone = phone;
    const email = toSyntheticEmail(phone);
    const password = toDerivedPassword(phone);

    const ensureProfileRow = async (userId: string) => {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, phone }, { onConflict: 'id' });

      if (error) {
        await supabase.auth.signOut();
        throw new AuthServiceError('profile_bootstrap_failed', error.message);
      }
    };

    // Returning test account.
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (!signIn.error && signIn.data.user && signIn.data.session) {
      await ensureProfileRow(signIn.data.user.id);
      const session = mapSession(signIn.data.session)!;
      session.user.phone = phone;
      return { status: 'authenticated', session };
    }

    // New test account. Avoid anonymous user_profiles lookup because RLS blocks
    // it by design; Auth itself is the source of truth for account existence.
    const signUp = await supabase.auth.signUp({ email, password });
    if (signUp.error) {
      const message = signUp.error.message.toLowerCase();
      if (
        signUp.error.status === 422 ||
        message.includes('already registered') ||
        message.includes('user already registered')
      ) {
        throw new AuthServiceError(
          'test_bridge_failed',
          'این شماره قبلاً ثبت شده اما ورود آزمایشی با آن انجام نشد.'
        );
      }
      throw new AuthServiceError('test_bridge_failed', signUp.error.message);
    }

    if (!signUp.data.user || !signUp.data.session) {
      await supabase.auth.signOut();
      throw new AuthServiceError(
        'test_bridge_failed',
        'نشست آزمایشی ساخته نشد. Email confirmation را در Supabase بررسی کنید.'
      );
    }

    await ensureProfileRow(signUp.data.user.id);
    const session = mapSession(signUp.data.session)!;
    session.user.phone = phone;
    return { status: 'authenticated', session };
  }

  async verifyPhoneOtp(_phone: string, _token: string): Promise<AuthSession> {
    throw new AuthServiceError('invalid_otp', 'OTP در حالت تست غیرفعال است.');
  }

  async signOut(): Promise<void> {
    this.sessionPhone = null;
    const { error } = await supabase.auth.signOut();
    if (error) throw new AuthServiceError('test_bridge_failed', error.message);
  }
}
