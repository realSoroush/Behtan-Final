import { supabase } from '@/lib/supabaseClient';

export async function proPlanAccessToken(signal: AbortSignal) {
  signal.throwIfAborted();
  const session = await new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>((resolve, reject) => {
    // getSession has no AbortSignal parameter and can wait on the auth lock.
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    supabase.auth.getSession().then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
  if (session.error || !session.data.session) throw new Error('PRO_AUTH_REQUIRED');
  return session.data.session.access_token;
}
