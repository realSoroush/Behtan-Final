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
      phone: session.user.phone ?? null,
    },
    expiresAt: session.expires_at ?? null,
  };
}

function mapSupabaseAuthError(error: unknown): AuthServiceError {
  const value = error as { message?: string; status?: number; code?: string } | null;
  const message = value?.message?.toLowerCase() ?? '';

  if (value?.status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return new AuthServiceError('rate_limited', value?.message);
  }

  if (message.includes('sms') || message.includes('provider') || message.includes('hook')) {
    return new AuthServiceError('sms_delivery_failed', value?.message);
  }

  if (message.includes('token') || message.includes('otp') || message.includes('invalid')) {
    return new AuthServiceError('invalid_otp', value?.message);
  }

  if (message.includes('fetch') || message.includes('network')) {
    return new AuthServiceError('network_error', value?.message);
  }

  return new AuthServiceError('unknown', value?.message);
}

export class SupabaseAuthAdapter implements AuthAdapter {
  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw mapSupabaseAuthError(error);
    return mapSession(data.session);
  }

  subscribe(listener: (session: AuthSession | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      listener(mapSession(session));
    });

    return () => data.subscription.unsubscribe();
  }

  async startPhoneAuth(phone: string): Promise<PhoneAuthStartResult> {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) throw mapSupabaseAuthError(error);
    return { status: 'otp_required' };
  }

  async verifyPhoneOtp(phone: string, token: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (error || !data.session || !data.user) {
      throw mapSupabaseAuthError(error ?? new Error('Missing session after OTP verification'));
    }

    // Keep profile bootstrap inside the adapter. The rest of the app does not
    // need to know which authentication backend is being used.
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert(
        {
          id: data.user.id,
          phone,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      await supabase.auth.signOut();
      throw new AuthServiceError('profile_bootstrap_failed', profileError.message);
    }

    return mapSession(data.session)!;
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw mapSupabaseAuthError(error);
  }
}
