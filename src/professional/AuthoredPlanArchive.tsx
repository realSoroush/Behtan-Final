import {trainingStartLabel} from './training/trainingDate';
import { AppLoading } from '@/components/ui/AppLoading';
import { useEffect, useState } from 'react';
import { FileDown, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { printAuthored, type AuthoredSnapshot } from './authoredPlan';
import { lineDescription } from './studioModel';
import { AuthoredNutritionPreview } from './AuthoredNutritionPreview';
import { rpc } from './api';
import type { AuthoredContent } from './authoredPlan';

export function AuthoredPlanArchive({ org, record, name, phone, canDeliver }: { org: string; record: string; name: string; phone: string; canDeliver: boolean }) {
  const [rows, setRows] = useState<AuthoredSnapshot[]>([]);
  const [page, setPage] = useState(0), [reload, setReload] = useState(0), [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [printError, setPrintError] = useState('');
  const [viewing, setViewing] = useState<AuthoredSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 12000);
    setBusy(true); setError(''); setPrintError(''); setRows([]); setHasNext(false); setViewing(null);
    void (async () => {
      try {
        // Use the signed-in client's existing case RLS, scoped to this organization and record.
        const { data, error: failure } = await supabase.from('pro_authored_plans')
          .select('id,kind,content,intake_revision,recorded_at,display_name')
          .eq('organization_id', org).eq('record_id', record)
          .order('recorded_at', { ascending: false }).order('id')
          .range(page * 10, page * 10 + 10).abortSignal(controller.signal).retry(false);
        if (failure) throw failure;
        if (active) { setRows((data ?? []).slice(0, 10)); setHasNext((data?.length ?? 0) > 10); }
      } catch {
        if (active) setError('دریافت آرشیو برنامه‌های اختصاصی انجام نشد؛ دوباره تلاش کنید.');
      } finally {
        window.clearTimeout(timeout);
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [org, record, page, reload]);

  return <section className="studio studio-history" aria-label="آرشیو برنامه‌های اختصاصی" aria-busy={busy}>
    <div className="studio-row"><h4>سوابق برنامه‌های اختصاصی</h4><button type="button" disabled={busy} onClick={() => { setPage(0); setReload(n => n + 1); }}><RefreshCw size={16} />به‌روزرسانی آرشیو اختصاصی</button></div>
    {busy && <AppLoading label="در حال دریافت برنامه‌های اختصاصی…" />}
    {error && <p role="alert" className="pro-error">{error}</p>}
    {printError && <p role="alert" className="pro-error">{printError}</p>}
    {!busy && !error && !rows.length && <p className="pro-muted">هنوز برنامهٔ اختصاصی ثبت نشده است.</p>}
    {rows.map(p => <article className="pro-authored-snapshot" key={p.id}>
      <div><strong>{p.content.title}</strong><small>{p.kind === 'training' ? 'تمرین اختصاصی' : 'تغذیه اختصاصی'} · {new Date(p.recorded_at).toLocaleString('fa-IR')} · نسخه پرونده {p.intake_revision.toLocaleString('fa-IR')}</small></div>
      <div className="pro-actions">
        <button type="button" onClick={() => setViewing(viewing?.id === p.id ? null : p)}>مشاهده برنامه اختصاصی</button>
        <button type="button" onClick={() => { setPrintError(''); void printAuthored(p, name, org).catch(e => setPrintError(e instanceof Error ? e.message : 'خروجی PDF انجام نشد؛ دوباره تلاش کنید.')); }}><FileDown size={16} />PDF برنامه اختصاصی</button>
      </div>
    </article>)}
    {viewing && <section className="studio-snapshot" aria-label="مشاهده برنامه اختصاصی ذخیره‌شده">
      <div className="studio-row"><h4>{viewing.content.title}</h4><button type="button" onClick={() => setViewing(null)}>بستن مشاهده برنامه اختصاصی</button></div>
      {viewing.kind==='training'&&viewing.content.startDate&&<p>تاریخ شروع: {trainingStartLabel(viewing.content.startDate)}</p>}{viewing.kind === 'nutrition' ? <AuthoredNutritionPreview content={viewing.content} showTitle={false} /> : viewing.content.sections.map((s, i) => <section key={i}><h4>{s.title}</h4>{s.lines.map((l, j) => <p key={j}><strong>{l.name}</strong><span>{lineDescription(l)}</span></p>)}</section>)}
      {viewing.kind === 'nutrition' && <NutritionDelivery key={viewing.id} org={org} record={record} plan={viewing.id} phone={phone} canDeliver={canDeliver} />}
      {viewing.kind === 'training' && <p>{viewing.content.notes}</p>}
    </section>}
    <div className="pro-actions">
      <button type="button" disabled={busy || page === 0} onClick={() => setPage(p => p - 1)}>اختصاصی‌های جدیدتر</button>
      <span>صفحه {(page + 1).toLocaleString('fa-IR')}</span>
      <button type="button" disabled={busy || !hasNext || Boolean(error)} onClick={() => setPage(p => p + 1)}>اختصاصی‌های قدیمی‌تر</button>
    </div>
  </section>;
}

function NutritionDelivery({ org, record, plan, phone, canDeliver }: {
  org: string; record: string; plan: string; phone: string; canDeliver: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<{ before: AuthoredContent; reason: string } | null | undefined>();
  const ids = { p_org: org, p_record: record, p_plan: plan };

  async function deliver(active: boolean) {
    if (busy || (active && !canDeliver)) return;
    if (active && !window.confirm(`همین نسخه در حساب به‌تن با شمارهٔ ${phone} نمایش داده شود؟`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await rpc('pro_deliver_nutrition', { ...ids, p_phone: phone, p_deliver: active });
      setNotice(active ? 'این نسخه در حساب مراجع در دسترس است.' : 'دسترسی مراجع به این نسخه برداشته شد.');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(code.includes('PRO_DELIVERY_MEMBER_NOT_FOUND')
        ? 'مراجع باید ابتدا با همین شماره وارد به‌تن شود و شماره را تأیید کند.'
        : code.includes('PRO_DELIVERY_PHONE_CHANGED')
          ? 'شمارهٔ پرونده معتبر نیست یا تغییر کرده است. پرونده را دوباره باز کنید.'
          : 'وضعیت ارسال تغییر نکرد. دوباره تلاش کنید.');
    } finally { setBusy(false); }
  }

  async function loadAudit() {
    setBusy(true);
    setError('');
    try { setAudit(await rpc<{ before: AuthoredContent; reason: string } | null>('pro_nutrition_override', ids)); }
    catch { setError('دریافت سابقهٔ تغییر انجام نشد.'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-3">
    <div className="pro-actions">
      <button type="button" disabled={busy || !canDeliver || !phone} onClick={() => void deliver(true)}>ارسال به حساب مراجع</button>
      <button type="button" disabled={busy} onClick={() => void deliver(false)}>برداشتن دسترسی مراجع</button>
      {audit === undefined && <button type="button" disabled={busy} onClick={() => void loadAudit()}>سابقهٔ تغییر متخصص</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {audit === null && <p>برای این نسخه سابقهٔ تغییر ثبت نشده است.</p>}
    {audit && <details><summary>دلیل تغییر و نسخهٔ قبل</summary><p>{audit.reason}</p><AuthoredNutritionPreview content={audit.before} /></details>}
  </div>;
}
