import { useEffect, useRef, useState } from 'react';
import { Check, SkipForward } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import type { Meal } from '@/types';
import { BehtanMascot } from '@/components/companion/BehtanMascot';
import { MemberDialog } from './MemberDialog';
export function MemberMealConfirmation({meal,action="record",onConfirm,onCancel}:{meal:Meal;action?:"record"|"skip";onConfirm:()=>void;onCancel:()=>void}) {
 const [submitting,setSubmitting]=useState(false);
 const [canceling,setCanceling]=useState(false);
 const requested=useRef(false);
 const confirmRef=useRef(onConfirm);confirmRef.current=onConfirm;
 const cancelRef=useRef(onCancel);cancelRef.current=onCancel;
 const reduced=useReducedMotion();
 const skipping=action==="skip";
 useEffect(()=>{
  if(!submitting&&!canceling)return;
  const timer=setTimeout(()=>{if(submitting)confirmRef.current();else cancelRef.current();},reduced?0:140);
  return()=>clearTimeout(timer);
 },[submitting,canceling,reduced]);
 return <MemberDialog title={skipping?"تأیید نخوردن وعده":"تأیید ثبت وعده"} variant="confirmation" onClose={onCancel} dismissible={!submitting&&!canceling} exiting={submitting||canceling}>
  <div className="meal-confirmation-content"><BehtanMascot mood={submitting&&!skipping?'celebrate':'guide'} size="medium" priority/>
   <h3>{skipping?'این وعده رو رد می‌کنی؟':'این وعده رو خوردی؟'}</h3>
   <p>{skipping?'از وعده‌های پیش رو کنار می‌رود. می‌توانی از فهرست وعده‌های امروز آن را برگردانی.':'با تأیید تو، به غذاهای ثبت‌شدهٔ امروز اضافه می‌شود.'}</p>
   <div className="meal-confirmation-summary"><strong>{meal.label}{meal.estimated?' · وعدهٔ دلخواه':''}</strong><span>{Math.round(meal.totalKcal).toLocaleString('fa-IR')} کالری{meal.estimated?' تخمینی':''}</span></div>
   <div className="meal-confirmation-actions"><button type="button" className="member-primary" disabled={submitting||canceling} onClick={()=>{if(requested.current)return;requested.current=true;setSubmitting(true);}}>{skipping?<SkipForward size={18}/>:<Check size={18}/>} {skipping?"بله، نخوردم":"بله، ثبت کن"}</button><button type="button" className="member-secondary" disabled={submitting||canceling} onClick={()=>setCanceling(true)}>{skipping?"انصراف":"هنوز نخوردم"}</button></div>
  </div>
 </MemberDialog>;
}
