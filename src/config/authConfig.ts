/**
 * Behtan authentication feature switches.
 *
 * TESTING ONLY:
 * Set `otp.isActive` to false while SMS delivery is not configured. In this
 * mode the app uses the legacy deterministic Supabase email/password bridge,
 * so anyone who knows a phone number can authenticate as that test account.
 * NEVER launch publicly with OTP disabled.
 *
 * When the Iranian SMS provider is ready, change only:
 *   otp.isActive: true
 * and deploy again. The UI and the rest of the app do not need changes.
 */
export const AUTH_CONFIG = {
  otp: {
    isActive: false,
  },
} as const;

export type PhoneAuthMode = 'otp' | 'test_bridge';

export const PHONE_AUTH_MODE: PhoneAuthMode = AUTH_CONFIG.otp.isActive
  ? 'otp'
  : 'test_bridge';
