import { LoadingMascot } from '@/components/ui/AppLoading';
import { useState } from 'react';
import { Check, ChevronDown, RefreshCw, Utensils, Undo2, SkipForward, CookingPot } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Meal } from '@/types';
import { memberRecipes } from '@/utils/memberRecipes';
import { componentAmount, foodVisual } from '@/utils/mealPresentation';
import { PlateButton, FoodPlate } from './visuals/FoodPlate';
import { FoodArt } from './visuals/FoodArt';
const n = (value: number) => Math.round(value).toLocaleString('fa-IR');
interface Props {
  meal: Meal;
  compact?: boolean;
  readOnly?: boolean;
  isConsumedSaving?: boolean;
  consumedToggleDisabled?: boolean;
  onToggleConsumed: () => void;
  onSwapComponent: (index: number) => void;
  onChangeMeal?:()=>void;
  changing?:boolean;
  changeDisabled?: boolean;
  onSkip?:()=>void;
  skipped?:boolean;
}
export function MemberMealCard({ meal, compact = false, readOnly = false, isConsumedSaving = false, consumedToggleDisabled = false, onToggleConsumed, onSwapComponent, onChangeMeal, changing=false,changeDisabled=false,onSkip,skipped=false }: Props) {
  const [expanded, setExpanded] = useState(!compact);
  const reduced = useReducedMotion();
  const disabled = readOnly || isConsumedSaving || consumedToggleDisabled;
  const title = meal.source?(meal.estimated?'وعدهٔ دلخواه · تخمینی':'وعدهٔ دلخواه · ثبت دستی'):meal.components.slice(0, 2).map(c => c.foodItem.name).join(' و ');
  const companions = meal.components.slice(2).map(c => c.foodItem.name).join('، ');
  const toggle = <button type="button" className="member-primary meal-consume-button" onClick={onToggleConsumed} disabled={disabled} aria-pressed={meal.consumed} aria-label={meal.consumed ? 'علامت‌گذاری وعده به‌عنوان مصرف‌نشده' : 'علامت‌گذاری وعده به‌عنوان مصرف‌شده'}>
    {isConsumedSaving ? <LoadingMascot /> : <Check size={18} />}<span>{isConsumedSaving ? 'در حال ثبت…' : readOnly?'ثبت در روز این برنامه':meal.consumed ? 'بازگرداندن وعده' : 'این وعده را خوردم'}</span>
  </button>;
  return <article data-meal-slot={meal.slot} className={`member-meal-card member-meal-v3${compact ? ' is-compact' : ''}${meal.consumed ? ' is-consumed' : ''}`}>
    {compact ? <div className="day-meal-summary">
      <div className="day-meal-thumbnail"><FoodPlate meal={meal} /></div>
      <div><span className="meal-slot-label">{meal.label}{meal.consumed ? ' · ثبت شده' : ''}</span><h3>{title}</h3><span className="day-meal-energy">{n(meal.totalKcal)} کالری</span>{meal.consumed&&!readOnly&&<button type="button" className="day-meal-undo" aria-label={`بازگرداندن ${meal.label}`} disabled={disabled} onClick={onToggleConsumed}>{isConsumedSaving?<LoadingMascot />:<Undo2 size={14}/>}بازگرداندن</button>}</div>
      <button type="button" className="day-meal-expand" aria-label={`جزئیات ${meal.label}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ChevronDown size={19} /></button>
    </div> : <>
      <div className="meal-visual-surface">
      {onChangeMeal&&<div className="meal-change-row"><button type="button" disabled={changing||meal.consumed||changeDisabled} onClick={onChangeMeal}>{changing?<LoadingMascot />:<RefreshCw size={15}/>}تغییر وعده</button></div>}
      <div className="meal-v3-hero"><div className="meal-v3-copy"><span className="meal-slot-label"><Utensils size={14} />{meal.label}</span><h3>{title}</h3>{companions && <p>همراه با {companions}</p>}<span className="meal-energy-v3"><b>{n(meal.totalKcal)}</b> کالری</span></div><PlateButton meal={meal} onSwapComponent={readOnly || meal.consumed || disabled || changeDisabled ? undefined : onSwapComponent} /></div>
      </div>
      <div className="meal-macro-chips">{[['پروتئین', meal.totalProtein], ['کربوهیدرات', meal.totalCarbs], ['چربی', meal.totalFat]].map(([label, value]) => <span key={label}><b>{n(Number(value))}</b> گرم {label}</span>)}</div>
      <div className="meal-card-actions">{toggle}<button type="button" className="meal-detail-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'بستن مواد' : 'تغییر مواد'}<ChevronDown size={16} /></button></div>
    </>}
    {onSkip&&!meal.consumed&&!readOnly&&<button type='button' className='member-secondary meal-skip-action' disabled={disabled} onClick={onSkip}>{skipped?<Undo2 size={15} aria-hidden/>:<SkipForward size={15} aria-hidden/>}{skipped?'بازگرداندن به وعده‌های پیش رو':'این وعده را نخوردم'}</button>}
    {meal.source&&meal.consumed&&<p className='member-muted'>{meal.components.map(c=>c.foodItem.name+' · '+componentAmount(c)).join('، ')}</p>}
    <AnimatePresence initial={false}>{expanded && <motion.div className="meal-ingredients" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduced?{duration:0}:{height:{type:'spring',duration:.36,bounce:.06},opacity:{duration:.16}}}>
      {compact && <div className="day-expanded-plate"><FoodPlate meal={meal}/></div>}
      <div className="meal-ingredient-list">{meal.components.map((c, i) => <div className="meal-ingredient-row" key={`${i}-${c.foodItem.id}`}>
        <svg viewBox="-45 -45 90 90" aria-hidden="true"><FoodArt kind={foodVisual(c.foodItem)} /></svg><div><strong>{c.foodItem.name}</strong><span>{componentAmount(c)}<small> · {n(c.kcal)} کالری</small></span></div>{!readOnly && <button type="button" aria-label={`جایگزینی ${c.foodItem.name}`} onClick={() => onSwapComponent(i)} disabled={meal.consumed || disabled || changeDisabled}><RefreshCw size={16} /><span>تغییر</span></button>}
      </div>)}</div>
      {meal.components.map(component => {
        const recipe = memberRecipes.get(component.foodItem.id);
        if (!recipe) return null;
        const format = (value: number) => value.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
        return <details className="member-recipe" key={component.foodItem.id}>
          <summary><CookingPot size={17} aria-hidden/>دستور تهیهٔ {component.foodItem.name}</summary>
          <p>مقدار مواد برای حدود {format(component.grams)} گرم غذای پخته</p>
          <ul>{recipe.ingredients.map(([name, quantity, unit]) => (
            <li key={name}><span>{name}</span><strong>{format(quantity * component.units)} {unit}</strong></li>
          ))}</ul>
          <p>{recipe.method}</p>
          {recipe.note && <p>{recipe.note}</p>}
          <a href={recipe.source} target="_blank" rel="noopener noreferrer">دستور مرجع USDA</a>
        </details>;
      })}
      {meal.consumed && <p className="member-muted">برای تغییر غذا، ابتدا ثبت این وعده را اصلاح کن.</p>}
      {compact && !meal.consumed && <div className="meal-card-actions">{toggle}</div>}
    </motion.div>}</AnimatePresence>
  </article>;
}
