import {useState} from 'react';
import type {ProgressEntry} from '@/utils/progressJournal';
import {parseWeight,reviewDue,weightTrend} from '@/utils/progressJournal';
import {useProgressJournal} from '@/hooks/useProgressJournal';

const number=(n:number)=>n.toLocaleString('fa-IR',{maximumFractionDigits:1});
const dateLabel=(date:string)=>new Date(date+'T12:00:00').toLocaleDateString('fa-IR',{month:'short',day:'numeric'});
export function ProgressJournal({userId,today}:{userId:string;today:string}) {
  const journal=useProgressJournal(userId,today);
  const [editing,setEditing]=useState(false);
  const [weight,setWeight]=useState('');
  const [adherence,setAdherence]=useState<ProgressEntry['adherence']>(null);
  const [hunger,setHunger]=useState<ProgressEntry['hunger']>(null);
  const [difficulty,setDifficulty]=useState<ProgressEntry['difficulty']>(null);
  const [message,setMessage]=useState('');const [error,setError]=useState('');
  const {points,change}=weightTrend(journal.entries);
  const open=()=>{const entry=journal.entries.find(e=>e.entry_date===today);setWeight(entry?.weight_kg?.toString()??'');setAdherence(entry?.adherence??null);setHunger(entry?.hunger??null);setDifficulty(entry?.difficulty??null);setMessage('');setError('');setEditing(true);};
  const save=async(e:React.FormEvent)=>{
    e.preventDefault();setError('');setMessage('');
    try{const weight_kg=parseWeight(weight);if(weight_kg===null&&!adherence&&!hunger&&!difficulty)throw Error('وزن یا حداقل یک پاسخ را وارد کن.');
      await journal.save({entry_date:today,weight_kg,adherence,hunger,difficulty});setMessage('اطلاعات امروز ذخیره شد.');setEditing(false);
    }catch(err){setError(err instanceof Error?err.message:'ثبت انجام نشد. دوباره تلاش کن.');}
  };
  const field='w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-3 text-sm text-neutral-900 dark:text-neutral-100';
  const min=points.length?Math.min(...points.map(p=>p.weight_kg!)):0;
  const max=points.length?Math.max(...points.map(p=>p.weight_kg!)):0;
  const firstTime=points.length?Date.parse(points[0].entry_date):0;
  const lastTime=points.length?Date.parse(points[points.length-1].entry_date):0;
  const chartPoints=points.map(p=>({x:10+(Date.parse(p.entry_date)-firstTime)/Math.max(1,lastTime-firstTime)*280,y:64-(p.weight_kg!-min)/Math.max(1,max-min)*50}));
  return <section aria-labelledby="progress-title" className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
    <div className="flex items-center justify-between gap-3"><h2 id="progress-title" className="font-bold text-neutral-900 dark:text-neutral-100">روند من</h2><span className="text-xs text-neutral-500">وزن و تجربهٔ اجرای برنامه</span></div>
    {journal.loading?<p role="status" className="text-sm text-neutral-500">در حال دریافت روند…</p>:journal.error?<div role="alert" className="text-sm text-red-600 dark:text-red-400">{journal.error}<button type="button" onClick={journal.retry} className="underline p-3">تلاش دوباره</button></div>:<>
      {points.length?<div><div className="flex justify-between items-baseline"><strong className="text-2xl text-neutral-900 dark:text-neutral-100">{number(points[points.length-1].weight_kg!)} <small className="text-xs font-normal">کیلوگرم</small></strong><span className="text-xs text-neutral-500">آخرین ثبت: {dateLabel(points[points.length-1].entry_date)}</span></div>
        {points.length>1&&<><svg viewBox="0 0 300 76" role="img" aria-label={`روند وزن از ${number(points[0].weight_kg!)} تا ${number(points[points.length-1].weight_kg!)} کیلوگرم`} className="w-full h-20 my-2 text-primary-600 dark:text-primary-400"><path d="M10 64H290" stroke="currentColor" opacity="0.15"/><polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" points={chartPoints.map(p=>`${p.x},${p.y}`).join(' ')}/>{chartPoints.map((p,i)=><circle key={points[i].entry_date} cx={p.x} cy={p.y} r={3} fill="currentColor"/>)}</svg><div dir="ltr" className="mb-3 flex justify-between text-[11px] text-neutral-500 dark:text-neutral-400"><span>{dateLabel(points[0].entry_date)}</span><span>{dateLabel(points[points.length-1].entry_date)}</span></div><p className="text-xs text-neutral-600 dark:text-neutral-400">تغییر از {dateLabel(points[0].entry_date)}: {change!>0?'+':''}{number(change!)} کیلوگرم؛ از {number(points.length)} ثبت. نوسان روزانه طبیعی است؛ به روند نگاه کن.</p></>}
      </div>:<p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">اولین وزن را ثبت کن تا بتوانی تغییراتت را در طول زمان ببینی.</p>}
      {!editing&&<><button type="button" onClick={open} className="w-full rounded-xl bg-primary-600 text-white min-h-11 px-4 py-3 text-sm font-semibold">{journal.entries.some(e=>e.entry_date===today)?'ویرایش ثبت امروز':reviewDue(journal.entries,today)?'ثبت وزن و بررسی هفته':'ثبت وزن امروز'}</button>{reviewDue(journal.entries,today)&&<p className="text-xs text-neutral-500 leading-5">این هفته اجرای برنامه چطور بود؟ سه سؤال کوتاه؛ پاسخ‌دادن اختیاری است.</p>}</>}
      {editing&&<form onSubmit={save} className="space-y-4">
        <label className="block text-sm text-neutral-700 dark:text-neutral-300">وزن امروز (کیلوگرم، اختیاری)<input aria-label="وزن امروز" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="مثلاً ۸۴٫۵" className={field} disabled={journal.saving}/></label>
        <label className="block text-sm text-neutral-700 dark:text-neutral-300">در هفتهٔ گذشته چقدر برنامه را اجرا کردی؟<select className={field} value={adherence??''} onChange={e=>setAdherence(e.target.value as ProgressEntry['adherence']||null)} disabled={journal.saving}><option value="">فعلاً پاسخ نمی‌دهم</option><option value="mostly">بیشتر مواقع</option><option value="partly">بخشی از مواقع</option><option value="little">خیلی کم</option></select></label>
        <label className="block text-sm text-neutral-700 dark:text-neutral-300">گرسنگی بین وعده‌ها چطور بود؟<select className={field} value={hunger??''} onChange={e=>setHunger(e.target.value as ProgressEntry['hunger']||null)} disabled={journal.saving}><option value="">فعلاً پاسخ نمی‌دهم</option><option value="comfortable">قابل‌تحمل</option><option value="sometimes">گاهی آزاردهنده</option><option value="often">اغلب آزاردهنده</option></select></label>
        <label className="block text-sm text-neutral-700 dark:text-neutral-300">بزرگ‌ترین مانع اجرای برنامه؟<select className={field} value={difficulty??''} onChange={e=>setDifficulty(e.target.value as ProgressEntry['difficulty']||null)} disabled={journal.saving}><option value="">فعلاً پاسخ نمی‌دهم</option><option value="none">مانعی نداشتم</option><option value="time">وقت آماده‌سازی</option><option value="cost">هزینهٔ مواد</option><option value="taste">سلیقه و تکرار غذا</option><option value="portions">مقدار وعده‌ها</option><option value="other">دلیل دیگر</option></select></label>
        <p className="text-xs text-neutral-500 leading-5">این ثبت برای پیگیری روند است؛ وزن مبنای رژیم و کالری برنامه خودکار تغییر نمی‌کنند.</p>
        {error&&<p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3"><button disabled={journal.saving} className="flex-1 rounded-xl bg-primary-600 text-white p-3 text-sm disabled:opacity-50">{journal.saving?'در حال ذخیره…':'ذخیرهٔ امروز'}</button><button type="button" disabled={journal.saving} onClick={()=>setEditing(false)} className="rounded-xl border border-neutral-300 dark:border-neutral-700 px-4 text-sm text-neutral-700 dark:text-neutral-300">انصراف</button></div>
      </form>}
      {journal.entries.length>0&&<details><summary className="cursor-pointer min-h-11 py-3 text-sm text-neutral-600 dark:text-neutral-400">ثبت‌های قبلی ({number(journal.entries.length)})</summary><ul className="max-h-48 overflow-auto text-sm divide-y divide-neutral-100 dark:divide-neutral-800">{journal.entries.map(e=><li key={e.entry_date} className="flex justify-between gap-3 py-3 text-neutral-600 dark:text-neutral-400"><span>{dateLabel(e.entry_date)}</span><span>{e.weight_kg!==null?`${number(e.weight_kg)} کیلوگرم`:'بدون ثبت وزن'}{e.adherence||e.hunger||e.difficulty?' · بررسی ثبت شده':''}</span></li>)}</ul></details>}
    </>}
    <p role="status" className="text-sm text-primary-700 dark:text-primary-300">{message}</p>
  </section>;
}
