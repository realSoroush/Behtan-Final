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
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    loadPromise = new Promise((resolve, reject) => {
      if (existing.dataset.loaded === 'true') {
        if (window.turnstile) resolve();
        else reject(new Error('TURNSTILE_LOAD_FAILED'));
        return;
      }
      existing.addEventListener('load', () => {
        if (window.turnstile) resolve();
        else reject(new Error('TURNSTILE_LOAD_FAILED'));
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('TURNSTILE_LOAD_FAILED')), { once: true });
    });
    return loadPromise;
  }
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      if (window.turnstile) resolve();
      else reject(new Error('TURNSTILE_LOAD_FAILED'));
    };
    script.onerror = () => reject(new Error('TURNSTILE_LOAD_FAILED'));
    document.head.appendChild(script);
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
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'timeout-callback': () => onToken(null),
        'error-callback': () => { onToken(null); onError(); },
      });
    }).catch(onError);
    return () => {
      disposed = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey, onToken, onError]);

  return <div ref={container} className="min-h-[65px] w-full overflow-hidden" aria-label="تأیید امنیتی" />;
}
