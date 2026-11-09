import { useRef } from 'react';
export function StudioNavigation({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const jump = (selector: string) => {
    const target = root.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  return <div ref={root} className="studio-navigation-root">
    <nav className="studio-jump-nav" aria-label="دسترسی سریع برنامه‌ساز">
      <button type="button" onClick={() => jump('.studio-editor')}>ویرایش برنامه</button>
      <button type="button" onClick={() => jump('.studio-bank')}>افزودن از بانک</button>
      <button type="button" onClick={() => jump('.authored-live-preview')}>پیش‌نمایش</button>
    </nav>
    {children}
  </div>;
}
