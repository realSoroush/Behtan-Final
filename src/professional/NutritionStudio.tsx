import { AppLoading } from '@/components/ui/AppLoading';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { realCaseApi } from './realCaseApi';
import type { FoodItem } from '@/types';
import type { AuthoredContent } from './authoredPlan';
import { dayLabel, fa, foodLine, foodTotals, lineDescription, moveItem, normalizedSearch, nutritionTotals, sectionMenus, nutritionRange } from './studioModel';
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
  const [meal, setMeal] = useState(0), [day, setDay] = useState(''), [search, setSearch] = useState(''), [category, setCategory] = useState('همه'), [menuId,setMenuId] = useState('primary');
  const drag = useRef<{ type: 'meal'; index: number } | { type: 'food'; id: string } | null>(null);
  const days = [...new Set(content.sections.map(s => s.nutritionDay || 'daily'))], currentDay = days.includes(day) ? day : days[0];
  const indices = content.sections.map((s, i) => ({ s, i })).filter(({ s }) => (s.nutritionDay || 'daily') === currentDay).map(x => x.i);
  const current = indices.includes(meal) ? meal : indices[0], section = content.sections[current];
  const menus=sectionMenus(section),selectedMenu=menus.find(m=>m.id===menuId)||menus[0];
  function editLines(d:AuthoredContent){const s=d.sections[current];return selectedMenu.id==='primary'?s.lines:s.alternatives!.find(m=>m.id===selectedMenu.id)!.lines;}
  const activeSections = indices.map(i => content.sections[i]), total = nutritionTotals(activeSections), target = content.nutritionTargets?.[currentDay];
  const range=nutritionRange(activeSections);
  const legacy = activeSections.some(s => sectionMenus(s).some(m=>m.lines.some(l => !l.food && l.name.trim())));
  function add(food: FoodItem) {
    mutate(d => { const lines = editLines(d); if (lines.length === 1 && !lines[0].name.trim()) lines.length = 0; if (lines.length < 30) lines.push(foodLine(food)); });
  }
  function moveMeal(from: number, to: number) {
    const selected = content.sections[current];
    mutate(d => moveItem(d.sections, from, to));
    setMeal(from === current ? to : content.sections.indexOf(selected) + (from < current && to >= current ? -1 : from > current && to <= current ? 1 : 0));
  }
  return <div className="nutrition-studio">
    {days.length > 1 && <nav className="manual-days" aria-label="نوع روز تغذیه">{days.map(k => <button type="button" key={k} aria-pressed={currentDay === k} onClick={() => { setDay(k); setMeal(0); }}>{dayLabel(k)}</button>)}</nav>}
    <div className="studio-nutrition-total" aria-label="جمع تغذیه"><div className="studio-row"><strong>{fa(total.kcal)} کالری · جمع منوهای اول · {dayLabel(currentDay)}</strong>{target && <span>هدف {fa(target.kcal)} · اختلاف {fa(total.kcal - target.kcal)}</span>}</div><div className="studio-macros">{(['protein', 'carbs', 'fat'] as const).map((k, i) => <span key={k}>{['پروتئین', 'کربوهیدرات', 'چربی'][i]} <b>{fa(total[k])}</b>{target ? ` / ${fa(target[k])}` : ''} گرم</span>)}</div></div>
    <p className="studio-help">از هر وعده فقط یک منو انتخاب می‌شود. دامنهٔ کالری روز با انتخاب منوها: {fa(range.min.kcal)} تا {fa(range.max.kcal)}.</p>
    {legacy && <p className="studio-notice">سطرهای متنی قدیمی در جمع تغذیه محاسبه نمی‌شوند. برای محاسبه دقیق، آن‌ها را با مادهٔ کاتالوگ جایگزین کنید.</p>}
    {error && <p role="alert" className="pro-error">{error}<button type="button" onClick={retry}>دریافت دوباره بانک</button></p>}
    <div className="studio-columns">
      <aside className="studio-bank"><h4>بانک مواد غذایی</h4><small>مقادیر از کاتالوگ به‌تن · مبنای وزن مشخص</small><input type="search" aria-label="جستجوی ماده غذایی" value={search} placeholder="نام ماده غذایی…" onChange={e => setSearch(e.target.value)} />
        <div className="studio-categories">{['همه', ...new Set(foods.map(f => f.role))].map(c => <button type="button" key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{roles[c] || c}</button>)}</div>
        {busy && <AppLoading label="در حال دریافت بانک غذایی…" />}
        <div className="studio-bank-list">{foods.filter(f => (category === 'همه' || f.role === category) && normalizedSearch(f.name).includes(normalizedSearch(search))).map(f => {
          const conflict = intake && (f.allergyFlags.some(a => intake.allergies.includes(a)) || f.excludedForVegetarian.includes(intake.vegetarian_status));
          return <button type="button" key={f.id} aria-label={'افزودن ' + f.name} disabled={selectedMenu.lines.length >= 30} draggable onDragStart={e => { drag.current = { type: 'food', id: f.id }; e.dataTransfer.setData('text/plain', f.id); }} onDragEnd={() => { drag.current = null; }} onClick={() => add(f)}><span><strong>{f.name}</strong><small>{basis[f.preparationState || 'ready']} · {fa(f.kcalPerUnit / f.gramsPerUnit * 100)} کالری / ۱۰۰ گرم</small>{conflict && <small className="studio-allergy">با حساسیت یا ترجیح پرونده تطبیق دهید</small>}</span><Plus size={16} /></button>;
        })}{!busy && !error && !foods.length && <p>کاتالوگ مادهٔ فعالی ندارد.</p>}</div>
      </aside>
      <section className="studio-editor"><div className="studio-row"><h4>وعده‌های برنامه</h4><button type="button" disabled={content.sections.length >= 28} onClick={() => { mutate(d => { d.sections.push({ title: 'وعده جدید', nutritionDay: currentDay, lines: [] }); }); setMeal(content.sections.length); }}><Plus size={16} />وعده</button></div>
        <nav className="manual-days" aria-label="وعده‌های تغذیه">{indices.map(i => <button type="button" key={i} draggable aria-pressed={i === current} onClick={() => setMeal(i)} onDragStart={e => { drag.current = { type: 'meal', index: i }; e.dataTransfer.setData('text/plain', 'meal:' + i); }} onDragEnd={() => { drag.current = null; }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag.current?.type === 'meal' && indices.includes(drag.current.index)) moveMeal(drag.current.index, i); drag.current = null; }}>{content.sections[i].title || 'وعده'}</button>)}</nav>
        <div className="studio-row studio-meal-order"><small>ترتیب وعده انتخاب‌شده</small><button type="button" aria-label="انتقال وعده به قبل" disabled={indices.indexOf(current) === 0} onClick={() => moveMeal(current, indices[indices.indexOf(current) - 1])}><ArrowUp size={15} /></button><button type="button" aria-label="انتقال وعده به بعد" disabled={indices.indexOf(current) === indices.length - 1} onClick={() => moveMeal(current, indices[indices.indexOf(current) + 1])}><ArrowDown size={15} /></button></div>
        <div className="studio-row"><label>نام وعده<input aria-label="نام وعده" maxLength={100} value={section.title} onChange={e => mutate(d => { d.sections[current].title = e.target.value; })} /></label><button type="button" aria-label="حذف وعده" disabled={indices.length === 1} onClick={() => { if (!window.confirm('این وعده و مواد آن حذف شوند؟')) return; mutate(d => { d.sections.splice(current, 1); }); setMeal(0); }}><Trash2 size={16} /></button></div>
        <div className="studio-row"><h4>منوهای این وعده</h4><button type="button" disabled={menus.length>=5} onClick={()=>{const id=crypto.randomUUID();mutate(d=>{(d.sections[current].alternatives??=[]).push({id,title:'منو '+fa(menus.length+1),lines:[]});});setMenuId(id);}}><Plus size={16}/>منوی جدید</button></div>
        <NutritionMenuRows section={section} active={selectedMenu.id} onSelect={setMenuId}/>
        <div className="studio-row"><label>عنوان منو<input aria-label="عنوان منو" maxLength={100} value={selectedMenu.title} onChange={e=>mutate(d=>{if(selectedMenu.id==='primary')d.sections[current].menuTitle=e.target.value;else d.sections[current].alternatives!.find(m=>m.id===selectedMenu.id)!.title=e.target.value;})}/></label><button type="button" disabled={menus.length===1} onClick={()=>{if(!window.confirm('این منو و مواد آن حذف شوند؟'))return;mutate(d=>{const s=d.sections[current];if(selectedMenu.id==='primary'){const promoted=s.alternatives!.shift()!;s.lines=promoted.lines;s.menuTitle=promoted.title;}else s.alternatives=s.alternatives!.filter(m=>m.id!==selectedMenu.id);});setMenuId('primary');}}>حذف منو</button></div>
        <div className="studio-food-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const dragged = drag.current; const f = dragged?.type === 'food' && foods.find(f => f.id === dragged.id); if (f) add(f); drag.current = null; }}>
          {selectedMenu.lines.map((line, i) => <article className="studio-food" key={i}><div className="studio-row"><strong>{line.name || 'سطر متنی'}</strong><button type="button" aria-label={'حذف ماده ' + (i + 1)} onClick={() => mutate(d => { editLines(d).splice(i, 1); })}><Trash2 size={16} /></button></div>
            {line.food ? <><small>مبنای وزن: {line.food.basis}</small><div className="studio-row"><label>وزن · گرم<input type="number" min={0.1} max={5000} step="any" aria-label={'وزن ' + line.name} value={Number.isNaN(line.food.grams) ? '' : line.food.grams} onChange={e => mutate(d => { editLines(d)[i].food!.grams = e.target.value === '' ? NaN : Number(e.target.value); })} /></label><span>{fa(foodTotals(line.food).kcal)} کالری</span></div><p className="studio-help">{lineDescription(line).split('\n')[1]}</p></> : <label>نام سطر<input aria-label={'نام سطر ' + (current+1) + '-' + (i+1)} maxLength={300} value={line.name} onChange={e => mutate(d => { editLines(d)[i].name = e.target.value; })} /></label>}
            <label>توضیحات<textarea aria-label={line.food ? 'توضیح ماده ' + (i+1) : 'توضیحات سطر ' + (current+1) + '-' + (i+1)} maxLength={2000} rows={2} value={line.details} onChange={e => mutate(d => { editLines(d)[i].details = e.target.value; })} /></label>
            <div className="studio-row"><span /><div><button type="button" aria-label={'بالا بردن ماده ' + (i + 1)} disabled={i === 0} onClick={() => mutate(d => moveItem(editLines(d), i, i - 1))}><ArrowUp size={15} /></button><button type="button" aria-label={'پایین بردن ماده ' + (i + 1)} disabled={i === selectedMenu.lines.length - 1} onClick={() => mutate(d => moveItem(editLines(d), i, i + 1))}><ArrowDown size={15} /></button></div></div>
          </article>)}
          {!selectedMenu.lines.length && <p className="studio-empty">از بانک ماده اضافه کنید یا اینجا رها کنید.</p>}
        </div><div className="studio-row"><small>جمع وعده: {fa(nutritionTotals([{...section,lines:selectedMenu.lines}]).kcal)} کالری</small><button type="button" disabled={selectedMenu.lines.length>=30} onClick={()=>mutate(d=>{editLines(d).push({name:'',details:''});})}>افزودن سطر متنی</button></div><p className="studio-help">سطر متنی برای دستور اختصاصی است و در محاسبه کالری و درشت‌مغذی‌ها وارد نمی‌شود.</p>
      </section>
      <AuthoredNutritionPreview content={{...content,sections:activeSections}}/>

    </div>
  </div>;
}

export function NutritionMenuRows({section,active,onSelect}:{section:AuthoredContent['sections'][number];active?:string;onSelect?:(id:string)=>void}) {
 return <table className="studio-menu-table"><thead><tr><th>منو</th><th>مواد و مقدار مصرف</th></tr></thead><tbody>{sectionMenus(section).map((menu,i)=>{const totals=nutritionTotals([{...section,lines:menu.lines}]);return <tr key={menu.id} className={active===menu.id?'is-selected':''}><td>{onSelect?<button type="button" aria-pressed={active===menu.id} onClick={()=>onSelect(menu.id)}>{menu.title}</button>:menu.title||'منو '+fa(i+1)}</td><td><p>{menu.lines.filter(l=>l.name.trim()).map(l=>l.food?`${l.name} ${fa(l.food.grams)} گرم (${l.food.basis})`:l.name+' '+l.details).join(' + ')||'مواد این منو را اضافه کنید.'}</p><small>{fa(totals.kcal)} کالری · پروتئین {fa(totals.protein)} · کربوهیدرات {fa(totals.carbs)} · چربی {fa(totals.fat)} گرم</small>{menu.lines.some(l=>l.details)&&<small>{menu.lines.filter(l=>l.details).map(l=>l.name+': '+l.details).join('؛ ')}</small>}</td></tr>})}</tbody></table>;
}
export function AuthoredNutritionPreview({content,showTitle=true}:{content:AuthoredContent;showTitle?:boolean}){
 return <aside className="authored-live-preview" aria-label="پیش‌نمایش زنده تغذیه"><small>از هر وعده فقط یک منو انتخاب شود.</small>{showTitle&&<h3>{content.title}</h3>}{content.sections.map((s,i)=><section key={i}><h4>{dayLabel(s.nutritionDay||'daily')} · {s.title}</h4><NutritionMenuRows section={s}/></section>)}<p>{content.notes}</p></aside>;
}
