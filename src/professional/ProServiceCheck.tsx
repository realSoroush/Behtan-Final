import { useState } from 'react';
import { LoadingMascot } from '@/components/ui/AppLoading';
import { supabase } from '@/lib/supabaseClient';
import { clearPilotTimings, pilotTimingsEnabled, readPilotTimings } from '@/utils/pilotTimings';
import { proErrorMessage } from './contracts';

export function ProServiceCheck() {
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');
  async function check() {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('دوباره وارد شوید.');
      const res = await fetch('/api/pro-plan', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      let body;
      try { body = await res.json(); }
      catch {
        throw new Error(res.status === 404 || res.ok
          ? 'API این انتشار موجود نیست؛ فایل api/pro-plan.ts و دیپلوی پنل را بررسی کنید.'
          : 'سرور پاسخ معتبر نداد؛ لاگ Vercel را بررسی کنید.');
      }
      if (!res.ok) throw new Error(proErrorMessage(new Error(body.error || 'PRO_CONNECTION_ERROR')));
      if (!body.ready) {
        setResult('تنظیمات سرور Pro ناقص است: ' + (body.missing ?? []).join('، ') + '؛ پس از ثبت تنظیمات، Redeploy کنید.');
      } else if (body.generationAccess === 'legacy') {
        setResult('سرویس در دسترس است. مسیر مایگریشن ۰۵۷ هنوز در API دیتابیس پیدا نشد و ساخت برنامه از مسیر قبلی انجام می‌شود.');
      } else if (body.generationAccess === '057') {
        setResult('مسیر ساخت برنامه و کنترل دسترسی مایگریشن ۰۵۷ در دسترس‌اند.');
      } else {
        setResult('سرویس و نسخه دیتابیس در دسترس‌اند؛ اکنون ساخت برنامه را امتحان کنید.');
      }
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'بررسی کامل نشد.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="pro-service-check">
    <button disabled={busy} onClick={() => void check()}>
      {busy ? <><LoadingMascot />در حال بررسی…</> : 'بررسی سرویس ساخت برنامه'}
    </button>
    {result && <p role="status">{result}</p>}
    {pilotTimingsEnabled() && <div className="pro-pilot-report">
      <p>زمان درخواست‌ها در همین تب ثبت می‌شود. می‌توانید متن گزارش را کپی کنید.</p>
      <button type="button" onClick={() => setReport(readPilotTimings())}>نمایش گزارش زمان‌بندی</button>{' '}
      <button type="button" onClick={() => { clearPilotTimings(); setReport(''); }}>پاک‌کردن گزارش</button>
      {report && <textarea aria-label="گزارش زمان‌بندی پایلوت" dir="ltr" readOnly rows={10} value={report} />}
    </div>}
  </div>;
}
