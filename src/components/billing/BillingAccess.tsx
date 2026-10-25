import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { paymentRequest, startCheckout, type BillingStatus, type PaymentOrder } from '@/lib/payments';
import { Step11Paywall } from '@/components/onboarding/Step11Paywall';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { CompanionCard } from '@/components/companion/CompanionCard';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ShieldCheck, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import '../onboarding/onboarding.css';
import './billing.css';
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
    <main dir="rtl" className="onboarding-app onboarding-loading" aria-busy="true">
      <Loader2 size={30} className="animate-spin" aria-hidden="true" />
      <div role="status" aria-live="polite" className="billing-loading">
        <p>{token ? 'در حال بررسی پرداختت…' : 'در حال دریافت وضعیت اشتراکت…'}</p>
        {token && <small>تا مشخص‌شدن نتیجه، پرداخت دیگری انجام نده.</small>}
      </div>
    </main>
  );

  if(active && !token)return <>
    <div dir="rtl" className="bg-primary-50 px-4 py-2 text-center text-xs text-primary-800 dark:bg-primary-950 dark:text-primary-200">
      {status!.mode==='sandbox'?'حالت آزمایشی — پرداخت و اشتراک واقعی نیست.':'اشتراک فعال'}
      {' · تا '}{new Date(status!.active!.expires_at).toLocaleDateString('fa-IR')}
    </div>{children}
  </>;
  return <div className="onboarding-app billing-app" dir="rtl">
    <header className="onboarding-topbar"><div>
      <a className="onboarding-brand" href="/" aria-label="صفحهٔ اصلی به‌تن"><img src={APP_LOGO_PATH} alt=""/><strong>{APP_NAME_FA}</strong></a>
      <span className="onboarding-topbar-label">یک قدم تا برنامهٔ خودت</span>
      <ThemeToggle/>
      <button type="button" onClick={()=>void onSignOut()} aria-label="خروج از حساب" title="خروج از حساب"><LogOut size={18}/></button>
    </div></header>
    <div className="onboarding-layout">
      <aside className="onboarding-guide">
        <div className="onboarding-intro"><span className="onboarding-eyebrow">آمادهٔ شروعی؟</span><h2>برنامهٔ تو،<br/>همراه روزهای تو.</h2><p>اشتراک مناسب خودت را انتخاب کن؛ قبل از پرداخت، امکان ساخت برنامه‌ات را بررسی می‌کنیم.</p></div>
        <CompanionCard message={{mood:token?'thinking':'welcome',title:token?'با هم نتیجه را بررسی می‌کنیم.':'اطلاعاتت پیش ما محفوظ است.',body:token?'اگر وجه کسر شده، تا مشخص‌شدن نتیجه دوباره پرداخت نکن.':'نیازی به پاسخ دوباره به سؤال‌ها نیست؛ از همین‌جا ادامه بده.'}}/>
        <p className="onboarding-save-note"><ShieldCheck size={16}/>پرداخت امن، بدون تمدید خودکار.</p>
      </aside>
      <main className="onboarding-panel billing-panel" aria-labelledby="billing-title">
        <div className="billing-heading"><span className="onboarding-eyebrow">اشتراک به‌تن</span><h1 id="billing-title">{token?'نتیجهٔ پرداختت':'ادامهٔ مسیر، با برنامهٔ تو'}</h1><p>{token?'وضعیت سفارش را از درگاه بررسی می‌کنیم.':'پاسخ‌هایت ذخیره شده؛ اشتراک دلخواهت را انتخاب کن.'}</p></div>
        {status?.mode==='sandbox' && <p className="billing-notice">حالت آزمایشی؛ وجه واقعی دریافت نمی‌شود.</p>}
        {error && <p role="alert" className="onboarding-error">{error}</p>}
        {token && <section className="billing-result" aria-live="polite">
          <h2>{order?.status==='paid'?'پرداخت تأیید شد':order?.status==='failed'?'این پرداخت تکمیل نشده':'نتیجهٔ پرداخت هنوز مشخص نیست'}</h2>
          {order && <p>{order.planName} · {formatSubscriptionPrice(order.priceToman)}{order.priceToman>0?' تومان':''}</p>}
          {order?.refId && <p>شماره پیگیری: <bdi>{order.refId}</bdi></p>}
          {order?.lastCode != null && order.lastCode < 0 && <p>کد پاسخ درگاه: <bdi>{order.lastCode}</bdi></p>}
          {order?.status==='paid' && !active && <p>پرداختت تأیید شده؛ فعال‌شدن اشتراک را دوباره بررسی کن.</p>}
          {order?.status!=='paid' && <p>اگر وجه کسر شده، ابتدا نتیجه را دوباره بررسی کن.</p>}
          <button type="button" className="billing-primary" disabled={busy} onClick={()=>void refresh(token)}>بررسی دوبارهٔ پرداخت</button>
          <button type="button" className="billing-text-button" onClick={closeResult}>{active?'ورود به برنامه':'بازگشت به اشتراک‌ها'}</button>
        </section>}
        {!token && !active && status && <>
          {!status.checkout_enabled ? <p className="billing-notice">پرداخت فعلاً فعال نیست. اطلاعاتت محفوظ است.</p> : <Step11Paywall checkout onComplete={async(_code,plan)=>{
            if(!plan)return;
            await startCheckout(plan);await refresh();
          }}/>}
        </>}
        {!token && status && status.orders.length>0 && <details className="billing-orders" open={status.orders.some(o=>o.status==='pending')}>
          <summary>سفارش‌های اخیر</summary>
          <div>{status.orders.slice(0,5).map(o=><article key={o.id} className="billing-order">
            <div><strong>{o.planName}</strong><span>{o.status==='paid'?'تأییدشده':o.status==='failed'?'تکمیل‌نشده':'در حال بررسی'}</span></div>
            <p>{formatSubscriptionPrice(o.priceToman)}{o.priceToman>0?' تومان':''}{o.mode==='sandbox'?' · آزمایشی':''}</p>
            {o.refId && <p>شماره پیگیری: <bdi>{o.refId}</bdi></p>}
            {o.status==='pending' && <div className="billing-order-actions"><button type="button" disabled={busy} onClick={()=>void refresh(o.token)}>بررسی پرداخت</button>{o.paymentUrl && <a href={o.paymentUrl}>ادامهٔ پرداخت</a>}</div>}
          </article>)}</div>
        </details>}
        <button type="button" disabled={busy} onClick={()=>void refresh(token ?? undefined)} className="billing-refresh"><RefreshCw size={15} className={busy?'animate-spin':''}/>{busy?'در حال بررسی…':'به‌روزرسانی وضعیت اشتراک'}</button>
      </main>
    </div>
    <footer className="onboarding-footer">به‌تن همراه توست؛ از همین‌جا ادامه می‌دهیم.</footer>
  </div>;
}
