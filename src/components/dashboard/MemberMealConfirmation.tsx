import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import type { Meal } from '@/types';
import { BehtanMascot } from '@/components/companion/BehtanMascot';
import { MemberDialog } from './MemberDialog';
export function MemberMealConfirmation({meal,onConfirm,onCancel}:{meal:Meal;onConfirm:()=>void;onCancel:()=>void}) {
 const [submitting,setSubmitting]=useState(false);
 const [canceling,setCanceling]=useState(false);
 const requested=useRef(false);
 const confirmRef=useRef(onConfirm);confirmRef.current=onConfirm;
 const cancelRef=useRef(onCancel);cancelRef.current=onCancel;
 const reduced=useReducedMotion();
 useEffect(()=>{
  if(!submitting&&!canceling)return;
  const timer=setTimeout(()=>{if(submitting)confirmRef.current();else cancelRef.current();},reduced?0:140);
  return()=>clearTimeout(timer);
 },[submitting,canceling,reduced]);
 return <MemberDialog title="تأیید ثبت وعده" variant="confirmation" onClose={onCancel} dismissible={!submitting&&!canceling} exiting={submitting||canceling}>
  <div className="meal-confirmation-content"><BehtanMascot mood={submitting?'celebrate':'guide'} size="medium" priority/>
   <h3>این وعده رو خوردی؟</h3><p>با تأیید تو، به غذاهای ثبت‌شدهٔ امروز اضافه می‌شود.</p>
   <div className="meal-confirmation-summary"><strong>{meal.label}{meal.estimated?' · وعدهٔ دلخواه':''}</strong><span>{Math.round(meal.totalKcal).toLocaleString('fa-IR')} کالری{meal.estimated?' تخمینی':''}</span></div>
   <div className="meal-confirmation-actions"><button type="button" className="member-primary" disabled={submitting||canceling} onClick={()=>{if(requested.current)return;requested.current=true;setSubmitting(true);}}><Check size={18}/>بله، ثبت کن</button><button type="button" className="member-secondary" disabled={submitting||canceling} onClick={()=>setCanceling(true)}>هنوز نخوردم</button></div>
  </div>
 </MemberDialog>;
}
