import type { AuthAdapter } from './types';
import { SupabaseAuthAdapter } from './supabaseAuthAdapter';

export * from './types';
export * from './phone';

export type AuthDriverName = 'supabase';

function createAuthAdapter(): AuthAdapter {
  const configured = (import.meta.env.VITE_AUTH_DRIVER || 'supabase').toLowerCase();

  switch (configured) {
    case 'supabase':
      return new SupabaseAuthAdapter();
    default:
      // Fail closed. A misspelled driver must not silently downgrade auth.
      throw new Error(`[auth] Unsupported VITE_AUTH_DRIVER: ${configured}`);
  }
}

/**
 * Single auth dependency for the application.
 * A future Iran-hosted backend only needs another AuthAdapter implementation.
 */
export const authAdapter = createAuthAdapter();
