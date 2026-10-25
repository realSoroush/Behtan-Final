import { PanelSelect } from '@/components/ui/PanelSelect';
import './TrainingSetup.css';
import { useState, useEffect } from 'react';
import { EQUIPMENT, WEEKDAYS } from '../training/engine';
import type { Equipment, TrainingInput } from '../training/types';
import {TRAINING_DRAFT_KEY} from './trainingDraft';
export function useTrainingDraft(){
 const [input,setInput]=useState<TrainingInput>(()=>{try{const v=JSON.parse(sessionStorage.getItem(TRAINING_DRAFT_KEY)??'null');if(v?.version===1 && Array.isArray(v.days) && v.screening)return {...v,screening:{...v.screening,confirmed:false}};}catch{}return {version:1,location:'home',experience:'beginner',goal:'general',days:[],minutes:45,equipment:[],start_date:new Date().toISOString().slice(0,10),screening:{confirmed:false,symptoms:false,pain:false,restriction:false,recent_surgery:false}};});
 useEffect(()=>{try{sessionStorage.setItem(TRAINING_DRAFT_KEY,JSON.stringify(input));}catch{/* Checkout requires a readable draft and reports a recoverable error. */}},[input]);
 return [input,setInput] as const;
}
export function TrainingSetup({input,setInput}:{input:TrainingInput;setInput:(input:TrainingInput)=>void}){
 const [section,setSection]=useState<'schedule'|'equipment'|'safety'>('schedule');
 return <div className="member-training-setup">
 <nav className="training-sections" aria-label="تنظیم برنامه تمرین">{(['schedule','equipment','safety'] as const).map((key,i)=><button type="button" key={key} aria-pressed={section===key} onClick={()=>setSection(key)}>{['برنامهٔ من','تجهیزات','ایمنی'][i]}</button>)}</nav>
 {section==='schedule'&&<section className="training-form-section"><p className="member-muted">۲ یا ۳ روز غیرمتوالی را انتخاب کن.</p><div className="training-field-grid">
 <label>محل تمرین<PanelSelect value={input.location} onChange={e=>setInput({...input,location:e.target.value as 'home'|'gym',equipment:[],screening:{...input.screening,confirmed:false}})}><option value="home">خانه</option><option value="gym">باشگاه</option></PanelSelect></label>
 <label>زمان هر جلسه<PanelSelect value={input.minutes} onChange={e=>setInput({...input,minutes:Number(e.target.value)})}><option value={45}>۴۵ دقیقه</option><option value={60}>۶۰ دقیقه</option></PanelSelect></label>
 <label className="training-wide">تجربهٔ تمرین<PanelSelect value={input.experience} onChange={e=>setInput({...input,experience:e.target.value as TrainingInput['experience']})}><option value="beginner">تازه شروع می‌کنم</option><option value="returning">دوباره شروع می‌کنم</option><option value="regular">منظم تمرین می‌کنم</option></PanelSelect></label></div>
 <fieldset className="training-days"><legend>روزهای تمرین</legend>{WEEKDAYS.map((d,i)=><button type="button" key={d} aria-pressed={input.days.includes(i)} onClick={()=>setInput({...input,days:input.days.includes(i)?input.days.filter(x=>x!==i):[...input.days,i]})}>{d}</button>)}</fieldset>
 <button type="button" className="training-next" onClick={()=>setSection('equipment')}>ادامه؛ تجهیزات</button></section>}
 {section==='equipment'&&<section className="training-form-section"><h3>چه وسایلی در دسترس داری؟</h3><p className="member-muted">فقط وسایلی را انتخاب کن که می‌توانی استفاده کنی.</p><div className="training-equipment">{Object.entries(EQUIPMENT).filter(([k])=>input.location==='gym'||['dumbbells','long_band','stable_platform'].includes(k)).map(([k,label])=><label key={k}><input type="checkbox" checked={input.equipment.includes(k as Equipment)} onChange={e=>setInput({...input,equipment:e.target.checked?[...input.equipment,k as Equipment]:input.equipment.filter(x=>x!==k)})}/><span>{label}</span></label>)}</div><button type="button" className="training-next" onClick={()=>setSection('safety')}>ادامه؛ بررسی ایمنی</button></section>}
 {section==='safety'&&<section className="training-form-section"><h3>قبل از شروع، این موارد را بررسی کن</h3><p className="member-muted">اگر هر مورد دربارهٔ تو صدق می‌کند، آن را انتخاب کن.</p>{(['symptoms','pain','restriction','recent_surgery'] as const).map((k,i)=><label className="training-check" key={k}><input type="checkbox" checked={input.screening[k]} onChange={e=>setInput({...input,screening:{...input.screening,[k]:e.target.checked,confirmed:false}})}/><span>{['علائم غیرمعمول حین فعالیت دارم','درد یا آسیب فعال دارم','پزشک محدودیت فعالیت تعیین کرده','اخیراً جراحی داشته‌ام'][i]}</span></label>)}<label className="training-check training-confirm"><input type="checkbox" checked={input.screening.confirmed} onChange={e=>setInput({...input,screening:{...input.screening,confirmed:e.target.checked}})}/><span>همهٔ پاسخ‌ها را بررسی و تأیید می‌کنم.</span></label></section>}
 </div>;
}
