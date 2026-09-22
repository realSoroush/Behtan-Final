import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabaseClient';
import type {ProgressEntry} from '@/utils/progressJournal';
const labels:Record<string,string>={mostly:'بیشتر مواقع',partly:'بخشی از مواقع',little:'خیلی کم',comfortable:'قابل‌تحمل',sometimes:'گاهی آزاردهنده',often:'اغلب آزاردهنده',none:'بدون مانع',time:'وقت',cost:'هزینه',taste:'سلیقه و تکرار',portions:'مقدار',other:'دلیل دیگر'};
export function AdminProgress({userId}:{userId:string}) {
  const [entries,setEntries]=useState<ProgressEntry[]>([]);
  const [status,setStatus]=useState('در حال دریافت روند…');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),12000);
    setStatus('در حال دریافت روند…');setEntries([]);
    void(async()=>{
      try{const {data,error}=await supabase.rpc('admin_progress',{p_user:userId}).abortSignal(controller.signal);
        if(active){setStatus(error?'دریافت روند انجام نشد.':'');setEntries(error?[]:(data??[]) as ProgressEntry[]);}
      }catch{if(active)setStatus('دریافت روند انجام نشد.');}finally{clearTimeout(timeout);}
    })();
    return()=>{active=false;controller.abort();clearTimeout(timeout);};
  },[userId,retry]);
  return <section className="admin-card"><h2>روند وزن و تجربهٔ اجرای برنامه</h2><p>خوداظهاری کاربر؛ این پاسخ‌ها به‌تنهایی باعث تغییر خودکار رژیم نمی‌شوند.</p>
    {status?<p role="status">{status}<button onClick={()=>setRetry(n=>n+1)}>تلاش دوباره</button></p>:entries.length===0?<p>هنوز گزارشی ثبت نشده است.</p>:<div className="admin-table"><table><thead><tr><th>تاریخ</th><th>وزن</th><th>اجرای برنامه</th><th>گرسنگی</th><th>مانع</th></tr></thead><tbody>{entries.map(e=><tr key={e.entry_date}><td>{new Date(e.entry_date+'T12:00:00').toLocaleDateString('fa-IR')}</td><td>{e.weight_kg?.toLocaleString('fa-IR')??'—'}</td><td>{labels[e.adherence??'']??'—'}</td><td>{labels[e.hunger??'']??'—'}</td><td>{labels[e.difficulty??'']??'—'}</td></tr>)}</tbody></table></div>}
  </section>;
}
