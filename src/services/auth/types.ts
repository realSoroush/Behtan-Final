export interface AuthUser {
  id: string;
  phone: string | null;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt?: number | null;
}

export type AuthErrorCode =
  | 'invalid_phone'
  | 'invalid_otp'
  | 'rate_limited'
  | 'sms_delivery_failed'
  | 'profile_bootstrap_failed'
  | 'network_error'
  | 'test_bridge_failed'
  | 'unknown';

export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthServiceError';
    this.code = code;
  }
}

export type PhoneAuthStartResult =
  | { status: 'otp_required' }
  | { status: 'authenticated'; session: AuthSession };

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>;
  subscribe(listener: (session: AuthSession | null) => void): () => void;
  startPhoneAuth(phone: string): Promise<PhoneAuthStartResult>;
  verifyPhoneOtp(phone: string, token: string): Promise<AuthSession>;
  signOut(): Promise<void>;
}
