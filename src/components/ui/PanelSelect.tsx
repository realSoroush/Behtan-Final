import { Children, isValidElement, useId, useEffect, useLayoutEffect, useMemo, useRef, useState, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './panel-select.css';

// Preserve pre-paint measurement in browsers without SSR layout-effect warnings.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Props = SelectHTMLAttributes<HTMLSelectElement>;
export function PanelSelect({ children, value, defaultValue, onChange, disabled, className, id: suppliedId, style, ...props }: Props) {
  const generatedId = useId(), id = suppliedId ?? generatedId;
  const native = useRef<HTMLSelectElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [label, setLabel] = useState('');
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, height: 280 });
  const [theme, setTheme] = useState<Record<string, string>>({});
  const options = useMemo(() => {
    const result: { value: string; label: string; disabled: boolean }[] = [];
    function read(nodes: React.ReactNode, groupDisabled = false) {
      Children.forEach(nodes, n => {
        if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(n)) return;
        if (n.type === 'option') result.push({ value: String(n.props.value ?? Children.toArray(n.props.children).join('')), label: Children.toArray(n.props.children).join(''), disabled: groupDisabled || Boolean(n.props.disabled) });
        else read(n.props.children, groupDisabled || Boolean(n.props.disabled));
      });
    }
    read(children); return result;
  }, [children]);
  const current = options.findIndex(o => o.value === String(value ?? uncontrolled ?? options[0]?.value ?? ''));
  useBrowserLayoutEffect(() => {
    const parent = native.current?.closest('label');
    const external = trigger.current?.labels?.[0];
    const source = parent ?? external;
    if (source) {
      const copy = source.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('select,button,input,svg').forEach(x => x.remove());
      setLabel(copy.textContent?.trim() ?? '');
    }
    if (native.current?.matches(':disabled') && open) setOpen(false);
  });
  function position() {
    const r = trigger.current!.getBoundingClientRect(), height = Math.min(280, innerHeight - 24);
    const needed = Math.min(height, options.length * 46 + 12);
    setBox({ left: Math.max(8, Math.min(r.left, innerWidth - r.width - 8)), top: innerHeight - r.bottom - 12 >= needed ? r.bottom + 6 : Math.max(8, r.top - needed - 6), width: Math.min(r.width, innerWidth - 16), height });
  }
  function show() {
    if (native.current?.matches(':disabled') || !options.length) return;
    const css = getComputedStyle(trigger.current!);
    setTheme(Object.fromEntries(['--behtan-field', '--behtan-ink', '--behtan-line', '--behtan-soft', '--behtan-focus'].map(key => [key, css.getPropertyValue(key)])));
    position(); setActive(current >= 0 && !options[current].disabled ? current : options.findIndex(o => !o.disabled)); setOpen(true);
  }
  function choose(index: number) {
    if (native.current?.matches(':disabled') || !options[index] || options[index].disabled) return;
    const select = native.current!;
    select.value = options[index].value;
    setUncontrolled(options[index].value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    setOpen(false); trigger.current?.focus();
  }
  useBrowserLayoutEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) position(); };
    window.addEventListener('scroll', scroll, true); document.addEventListener('pointerdown', outside); window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', scroll, true); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); };
  }, [open, options.length]);
  useBrowserLayoutEffect(() => {
    const list = menu.current, option = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (open && list && option) {
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [open, active]);
  return <div className="panel-select" style={style}>
    <select {...props} value={value} defaultValue={defaultValue} onChange={onChange} disabled={disabled} ref={native} aria-hidden="true" tabIndex={-1} className="panel-select-native" onInvalid={e => { props.onInvalid?.(e); e.preventDefault(); trigger.current?.focus(); show(); }}>{children}</select>
    <button id={id} ref={trigger} type="button" role="combobox" aria-haspopup="listbox" aria-label={props['aria-label'] || label || 'انتخاب گزینه'} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']} aria-required={props.required} aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined} aria-invalid={props['aria-invalid']} disabled={disabled} className={'panel-select-trigger ' + (className || '')} onClick={() => open ? setOpen(false) : show()} onKeyDown={e => {
      if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
      if (e.key === 'Tab') { setOpen(false); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); if (!open) { show(); return; }
        const enabled = options.map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0);
        if (!enabled.length) return;
        const index = enabled.indexOf(active);
        setActive(e.key === 'Home' ? enabled[0] : e.key === 'End' ? enabled[enabled.length - 1] : enabled[(index + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]);
      } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open ? choose(active) : show(); }
      else if (e.key.length === 1) {
        const ordered = [...options.keys()].slice(active + 1).concat([...options.keys()].slice(0, active + 1));
        const index = ordered.find(i => !options[i].disabled && options[i].label.startsWith(e.key));
        if (index != null) { if (!open) show(); setActive(index); }
      }
    }}><span>{options[current]?.label || 'انتخاب کنید'}</span><ChevronDown size={17} aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} id={`${id}-list`} role="listbox" aria-label={props['aria-label'] || label || 'گزینه‌ها'} className="panel-select-menu" dir="rtl" style={{ ...theme, top: box.top, left: box.left, width: box.width, maxHeight: box.height }}>{options.map((o, i) => <div role="option" key={o.value + ':' + i} id={`${id}-${i}`} data-index={i} aria-selected={i === current} aria-disabled={o.disabled} className={(i === active ? 'is-highlighted ' : '') + (o.disabled ? 'is-disabled' : '')} onPointerDown={e=>e.preventDefault()} onPointerMove={() => { if (!o.disabled) setActive(i); }} onClick={() => choose(i)}><span>{o.label}</span>{i === current && <Check size={17} />}</div>)}</div>, trigger.current?.closest('dialog') || document.body)}
  </div>;
}
