import { PHONE_AUTH_MODE } from '@/config/authConfig';
import type { AuthAdapter } from './types';
import { SupabaseAuthAdapter } from './supabaseAuthAdapter';
import { SupabaseTestBridgeAuthAdapter } from './supabaseTestBridgeAuthAdapter';

export * from './types';
export * from './phone';
export { AUTH_CONFIG, PHONE_AUTH_MODE } from '@/config/authConfig';
export type { PhoneAuthMode } from '@/config/authConfig';

export type AuthDriverName = 'supabase';

function createAuthAdapter(): AuthAdapter {
  const configured = (import.meta.env.VITE_AUTH_DRIVER || 'supabase').toLowerCase();

  if (configured !== 'supabase') {
    // Fail closed. A misspelled driver must not silently downgrade auth.
    throw new Error(`[auth] Unsupported VITE_AUTH_DRIVER: ${configured}`);
  }

  if (PHONE_AUTH_MODE === 'test_bridge') {
    console.warn(
      '[auth] OTP IS DISABLED. Behtan is using the insecure test bridge. Do not use this mode for public launch.'
    );
    return new SupabaseTestBridgeAuthAdapter();
  }

  return new SupabaseAuthAdapter();
}

/**
 * Single auth dependency for the application.
 * A future Iran-hosted backend only needs another AuthAdapter implementation.
 */
export const authAdapter = createAuthAdapter();
