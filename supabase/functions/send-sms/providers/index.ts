import type { SmsProvider } from '../core/types.ts';
import { GenericHttpSmsProvider, type EnvReader } from './genericHttp.ts';

export function createSmsProvider(env: EnvReader): SmsProvider {
  const selected = (env('SMS_PROVIDER') ?? 'generic_http').toLowerCase();

  switch (selected) {
    case 'generic_http':
      return new GenericHttpSmsProvider(env);
    default:
      throw new Error(`Unsupported SMS_PROVIDER: ${selected}`);
  }
}
