import './jalali-date.css';
import {useEffect,useRef,useState} from 'react';
import {PanelSelect} from './PanelSelect';
import {isoToJalali,jalaliMonthLength,jalaliToIso} from '@/utils/jalaliDate';
import { getTehranDateKey } from '@/utils/dailyMealProgress';
const months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const read=(value:string)=>isoToJalali(value)||{year:0,month:0,day:0};
const fa=(n:number)=>n.toLocaleString('fa-IR',{useGrouping:false});
/** Date-only field: Persian editing, ISO storage, no timezone conversion of the day. */
export function JalaliDateInput({value,onChange,label='تاریخ شروع تمرین',disabled=false}:{value:string;onChange:(iso:string)=>void;label?:string;disabled?:boolean}){
 const [draft,setDraft]=useState(()=>read(value)),emitted=useRef(value);
 useEffect(()=>{if(value!==emitted.current){setDraft(read(value));emitted.current=value;}},[value]);
 const year=isoToJalali(getTehranDateKey())!.year;
 const years=[...new Set([...(draft.year?[draft.year]:[]),...Array.from({length:11},(_,i)=>year-5+i)])].sort((a,b)=>b-a);
 const days=draft.month?jalaliMonthLength(draft.year||year,draft.month):31;
 function change(key:'year'|'month'|'day',number:number){
  const next={...draft,[key]:number};if(next.month&&next.day>jalaliMonthLength(next.year||year,next.month))next.day=0;
  setDraft(next);const iso=next.year&&next.month&&next.day?jalaliToIso(next.year,next.month,next.day)||'':'';emitted.current=iso;onChange(iso);
 }
 return <fieldset className="pro-jalali-date" dir="rtl" disabled={disabled}><legend>{label} (شمسی)</legend><div>
  <label>روز<PanelSelect aria-label={'روز '+label}value={draft.day}onChange={e=>change('day',Number(e.target.value))}><option value={0}>روز</option>{Array.from({length:days},(_,i)=>i+1).map(n=><option key={n}value={n}>{fa(n)}</option>)}</PanelSelect></label>
  <label>ماه<PanelSelect aria-label={'ماه '+label}value={draft.month}onChange={e=>change('month',Number(e.target.value))}><option value={0}>ماه</option>{months.map((name,i)=><option key={name}value={i+1}>{name}</option>)}</PanelSelect></label>
  <label>سال<PanelSelect aria-label={'سال '+label}value={draft.year}onChange={e=>change('year',Number(e.target.value))}><option value={0}>سال</option>{years.map(n=><option key={n}value={n}>{fa(n)}</option>)}</PanelSelect></label>
 </div></fieldset>;
}
