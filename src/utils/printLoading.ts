export function showPrintLoading(popup: Window, origin: string) {
  const { document } = popup;
  document.documentElement.lang = 'fa';
  document.documentElement.dir = 'rtl';
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.style.cssText = 'display:grid;place-items:center;align-content:center;min-height:90vh;gap:1rem;color:#234536;font:600 16px sans-serif';
  const mascot = document.createElement('img');
  mascot.src = new URL('/mascot/behtan-rest.svg', origin).href;
  mascot.alt = '';
  mascot.width = 64;
  mascot.height = 75;
  status.append(mascot, 'در حال آماده‌سازی خروجی…');
  document.body.replaceChildren(status);
}
