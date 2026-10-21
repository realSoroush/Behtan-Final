import { proErrorMessage } from './contracts';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
export function ProServiceCheck(){
 const [result,setResult]=useState(''),[busy,setBusy]=useState(false);
 async function check(){setBusy(true);try{const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('دوباره وارد شوید.');const res=await fetch('/api/pro-plan',{headers:{Authorization:`Bearer ${data.session.access_token}`},signal:AbortSignal.timeout(15000)});let body;try{body=await res.json();}catch{throw new Error(res.status===404||res.ok?'API این انتشار موجود نیست؛ فایل api/pro-plan.ts و دیپلوی پنل را بررسی کنید.':'سرور پاسخ معتبر نداد؛ لاگ Vercel را بررسی کنید.');}if(!res.ok)throw new Error(proErrorMessage(new Error(body.error||'PRO_CONNECTION_ERROR')));setResult(body.ready?'سرویس و نسخه دیتابیس در دسترس‌اند؛ اکنون ساخت برنامه را امتحان کنید.':'تنظیمات سرور Pro ناقص است: '+(body.missing??[]).join('، ')+'؛ پس از ثبت تنظیمات، Redeploy کنید.');}catch(e){setResult(e instanceof Error?e.message:'بررسی کامل نشد.');}finally{setBusy(false);}}
 return <div className="pro-service-check"><button disabled={busy} onClick={()=>void check()}>{busy?'در حال بررسی…':'بررسی سرویس ساخت برنامه'}</button>{result&&<p role="status">{result}</p>}</div>;
}
