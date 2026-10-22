import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { BehtanMascot } from '@/components/companion/BehtanMascot';
import type { CompanionMessage } from '@/components/companion/companionState';
export function MemberCompanion({message,name,reactionKey,onAction,days,selectedDate,onSelectDay}:{message:CompanionMessage;name?:string|null;reactionKey?:string|number;onAction:()=>void;days:string[];selectedDate:string;onSelectDay:(date:string)=>void}){
 const [expanded,setExpanded]=useState(false);
 return <aside className="member-companion-v4" aria-label="همراه به‌تن">
  <div className="member-companion-main"><div className="member-mascot-interactive"><BehtanMascot mood={message.mood} size="medium" reactionKey={reactionKey}/><small>بهم سلام کن</small></div><div className="member-companion-copy"><div className="member-greeting">{name?.trim()?`سلام ${name.trim()}`:'سلام، خوش آمدی'}</div><p role="status" aria-live="polite">{selectedDate===days[0]?message.title:'برنامه‌ات را از قبل مرور کن.'}</p></div><button type="button" className="member-tip-button" aria-label="راهنمای همراه" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><ChevronDown size={18}/></button></div>
  <div className="companion-days" aria-label="انتخاب روز برنامه">{days.map((date,i)=><button type="button" key={date} aria-pressed={selectedDate===date} onClick={()=>onSelectDay(date)}><span>{i===0?'امروز':new Date(date+'T12:00:00').toLocaleDateString('fa-IR',{weekday:'long'})}</span><b>{new Date(date+'T12:00:00').toLocaleDateString('fa-IR',{day:'numeric',month:'short'})}</b><i/></button>)}</div>
  {expanded&&<div className="member-companion-detail"><p>{message.body}</p>{message.action&&<button type="button" onClick={onAction}>{message.action} ←</button>}</div>}
 </aside>;
}
