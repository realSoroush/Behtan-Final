import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { realCaseApi } from './realCaseApi';
import type { FoodItem } from '@/types';
import type { AuthoredContent } from './authoredPlan';
import { dayLabel, fa, foodLine, foodTotals, lineDescription, moveItem, normalizedSearch, nutritionTotals } from './studioModel';
import type { RealIntake } from './menuPlan';
const roles: Record<string, string> = { protein: 'پروتئین', starch: 'غلات و کربوهیدرات', fat: 'چربی و مغزها', fruit: 'میوه', vegetable: 'سبزی', dairy: 'لبنیات', legume: 'حبوبات' };
const basis = { raw: 'خام', cooked: 'پخته', dry: 'خشک', ready: 'آماده مصرف' };
function useProFoods(org:string,record:string,revision:number) {
  const [foods, setFoods] = useState<FoodItem[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setBusy(true); setError('');
    (async () => {
      try {
        const {foods:result}=await realCaseApi.catalog(org,record,revision);
        if (alive) setFoods(result);
      } catch { if (alive) setError('دریافت بانک غذایی ممکن نشد. مقادیر ثبت‌شده حفظ شده‌اند؛ دوباره تلاش کنید.'); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [attempt,org,record,revision]);
  return { foods, busy, error, retry: () => setAttempt(n => n + 1) };
}
export function NutritionStudio({ content, mutate, intake, org, record, revision }: { org:string;record:string;revision:number;content: AuthoredContent; mutate: (fn: (d: AuthoredContent) => void) => void; intake?: RealIntake }) {
  const { foods, busy, error, retry } = useProFoods(org,record,revision);
  const [meal, setMeal] = useState(0), [day, setDay] = useState(''), [search, setSearch] = useState(''), [category, setCategory] = useState('همه');
  const drag = useRef<{ type: 'meal'; index: number } | { type: 'food'; id: string } | null>(null);
  const days = [...new Set(content.sections.map(s => s.nutritionDay || 'daily'))], currentDay = days.includes(day) ? day : days[0];
  const indices = content.sections.map((s, i) => ({ s, i })).filter(({ s }) => (s.nutritionDay || 'daily') === currentDay).map(x => x.i);
  const current = indices.includes(meal) ? meal : indices[0], section = content.sections[current];
  const activeSections = indices.map(i => content.sections[i]), total = nutritionTotals(activeSections), target = content.nutritionTargets?.[currentDay];
  const legacy = activeSections.some(s => s.lines.some(l => !l.food && l.name.trim()));
  function add(food: FoodItem) {
    mutate(d => { const lines = d.sections[current].lines; if (lines.length === 1 && !lines[0].name.trim()) lines.length = 0; if (lines.length < 30) lines.push(foodLine(food)); });
  }
  function moveMeal(from: number, to: number) {
    const selected = content.sections[current];
    mutate(d => moveItem(d.sections, from, to));
    setMeal(from === current ? to : content.sections.indexOf(selected) + (from < current && to >= current ? -1 : from > current && to <= current ? 1 : 0));
  }
  return <div className="nutrition-studio">
    {days.length > 1 && <nav className="manual-days" aria-label="نوع روز تغذیه">{days.map(k => <button type="button" key={k} aria-pressed={currentDay === k} onClick={() => { setDay(k); setMeal(0); }}>{dayLabel(k)}</button>)}</nav>}
    <div className="studio-nutrition-total" aria-label="جمع تغذیه"><div className="studio-row"><strong>{fa(total.kcal)} کالری · {dayLabel(currentDay)}</strong>{target && <span>هدف {fa(target.kcal)} · اختلاف {fa(total.kcal - target.kcal)}</span>}</div><div className="studio-macros">{(['protein', 'carbs', 'fat'] as const).map((k, i) => <span key={k}>{['پروتئین', 'کربوهیدرات', 'چربی'][i]} <b>{fa(total[k])}</b>{target ? ` / ${fa(target[k])}` : ''} گرم</span>)}</div></div>
    {legacy && <p className="studio-notice">سطرهای متنی قدیمی در جمع تغذیه محاسبه نمی‌شوند. برای محاسبه دقیق، آن‌ها را با مادهٔ کاتالوگ جایگزین کنید.</p>}
    {error && <p role="alert" className="pro-error">{error}<button type="button" onClick={retry}>دریافت دوباره بانک</button></p>}
    <div className="studio-columns">
      <aside className="studio-bank"><h4>بانک مواد غذایی</h4><small>مقادیر از کاتالوگ به‌تن · مبنای وزن مشخص</small><input type="search" aria-label="جستجوی ماده غذایی" value={search} placeholder="نام ماده غذایی…" onChange={e => setSearch(e.target.value)} />
        <div className="studio-categories">{['همه', ...new Set(foods.map(f => f.role))].map(c => <button type="button" key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{roles[c] || c}</button>)}</div>
        {busy && <p role="status">در حال دریافت بانک غذایی…</p>}
        <div className="studio-bank-list">{foods.filter(f => (category === 'همه' || f.role === category) && normalizedSearch(f.name).includes(normalizedSearch(search))).map(f => {
          const conflict = intake && (f.allergyFlags.some(a => intake.allergies.includes(a)) || f.excludedForVegetarian.includes(intake.vegetarian_status));
          return <button type="button" key={f.id} aria-label={'افزودن ' + f.name} disabled={section.lines.length >= 30} draggable onDragStart={e => { drag.current = { type: 'food', id: f.id }; e.dataTransfer.setData('text/plain', f.id); }} onDragEnd={() => { drag.current = null; }} onClick={() => add(f)}><span><strong>{f.name}</strong><small>{basis[f.preparationState || 'ready']} · {fa(f.kcalPerUnit / f.gramsPerUnit * 100)} کالری / ۱۰۰ گرم</small>{conflict && <small className="studio-allergy">با حساسیت یا ترجیح پرونده تطبیق دهید</small>}</span><Plus size={16} /></button>;
        })}{!busy && !error && !foods.length && <p>کاتالوگ مادهٔ فعالی ندارد.</p>}</div>
      </aside>
      <section className="studio-editor"><div className="studio-row"><h4>وعده‌های برنامه</h4><button type="button" disabled={content.sections.length >= 28} onClick={() => { mutate(d => { d.sections.push({ title: 'وعده جدید', nutritionDay: currentDay, lines: [] }); }); setMeal(content.sections.length); }}><Plus size={16} />وعده</button></div>
        <nav className="manual-days" aria-label="وعده‌های تغذیه">{indices.map(i => <button type="button" key={i} draggable aria-pressed={i === current} onClick={() => setMeal(i)} onDragStart={e => { drag.current = { type: 'meal', index: i }; e.dataTransfer.setData('text/plain', 'meal:' + i); }} onDragEnd={() => { drag.current = null; }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag.current?.type === 'meal' && indices.includes(drag.current.index)) moveMeal(drag.current.index, i); drag.current = null; }}>{content.sections[i].title || 'وعده'}</button>)}</nav>
        <div className="studio-row studio-meal-order"><small>ترتیب وعده انتخاب‌شده</small><button type="button" aria-label="انتقال وعده به قبل" disabled={indices.indexOf(current) === 0} onClick={() => moveMeal(current, indices[indices.indexOf(current) - 1])}><ArrowUp size={15} /></button><button type="button" aria-label="انتقال وعده به بعد" disabled={indices.indexOf(current) === indices.length - 1} onClick={() => moveMeal(current, indices[indices.indexOf(current) + 1])}><ArrowDown size={15} /></button></div>
        <div className="studio-row"><label>نام وعده<input aria-label="نام وعده" maxLength={100} value={section.title} onChange={e => mutate(d => { d.sections[current].title = e.target.value; })} /></label><button type="button" aria-label="حذف وعده" disabled={indices.length === 1} onClick={() => { if (!window.confirm('این وعده و مواد آن حذف شوند؟')) return; mutate(d => { d.sections.splice(current, 1); }); setMeal(0); }}><Trash2 size={16} /></button></div>
        <div className="studio-food-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const dragged = drag.current; const f = dragged?.type === 'food' && foods.find(f => f.id === dragged.id); if (f) add(f); drag.current = null; }}>
          {section.lines.map((line, i) => <article className="studio-food" key={i}><div className="studio-row"><strong>{line.name || 'سطر متنی'}</strong><button type="button" aria-label={'حذف ماده ' + (i + 1)} onClick={() => mutate(d => { d.sections[current].lines.splice(i, 1); })}><Trash2 size={16} /></button></div>
            {line.food ? <><small>مبنای وزن: {line.food.basis}</small><div className="studio-row"><label>وزن · گرم<input type="number" min={0.1} max={5000} step="any" aria-label={'وزن ' + line.name} value={Number.isNaN(line.food.grams) ? '' : line.food.grams} onChange={e => mutate(d => { d.sections[current].lines[i].food!.grams = e.target.value === '' ? NaN : Number(e.target.value); })} /></label><span>{fa(foodTotals(line.food).kcal)} کالری</span></div><p className="studio-help">{lineDescription(line).split('\n')[1]}</p></> : <label>نام سطر<input aria-label={'نام سطر ' + (current+1) + '-' + (i+1)} maxLength={300} value={line.name} onChange={e => mutate(d => { d.sections[current].lines[i].name = e.target.value; })} /></label>}
            <label>توضیحات<textarea aria-label={line.food ? 'توضیح ماده ' + (i+1) : 'توضیحات سطر ' + (current+1) + '-' + (i+1)} maxLength={2000} rows={2} value={line.details} onChange={e => mutate(d => { d.sections[current].lines[i].details = e.target.value; })} /></label>
            <div className="studio-row"><span /><div><button type="button" aria-label={'بالا بردن ماده ' + (i + 1)} disabled={i === 0} onClick={() => mutate(d => moveItem(d.sections[current].lines, i, i - 1))}><ArrowUp size={15} /></button><button type="button" aria-label={'پایین بردن ماده ' + (i + 1)} disabled={i === section.lines.length - 1} onClick={() => mutate(d => moveItem(d.sections[current].lines, i, i + 1))}><ArrowDown size={15} /></button></div></div>
          </article>)}
          {!section.lines.length && <p className="studio-empty">از بانک ماده اضافه کنید یا اینجا رها کنید.</p>}
        </div><div className="studio-row"><small>جمع وعده: {fa(nutritionTotals([section]).kcal)} کالری</small><button type="button" disabled={section.lines.length>=30} onClick={()=>mutate(d=>{d.sections[current].lines.push({name:'',details:''});})}>افزودن سطر متنی</button></div><p className="studio-help">سطر متنی برای دستور اختصاصی است و در محاسبه کالری و درشت‌مغذی‌ها وارد نمی‌شود.</p>
      </section>
      <aside className="authored-live-preview" aria-label="پیش‌نمایش زنده تغذیه"><small>خروجی زنده · {dayLabel(currentDay)}</small><h3>{content.title}</h3>{activeSections.map((s, i) => <section key={i}><h4>{s.title}</h4>{s.lines.filter(l => l.name.trim()).map((l, j) => <p key={j}><strong>{l.name}</strong><span>{lineDescription(l)}</span></p>)}</section>)}<p>{content.notes}</p></aside>
    </div>
  </div>;
}
