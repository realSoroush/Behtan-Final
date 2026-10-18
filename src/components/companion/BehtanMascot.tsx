import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Rive } from '@rive-app/canvas';
import type { CompanionMood } from './companionState';
import './companion.css';

export type MascotMood = CompanionMood | 'idle' | 'listening' | 'rest';
export const MASCOT_MODES: Record<MascotMood, number> = {
  idle: 0, welcome: 1, listening: 2, thinking: 3, celebrate: 4, calm: 5, guide: 6, rest: 7,
};
// Preview supplies embedded bytes; production serves versioned assets locally.
export const CompanionAssets = createContext({
  rive: '/mascot/behtan-companion.riv', fallback: '/mascot/behtan-rest.svg', wasm: '',
});

interface Props {
  mood?: MascotMood;
  size?: 'small' | 'medium' | 'hero' | 'studio';
  reactionKey?: string | number;
  priority?: boolean;
}

/** The canvas animates individual vector parts. No transform is applied to its container. */
export function BehtanMascot({ mood = 'idle', size = 'medium', reactionKey, priority = false }: Props) {
  const assets = useContext(CompanionAssets);
  const wrapper = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<Rive | null>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [status, setStatus] = useState<'static' | 'loading' | 'ready' | 'fallback'>('static');
  const [greet, setGreet] = useState(0);
  const previousGreet = useRef(0);
  const [hidden, setHidden] = useState(document.hidden);
  const timers = useRef<number[]>([]);
  const gazeFrame = useRef(0);
  const gazeSleep = useRef(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    media.addEventListener('change', change);
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '60px' });
    if (wrapper.current) observer.observe(wrapper.current);
    return () => {
      observer.disconnect(); media.removeEventListener('change', change);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    if (reduced || !visible || hidden || !canvas.current || player.current || status === 'fallback') return;
    let cancelled = false;
    let instance: Rive | undefined;
    let resize: ResizeObserver | undefined;
    const idle = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const { createCompanion } = await import('./riveRuntime');
        if (cancelled || !canvas.current) return;
        instance = createCompanion(canvas.current, assets, () => {
          if (cancelled || !instance) return;
          player.current = instance;
          instance.resizeDrawingSurfaceToCanvas(Math.min(window.devicePixelRatio || 1, 2));
          resize = new ResizeObserver(() => instance?.resizeDrawingSurfaceToCanvas(Math.min(window.devicePixelRatio || 1, 2)));
          if (wrapper.current) resize.observe(wrapper.current);
          setStatus('ready');
        }, () => {
          if (!cancelled) { instance?.cleanup(); player.current = null; setStatus('fallback'); }
        });
      } catch { if (!cancelled) setStatus('fallback'); }
    }, priority ? 100 : 180);
    return () => {
      cancelled = true; window.clearTimeout(idle); resize?.disconnect();
      instance?.cleanup(); player.current = null;
    };
    // A loaded instance is retained across mode changes. Visibility tears it down,
    // so hidden profile tabs never keep a RAF loop or stale canvas alive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, hidden, assets, priority]);

  useEffect(() => {
    const r = player.current;
    timers.current.forEach(window.clearTimeout); timers.current = [];
    if (!r || status !== 'ready' || reduced || !visible || hidden) return;
    const mode = r.viewModelInstance?.number('mode');
    if (!mode) { setStatus('fallback'); return; }
    r.startRendering();
    mode.value = 0;
    const greeting = greet !== previousGreet.current;
    previousGreet.current = greet;
    // Advance through neutral before replaying the same discrete reaction.
    timers.current.push(window.setTimeout(() => { mode.value = MASCOT_MODES[greeting ? 'welcome' : mood]; }, 35));
    const duration = mood === 'thinking' ? 5200 : mood === 'calm' ? 3800 : 3200;
    if (mood !== 'thinking' && mood !== 'rest') {
      timers.current.push(window.setTimeout(() => { mode.value = 0; }, duration));
    }
    timers.current.push(window.setTimeout(() => { r.stopRendering(); }, 12500));
    return () => {
      timers.current.forEach(window.clearTimeout);
      cancelAnimationFrame(gazeFrame.current);
      window.clearTimeout(gazeSleep.current);
    };
  }, [mood, reactionKey, greet, status, reduced, visible, hidden]);

  // Touch never blocks page scrolling; gaze is bounded and only tracks this area.
  const look = (clientX?: number, clientY?: number) => {
    if (reduced || !player.current || !wrapper.current) return;
    const box = wrapper.current.getBoundingClientRect();
    const x = clientX == null ? 0 : Math.max(-7, Math.min(7, (clientX - box.left - box.width / 2) / box.width * 14));
    const y = clientY == null ? 0 : Math.max(-5, Math.min(5, (clientY - box.top - box.height * .36) / box.height * 12));
    cancelAnimationFrame(gazeFrame.current);
    gazeFrame.current = requestAnimationFrame(() => {
      const r = player.current;
      const gx = r?.viewModelInstance?.number('gazeX'); const gy = r?.viewModelInstance?.number('gazeY');
      if (gx && gy) {
        gx.value = x; gy.value = y; r?.startRendering();
        window.clearTimeout(gazeSleep.current);
        gazeSleep.current = window.setTimeout(() => r?.stopRendering(), 6500);
      }
    });
  };

  return <button ref={wrapper} type="button" className={`behtan-mascot behtan-mascot--${size}`}
    aria-label="سلام به همراه به‌تن" onClick={() => { setGreet(n => n + 1); }}
    onPointerMove={e => look(e.clientX, e.clientY)} onPointerLeave={() => look()}
    data-rive-status={reduced ? 'reduced-motion' : status} data-mood={mood}>
    <img src={assets.fallback} alt="" aria-hidden="true" width="520" height="610" draggable={false}
      className={status === 'ready' && !reduced && visible && !hidden ? 'behtan-mascot__fallback behtan-mascot__fallback--hidden' : 'behtan-mascot__fallback'} />
    <canvas ref={canvas} aria-hidden="true" className={status === 'ready' && !reduced ? 'behtan-mascot__canvas is-ready' : 'behtan-mascot__canvas'} />
  </button>;
}
