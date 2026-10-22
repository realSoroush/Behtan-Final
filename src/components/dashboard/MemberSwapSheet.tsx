import { useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { FoodSwapOption, MealComponent } from '@/types';
import { componentAmount, foodVisual } from '@/utils/mealPresentation';
import { FoodArt } from './visuals/FoodArt';
import { MemberDialog } from './MemberDialog';
const n = (value: number) => Math.round(value).toLocaleString('fa-IR');
export function MemberSwapSheet({ isOpen, onClose, currentComponent, candidates, onSelect }: {
  isOpen: boolean;
  onClose: () => void;
  currentComponent: MealComponent | null;
  candidates: FoodSwapOption[];
  onSelect: (option: FoodSwapOption) => void;
}) {
  const [showOther, setShowOther] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    setShowOther(false);
    setSelectedId(currentComponent?.foodItem.id ?? '');
  }, [isOpen, currentComponent?.foodItem.id]);
  if (!isOpen || !currentComponent) return null;
  const available = candidates.filter(c => c.isEquivalent);
  const other = candidates.filter(c => !c.isEquivalent);
  const pending = available.find(c => c.foodItem.id === selectedId);
  const changed = Boolean(pending && pending.foodItem.id !== currentComponent.foodItem.id);
  const render = (option: FoodSwapOption) => <button type="button" className={'swap-option-v2' + (!option.isEquivalent ? ' is-unavailable' : '')} key={option.foodItem.id} data-food-id={option.foodItem.id} disabled={!option.isEquivalent} aria-pressed={option.foodItem.id === selectedId} onClick={() => setSelectedId(option.foodItem.id)}>
    <svg viewBox="-45 -45 90 90" aria-hidden="true"><FoodArt kind={foodVisual(option.foodItem)} /></svg>
    <span><b>{option.foodItem.name}{option.foodItem.id === currentComponent.foodItem.id && <small>غذای فعلی</small>}</b><span>{componentAmount(option.replacementComponent)} · {n(option.replacementComponent.kcal)} کالری</span><em>{option.isEquivalent ? `${n(option.replacementComponent.protein)} گرم پروتئین · ${n(option.replacementComponent.fat)} گرم چربی` : option.reason ?? 'با ترکیب این وعده هماهنگ نیست'}</em></span>
    {option.isEquivalent && <i className="swap-choice-indicator">{option.foodItem.id === selectedId && <Check size={14} />}</i>}
  </button>;
  return <MemberDialog title="جایگزینی غذا" onClose={onClose}>
    <div className="swap-current-v2"><span>به‌جای</span><strong>{currentComponent.foodItem.name}</strong><span>{componentAmount(currentComponent)}</span></div>
    <p className="member-muted">غذای دلخواهت را انتخاب کن؛ مقدارها برای همین وعده تنظیم شده‌اند.</p>
    <div className="swap-options-v2">{available.length ? available.map(render) : <div className="member-empty">با شرایط فعلی، جایگزین مناسبی پیدا نشد.</div>}</div>
    {other.length > 0 && <><button type="button" className="swap-other-toggle" aria-expanded={showOther} onClick={() => setShowOther(!showOther)}>چرا بعضی غذاها پیشنهاد نمی‌شوند؟<ChevronDown size={15} /></button>{showOther && <div className="swap-options-v2">{other.map(render)}</div>}</>}
    <div className="swap-confirm-bar"><p aria-live="polite">{changed && pending ? `${pending.foodItem.name} · ${componentAmount(pending.replacementComponent)}` : 'یک جایگزین انتخاب کن'}</p><button type="button" className="member-primary" disabled={!changed} onClick={() => { if (pending && changed) { onSelect(pending); onClose(); } }}>تأیید جایگزینی<Check size={17} /></button></div>
  </MemberDialog>;
}
