export interface SmsMessage {
  phone: string;
  otp: string;
  message: string;
}

export interface SmsSendResult {
  provider: string;
  externalId?: string;
}

export interface SmsProvider {
  readonly name: string;
  send(input: SmsMessage): Promise<SmsSendResult>;
}

export class SmsProviderError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'SmsProviderError';
    this.status = status;
  }
}
