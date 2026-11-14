import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = 'cloudflare-turnstile-api';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loadPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (loadPromise) return loadPromise;
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = SCRIPT_URL;
  script.async = true;
  script.defer = true;
  loadPromise = new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error('TURNSTILE_LOAD_FAILED'));
    const timeout = window.setTimeout(fail, 15_000);
    const ready = () => {
      window.clearTimeout(timeout);
      if (window.turnstile) resolve();
      else fail();
    };
    script.onload = ready;
    script.onerror = () => { window.clearTimeout(timeout); fail(); };
    document.head.appendChild(script);
  }).catch(error => {
    script.onload = null;
    script.onerror = null;
    script.remove();
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}

export function TurnstileWidget({ resetKey, onToken, onError }: {
  resetKey: number;
  onToken: (token: string | null) => void;
  onError: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    let disposed = false;
    let widgetId: string | null = null;
    onToken(null);
    if (!siteKey) {
      onError();
      return;
    }
    void loadTurnstile().then(() => {
      if (disposed || !container.current || !window.turnstile) return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: 'auto',
        language: 'fa',
        size: 'flexible',
        action: 'request_phone_otp',
        callback: (token: string) => { if (!disposed) onToken(token); },
        'expired-callback': () => { if (!disposed) onToken(null); },
        'timeout-callback': () => { if (!disposed) { onToken(null); onError(); } },
        'error-callback': () => { if (!disposed) { onToken(null); onError(); } },
      });
    }).catch(() => { if (!disposed) onError(); });
    return () => {
      disposed = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey, onToken, onError]);

  return <div ref={container} className="min-h-[65px] w-full overflow-hidden" aria-label="تأیید امنیتی" />;
}
