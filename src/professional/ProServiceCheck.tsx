import { useState } from 'react';
import { LoadingMascot } from '@/components/ui/AppLoading';
import { proPlanAccessToken } from './planSession';
import { clearPilotTimings, pilotTimingsEnabled, readPilotTimings } from '@/utils/pilotTimings';
import { proErrorMessage } from './contracts';

export function ProServiceCheck() {
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');
  async function check() {
    setBusy(true);
    setResult('');
    let requestId: string | null = null;
    try {
      const token = await proPlanAccessToken(AbortSignal.timeout(8_000));
      const res = await fetch('/api/pro-plan', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(18_000),
      });
      const id = res.headers.get('X-Request-Id');
      requestId = id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
      let body;
      try { body = await res.json(); }
      catch (error) {
        if (res.status === 504 || (error instanceof Error && error.name === 'TimeoutError'))
          throw new Error('PRO_REQUEST_TIMEOUT');
        throw new Error(res.status === 404 || res.ok ? 'PRO_API_NOT_DEPLOYED' : 'PRO_API_UNAVAILABLE');
      }
      if (!res.ok) throw new Error(body?.error || (res.status === 504 ? 'PRO_REQUEST_TIMEOUT' : 'PRO_CONNECTION_ERROR'));
      if (!body || typeof body.ready !== 'boolean') throw new Error('PRO_API_UNAVAILABLE');
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
      const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.message === 'PRO_REQUEST_TIMEOUT');
      const message = isTimeout
        ? 'بررسی سرویس در زمان مقرر پاسخ نگرفت. دوباره بررسی کنید.'
        : error instanceof Error && error.message === 'PRO_API_NOT_DEPLOYED'
          ? 'API این انتشار موجود نیست؛ انتشار پنل را بررسی کنید.'
          : proErrorMessage(error);
      setResult(message + (requestId ? ' · کد پیگیری: ' + requestId : ''));
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
