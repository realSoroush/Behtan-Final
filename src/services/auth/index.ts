import type { AuthAdapter } from './types';
import { SupabaseAuthAdapter } from './supabaseAuthAdapter';

export * from './types';
export * from './phone';
export { AUTH_CONFIG } from '@/config/authConfig';

export type AuthDriverName = 'supabase';

function createAuthAdapter(): AuthAdapter {
  const configured = (import.meta.env.VITE_AUTH_DRIVER || 'supabase').toLowerCase();

  if (configured !== 'supabase') {
    // Fail closed. A misspelled driver must not silently downgrade auth.
    throw new Error(`[auth] Unsupported VITE_AUTH_DRIVER: ${configured}`);
  }

  return new SupabaseAuthAdapter();
}

/**
 * Single auth dependency for the application.
 * A future Iran-hosted backend only needs another AuthAdapter implementation.
 */
export const authAdapter = createAuthAdapter();
