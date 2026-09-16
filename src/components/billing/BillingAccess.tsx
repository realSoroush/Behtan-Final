import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { paymentRequest, startCheckout, type BillingStatus, type PaymentOrder } from '@/lib/payments';
import { Step11Paywall } from '@/components/onboarding/Step11Paywall';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { formatSubscriptionPrice } from '@/utils/subscriptionPlans';

export function BillingAccess({children,onSignOut}:{children:ReactNode;onSignOut:()=>Promise<void>}) {
  const [status,setStatus]=useState<BillingStatus|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(true);
  const [returnAttempts,setReturnAttempts]=useState(0);
  const [token,setToken]=useState(()=>new URLSearchParams(window.location.search).get('payment'));
  const [returnedOrder,setReturnedOrder]=useState<PaymentOrder|null>(null);
  const mounted=useRef(true);
  const running=useRef(false);
  const refresh=useCallback(async (verifyToken?:string)=>{
    if(running.current)return;
    running.current=true;setBusy(true);
    if(verifyToken)setReturnAttempts(n=>n+1);
    try {
      if(verifyToken){
        const result=await paymentRequest<{order:PaymentOrder}>({action:'verify',token:verifyToken});
        if(mounted.current)setReturnedOrder(result.order);
      }
      const next=await paymentRequest<BillingStatus>({action:'status'});
      if(mounted.current){setStatus(next);setError(null);}
    } catch(e){if(mounted.current)setError(e instanceof Error?e.message:'خطای دریافت وضعیت');}
    finally{running.current=false;if(mounted.current)setBusy(false);}
  },[]);
  useEffect(()=>{
    mounted.current=true;
    void refresh(token ?? undefined);
    const onFocus=()=>{if(document.visibilityState==='visible')void refresh(token ?? undefined);};
    const interval=window.setInterval(onFocus,30000);
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return()=>{mounted.current=false;clearInterval(interval);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[refresh,token]);
  useEffect(()=>{
    if(!status?.active)return;
    const remaining=Date.parse(status.active.expires_at)-Date.now();
    if(remaining<=0)return;
    const timer=window.setTimeout(()=>{setStatus(old=>old?{...old,active:null}:old);void refresh();},Math.min(remaining+50,2147483647));
    return()=>clearTimeout(timer);
  },[status,refresh]);
  const closeResult=useCallback(()=>{
    const url=new URL(window.location.href);url.searchParams.delete('payment');
    window.history.replaceState(null,'',url.pathname+url.search+url.hash);setToken(null);setReturnedOrder(null);setReturnAttempts(0);
  },[]);
  const active=Boolean(status?.active && Date.parse(status.active.expires_at)>Date.now());
  const order=returnedOrder ?? status?.orders.find(o=>o.token===token);
  const confirmedReturn=Boolean(token && order?.status==='paid' && active && !error);
  const waitingForReturn=Boolean(token && !error && order?.status!=='failed' && !confirmedReturn && returnAttempts<6);

  useEffect(()=>{
    if(confirmedReturn)closeResult();
  },[confirmedReturn,closeResult]);

  // Reconcile a delayed gateway callback automatically, with bounded retries.
  useEffect(()=>{
    if(!waitingForReturn || busy || !token)return;
    const timer=window.setTimeout(()=>void refresh(token),3000);
    return()=>window.clearTimeout(timer);
  },[waitingForReturn,busy,token,refresh,returnAttempts]);

  if((!status && !error) || (token && (busy || waitingForReturn || confirmedReturn)))return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center bg-neutral-50 px-5 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100" aria-busy="true">
      <div role="status" aria-live="polite" className="space-y-4 text-center">
        <div aria-hidden="true" className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="font-bold">{token ? 'در حال تأیید پرداخت و آماده‌سازی برنامه شما…' : 'در حال بارگذاری برنامه شما…'}</p>
        {token && <p className="text-sm text-neutral-500 dark:text-neutral-400">پس از تأیید، خودکار وارد برنامه می‌شوید.</p>}
      </div>
    </main>
  );

  if(active && !token)return <>
    <div dir="rtl" className="bg-primary-50 px-4 py-2 text-center text-xs text-primary-800 dark:bg-primary-950 dark:text-black">
      {status!.mode==='sandbox'?'حالت آزمایشی — پرداخت و اشتراک واقعی نیست.':'اشتراک فعال'}
      {' · تا '}{new Date(status!.active!.expires_at).toLocaleDateString('fa-IR')}
    </div>{children}
  </>;
  return <main dir="rtl" className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center justify-between"><strong>اشتراک به‌تن</strong><div className="flex items-center gap-4"><ThemeToggle/><button onClick={()=>void onSignOut()} className="text-sm text-neutral-500">خروج</button></div></div>
      {status?.mode==='sandbox' && <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">حالت آزمایشی؛ وجه واقعی دریافت نمی‌شود و این اشتراک در حالت واقعی اعتبار ندارد.</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-7 text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {token && <section className="space-y-3 rounded-3xl border border-neutral-200 p-5 dark:border-neutral-800" aria-live="polite">
        <h1 className="text-xl font-bold">{order?.status==='paid'?'پرداخت و فعال‌سازی تأیید شد': 'بررسی نتیجه پرداخت'}</h1>
        {order && <p>{order.planName} · {formatSubscriptionPrice(order.priceToman)}{order.priceToman>0?' تومان':''}</p>}
        {order?.refId && <p className="break-all text-sm">شماره پیگیری: <bdi>{order.refId}</bdi></p>}
        {order?.lastCode != null && order.lastCode < 0 && <p className="text-sm">کد آخرین پاسخ درگاه: <bdi>{order.lastCode}</bdi></p>}
        {order?.status==='paid' && !active && <p className="text-sm leading-7 text-neutral-500">پرداخت تأیید شده؛ فعال‌شدن اشتراک هنوز تأیید نشده است. وضعیت را دوباره بررسی کنید.</p>}
        {order?.status!=='paid' && <p className="text-sm leading-7 text-neutral-500">هنوز پرداخت تأییدشده‌ای برای این سفارش ثبت نشده است. اگر وجه کسر شده، ابتدا وضعیت را دوباره بررسی کنید.</p>}
        <button className="rounded-xl bg-primary-500 px-4 py-3 font-bold text-white" disabled={busy} onClick={()=>void refresh(token)}>بررسی مجدد وضعیت</button>
        <button className="block py-2 text-sm" onClick={closeResult}>{active?'ورود به برنامه':'بازگشت به اشتراک‌ها'}</button>
      </section>}
      {!token && !active && status && <>
        <p className="text-sm leading-7 text-neutral-500">برای دسترسی به برنامه، یک اشتراک فعال نیاز دارید. اطلاعات قبلی شما محفوظ است.</p>
        {!status.checkout_enabled ? <p>پرداخت هنوز فعال نشده است.</p> : <Step11Paywall checkout onComplete={async(_code,plan)=>{
          if(!plan)return;
          await startCheckout(plan);await refresh();
        }}/>} 
      </>}
      {!token && status && status.orders.length>0 && <section className="space-y-3">
        <h2 className="font-bold">سفارش‌های اخیر</h2>
        {status.orders.slice(0,5).map(o=><div key={o.id} className="space-y-2 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <p>{o.planName} · {formatSubscriptionPrice(o.priceToman)}{o.priceToman>0?' تومان':''} · {o.status==='paid'?'تأییدشده':o.status==='failed'?'درخواست ناموفق':'در انتظار تأیید'}{o.mode==='sandbox'?' (آزمایشی)':''}</p>
          {o.refId && <p className="break-all">شماره پیگیری: <bdi>{o.refId}</bdi></p>}
          {o.status==='pending' && <div className="flex gap-5"><button disabled={busy} onClick={()=>void refresh(o.token)}>بررسی وضعیت</button>{o.paymentUrl && <a className="text-primary-600" href={o.paymentUrl}>ادامه پرداخت</a>}</div>}
        </div>)}
      </section>}
      <button disabled={busy} onClick={()=>void refresh(token ?? undefined)} className="w-full rounded-xl border border-neutral-300 py-3 text-sm dark:border-neutral-700">{busy?'در حال بررسی…':'به‌روزرسانی وضعیت'}</button>
    </div>
  </main>;
}
