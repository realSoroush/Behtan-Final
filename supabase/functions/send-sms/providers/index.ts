import type { SmsProvider } from '../core/types.ts';
import { SmsIrProvider } from './smsIr.ts';

export type EnvReader = (name: string) => string | undefined;

export function createSmsProvider(env: EnvReader): SmsProvider {
  return new SmsIrProvider(env);
}
