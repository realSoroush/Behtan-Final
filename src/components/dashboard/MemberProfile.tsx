import {useEffect,useState} from 'react';
import {Activity,ChevronDown,ReceiptText,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabaseClient';
import type {UserProfile} from '@/types';
import {ProgressJournal} from './ProgressJournal';

const n=(value:number|null|undefined)=>value==null?'—':value.toLocaleString('fa-IR');
const goals:Record<string,string>={weight_loss:'کاهش وزن',weight_gain:'افزایش وزن',maintenance:'حفظ وزن'};
const budgets:Record<string,string>={economic:'اقتصادی',balanced:'متعادل',performance:'عملکردی'};
const levels:Record<string,string>={sedentary:'کم‌تحرک',lightly_active:'کمی فعال',moderate:'فعالیت متوسط',active:'پرتحرک'};
const date=(s:string)=>new Date(s).toLocaleDateString('fa-IR');
type EnteredProfile=Pick<UserProfile,'weight'|'height'|'goal'|'activity_level'|'workout_days'|'protein_budget_preference'>;
type Membership={subscriptions:{plan_code:string;starts_at:string;expires_at:string}[];orders:{id:string;plan_name:string;price_toman:number;mode:string;verified_at:string;captured_at:string|null;profile:EnteredProfile|null}[]};
function ProfileFacts({profile}:{profile:EnteredProfile}) {
 return <dl className="grid grid-cols-3 gap-x-3 gap-y-5 text-center">
  {[[`${n(profile.weight)} کیلو`,'وزن مبنای برنامه'],[`${n(profile.height)} سانت`,'قد'],[`${n(profile.workout_days)} روز`,'ورزش در هفته']].map(([value,label])=><div key={label}><dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt><dd className="mt-1.5 text-sm font-bold text-neutral-900 dark:text-neutral-100">{value}</dd></div>)}
 </dl>;
}
export function MemberProfile({profile,today}:{profile:UserProfile;today:string}) {
 const [history,setHistory]=useState<Membership|null>(null);const [error,setError]=useState(false);const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setHistory(null);setError(false);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  void(async()=>{try{const {data,error}=await supabase.rpc('my_membership_history').abortSignal(controller.signal);if(active){if(error || !data || !Array.isArray(data.subscriptions) || !Array.isArray(data.orders))throw error ?? new Error('Invalid history');setHistory(data as Membership);}}catch{if(active)setError(true);}finally{clearTimeout(timer);}})();
  return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[profile.id,retry]);
 const active=history?.subscriptions.find(s=>Date.parse(s.starts_at)<=Date.now()&&Date.parse(s.expires_at)>Date.now());
 return <div className="space-y-6">
  <section aria-labelledby="member-profile-title" className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
   <div className="flex items-center gap-3 mb-6"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"><UserRound size={24} aria-hidden="true"/></div><div className="min-w-0"><h1 id="member-profile-title" tabIndex={-1} className="font-bold text-lg text-neutral-900 dark:text-neutral-100">پروفایل من</h1><p className="text-sm text-neutral-500 dark:text-neutral-400"><bdi>{profile.phone}</bdi></p></div></div>
   <div className="mb-6 flex items-center justify-between gap-3"><span className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{goals[profile.goal??'']??'هدف ثبت نشده'}</span><span className="rounded-full bg-primary-50 px-3 py-1.5 text-xs text-primary-800 dark:bg-primary-900/30 dark:text-primary-200">{budgets[profile.protein_budget_preference??'']??'ترجیح ثبت نشده'}</span></div>
   <ProfileFacts profile={profile}/>
   <div className="mt-5 flex items-center gap-2 border-t border-neutral-100 pt-4 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400"><Activity size={16} aria-hidden="true"/>{levels[profile.activity_level??'']??'تحرک ثبت نشده'}</div>
  </section>
  <section aria-labelledby="membership-title" className="px-1">
   <div className="flex items-center gap-2 mb-3"><ReceiptText size={18} className="text-primary-600 dark:text-primary-400" aria-hidden="true"/><h2 id="membership-title" className="font-bold text-neutral-900 dark:text-neutral-100">اشتراک‌های من</h2></div>
   {error?<p role="alert" className="text-sm text-neutral-600 dark:text-neutral-400">سابقه دریافت نشد.<button className="min-h-11 px-3 underline" onClick={()=>setRetry(v=>v+1)}>تلاش دوباره</button></p>:!history?<p role="status" className="text-sm text-neutral-500">در حال دریافت…</p>:<>
    {active&&<p className="mb-3 text-sm text-primary-700 dark:text-primary-300">فعال تا {date(active.expires_at)}</p>}
    {history.orders.length===0?<p className="text-sm text-neutral-500 dark:text-neutral-400">هنوز پرداخت تأییدشده‌ای ثبت نشده.</p>:<div className="divide-y divide-neutral-200 dark:divide-neutral-800">{history.orders.map(o=><details key={o.id} className="group py-1">
     <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm text-neutral-900 dark:text-neutral-100"><span><strong className="block">{o.plan_name}{o.mode==='sandbox'?' · آزمایشی':''}</strong><span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{date(o.verified_at)} · {o.price_toman===0?'رایگان':`${n(o.price_toman)} تومان`}</span></span><ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"/></summary>
     <div className="pb-4 pt-2">{o.profile?<><p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">اطلاعات زمان درخواست اشتراک · {goals[o.profile.goal??'']??'—'}</p><ProfileFacts profile={o.profile}/></>:<p className="text-xs leading-6 text-neutral-500 dark:text-neutral-400">برای این پرداخت قدیمی، نسخهٔ اطلاعات آن زمان ذخیره نشده است.</p>}</div>
    </details>)}</div>}
   </>}
  </section>
  <ProgressJournal userId={profile.id} today={today}/>
 </div>;
}
