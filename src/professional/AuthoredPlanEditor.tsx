import { ManualTrainingBuilder } from './training/ManualTrainingBuilder';
import { NutritionStudio } from './NutritionStudio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDown, Copy, Save, Sparkles, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { rpc } from './api';
import { type AuthoredContent, type AuthoredSnapshot, printAuthored } from './authoredPlan';
import { lineDescription, prepareContent, trainingLine, validateAuthored } from './studioModel';
import type { RealIntake } from './menuPlan';
import './studio.css';
const empty = (kind: 'nutrition' | 'training'): AuthoredContent => ({ version: 1,
  title: kind === 'nutrition' ? 'برنامه غذایی اختصاصی' : 'برنامه تمرینی اختصاصی', notes: '', reviewed: false,
  sections: [{ title: kind === 'nutrition' ? 'صبحانه' : 'جلسه اول', lines: kind === 'training' ? [trainingLine()] : [{name:'',details:''}] }],
});
const message = (e: unknown) => {
    const s = e instanceof Error ? e.message : '';
    return s.includes('PRO_SERVER_CREDENTIAL_INVALID') ? 'کلید سروری Supabase نامعتبر یا بدون مجوز است؛ SUPABASE_SERVICE_ROLE_KEY را در محیط سرور بررسی کنید.'
      : s.includes('PRO_SERVER_NOT_CONFIGURED') ? 'تنظیمات سرور ساخت برنامه کامل نیست؛ PRO_SERVER_PLANS_ENABLED و کلیدهای سروری را بررسی کنید.'
      : s.includes('PRO_CATALOG_UNAVAILABLE') ? 'کاتالوگ یا سیاست محاسبات تغذیه در دسترس نیست؛ بررسی سرویس را اجرا کنید.'
      : s.includes('PRO_STALE_REVISION') ? 'نسخه پرونده تغییر کرده است؛ اطلاعات را دوباره دریافت کنید.'
      : s.includes('PRO_MODULE_DISABLED') ? 'ساخت در این ماژول فعال نیست؛ سوابق همچنان در دسترس‌اند.'
      : s.includes('PRO_SUBSCRIPTION_EXPIRED') ? 'اعتبار ساخت و ویرایش پایان یافته؛ سوابق و PDF باز هستند.'
      : s.includes('PRO_CASE_ARCHIVED') ? 'پرونده بایگانی است؛ برای ساخت نسخه جدید آن را بازگردانید.'
      : s.includes('PRO_ACCESS_DENIED') ? 'دسترسی به این پرونده فعال نیست.'
      : s.includes('PRO_INVALID_PLAN') ? 'عنوان، بخش‌ها و مقادیر برنامه را کامل کنید.'
      : s && !s.includes('PRO_') ? s : 'عملیات کامل نشد؛ تغییرات حفظ شدند. دوباره تلاش کنید.';
  };

export function AuthoredPlanEditor({ org, record, revision, kind, name, canWrite, onBusy, seed, onDirty, onGenerate, intake, onSaved }: {
  org: string; record: string; revision: number; kind: 'nutrition' | 'training'; name: string; canWrite: boolean;
  onBusy: (b: boolean) => void; seed?: AuthoredContent; onDirty?: (b: boolean) => void;
  onGenerate?: () => Promise<AuthoredContent>; intake?: RealIntake; onSaved?: () => void;
}) {
  const [content, setContent] = useState<AuthoredContent>(() => prepareContent(seed ? { ...seed, reviewed: false } : empty(kind), kind));
  const [rows, setRows] = useState<AuthoredSnapshot[]>([]), [page, setPage] = useState(0), [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(false), [historyBusy, setHistoryBusy] = useState(false), [error, setError] = useState(''), [historyError, setHistoryError] = useState(''), [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<AuthoredSnapshot | null>(null), [viewing, setViewing] = useState<AuthoredSnapshot | null>(null), [loaded, setLoaded] = useState(false);
  const request = useRef<{ key: string; content: AuthoredContent } | null>(null), pending = useRef(false), alive = useRef(true), seq = useRef(0);
  const notify = useRef(onBusy), dirtyNotify = useRef(onDirty), baseline = useRef(seed ? '' : JSON.stringify(content));
  notify.current = onBusy; dirtyNotify.current = onDirty;
  const dirty = JSON.stringify(content) !== baseline.current;
  useEffect(() => { dirtyNotify.current?.(dirty); }, [dirty]);
  const invalidate=useCallback(()=>{seq.current++;},[]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); notify.current(false); dirtyNotify.current?.(false); }; }, [invalidate]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty || pending.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const load = useCallback(async (p: number) => {
    const n = ++seq.current; setHistoryBusy(true); setHistoryError('');
    try {
      const { data, error } = await supabase.from('pro_authored_plans').select('id,kind,content,intake_revision,recorded_at,display_name').eq('organization_id', org).eq('record_id', record).eq('kind', kind).order('recorded_at', { ascending: false }).order('id').range(p * 10, p * 10 + 10).abortSignal(AbortSignal.timeout(12000)).retry(false);
      if (error) throw new Error('دریافت سوابق انجام نشد؛ دوباره تلاش کنید.');
      if (!alive.current || seq.current !== n) return;
      setRows((data ?? []).slice(0, 10)); setHasNext((data?.length ?? 0) > 10); setLoaded(true);
    } catch (e) { if (alive.current && seq.current === n) setHistoryError(message(e)); }
    finally { if (alive.current && seq.current === n) setHistoryBusy(false); }
  },[org,record,kind]);
  useEffect(() => { setLoaded(false); void load(page); return invalidate; }, [load,page,invalidate]);
  const mutate = (fn: (d: AuthoredContent) => void) => {
    if (pending.current || request.current) return;
    setContent(c => { const d = structuredClone(c); fn(d); d.reviewed = false; return d; });
    setSaved(null); setNotice(''); setError('');
  };
  async function save() {
    if (pending.current || !canWrite) return;
    const validation = validateAuthored(request.current?.content || content, kind);
    if (validation || !content.reviewed) { setError(validation || 'بازبینی برنامه را تأیید کنید.'); return; }
    pending.current = true; setBusy(true); notify.current(true); setError('');
    try {
      const req = request.current ?? { key: crypto.randomUUID(), content: structuredClone(content) }; request.current = req;
      const id = await rpc<string>('pro_save_authored_plan', { p_org: org, p_record: record, p_revision: revision, p_kind: kind, p_content: req.content, p_key: req.key });
      if (!alive.current) return;
      const snapshot = { id, kind, content: req.content, display_name: name, intake_revision: revision, recorded_at: new Date().toISOString() };
      baseline.current = JSON.stringify(req.content); setSaved(snapshot); setContent(req.content); request.current = null; dirtyNotify.current?.(false);
      setNotice('نسخهٔ تأییدشده ذخیره شد؛ برای تغییر، نسخهٔ جدید بسازید.');
      onSaved?.();
      if (page === 0) await load(0); else setPage(0);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof Error && /PRO_INVALID_PLAN|PRO_STALE_REVISION|PRO_MODULE_DISABLED|PRO_CASE_ARCHIVED|PRO_SUBSCRIPTION_EXPIRED|PRO_ACCESS_DENIED/.test(e.message)) request.current = null;
      setError(message(e));
    } finally { pending.current = false; if (alive.current) { setBusy(false); notify.current(false); } }
  }
  async function generate() {
    if (pending.current || !canWrite || !onGenerate || request.current) return;
    if (dirty && !window.confirm('پیش‌نویس فعلی با خروجی موتور جایگزین شود؟ نسخه‌های ثبت‌شده حفظ می‌شوند.')) return;
    pending.current = true; setBusy(true); notify.current(true); setError('');
    try { const next = await onGenerate(); if (alive.current) { setContent(prepareContent(next, kind)); setSaved(null); setNotice('پیش‌نویس موتور بر اساس پرونده آماده شد. مقدارها را بازبینی کنید؛ هنوز ثبت نشده است.'); } }
    catch (e) { if (alive.current) setError(message(e)); }
    finally { pending.current = false; if (alive.current) { setBusy(false); notify.current(false); } }
  }
  const validation = validateAuthored(content, kind);
  return <section className="pro-authored-editor studio" aria-busy={busy}>
    <div className="studio-intro"><div><small>پروندهٔ {name}</small><h3>{kind === 'training' ? 'برنامه‌سازی، با کنترل کامل شما.' : 'تغذیه، با دقت در هر وعده.'}</h3><p>{kind === 'training' ? 'حرکت‌ها را انتخاب کنید، کنار هم بچینید و نتیجه را همان لحظه ببینید.' : 'وعده‌ها را بچینید، مقدار مواد را تنظیم کنید و جمع برنامه را زنده ببینید.'}</p></div><span className="studio-pill">{kind === 'training' ? 'استودیوی تمرین' : 'استودیوی تغذیه'}</span></div>
    {error && <p role="alert" className="pro-error">{error}</p>}{notice && <p role="status" className="pro-success">{notice}</p>}
    {!canWrite && <p role="status" className="pro-muted">مشاهده و دانلود سوابق فعال است؛ ساخت نسخهٔ جدید فعلاً بسته است.</p>}
    {canWrite && <>
      <fieldset disabled={busy || Boolean(request.current)}><div className="studio-title-row"><label>عنوان برنامه<input aria-label="عنوان برنامه اختصاصی" value={content.title} maxLength={160} onChange={e => mutate(d => { d.title = e.target.value; })} /></label>{onGenerate && <button type="button" onClick={() => void generate()}><Sparkles size={17} />ساخت برنامه توسط به‌تن</button>}</div>
        {kind === 'training' ? <ManualTrainingBuilder content={content} mutate={mutate} /> : <NutritionStudio org={org} record={record} revision={revision} content={content} mutate={mutate} intake={intake} />}
        <label className="pro-authored-notes">یادداشت متخصص<textarea aria-label="یادداشت متخصص" value={content.notes} maxLength={4000} rows={3} onChange={e => mutate(d => { d.notes = e.target.value; })} /></label>
        <label className="pro-authored-review"><input type="checkbox" aria-label="تأیید برنامه اختصاصی متخصص" checked={content.reviewed} onChange={e => setContent({ ...content, reviewed: e.target.checked })} />این نسخه و تناسب آن با شرایط مراجع را بازبینی و تأیید کردم.</label>
      </fieldset>
      {validation && <p className="studio-help">{validation}</p>}
      <div className="studio-save-bar"><span>{saved ? 'نسخه تأییدشده ثبت شده' : dirty ? 'تغییرات ثبت نشده' : 'آماده تدوین برنامه'}</span><div className="pro-actions"><button className="pro-primary" disabled={busy || Boolean(validation) || !content.reviewed || Boolean(saved)} onClick={() => void save()}><Save size={17} />{request.current ? 'تلاش مجدد ثبت نسخه' : 'ثبت نسخهٔ تأییدشده'}</button>{saved && <button disabled={busy} onClick={() => void printAuthored(saved, name).catch(e => setError(message(e)))}><FileDown size={17} />PDF نسخه ثبت‌شده</button>}</div></div>
    </>}
    <section className="studio-history"><div className="studio-row"><h3>سوابق برنامه‌های اختصاصی</h3><button type="button" disabled={historyBusy} onClick={() => void load(page)}><RefreshCw size={16} />دریافت سوابق</button></div>
      {historyBusy && <p role="status">در حال دریافت سوابق…</p>}{historyError && <p role="alert" className="pro-error">{historyError}</p>}
      {loaded && !historyBusy && !historyError && !rows.length && <p className="pro-muted">هنوز برنامهٔ اختصاصی ثبت نشده است.</p>}
      {rows.map(p => <article className="pro-authored-snapshot" key={p.id}><div><strong>{p.content.title}</strong><small>{new Date(p.recorded_at).toLocaleString('fa-IR')} · نسخه پرونده {p.intake_revision.toLocaleString('fa-IR')}</small></div><div className="pro-actions">
        <button disabled={busy} onClick={() => setViewing(viewing?.id === p.id ? null : p)}>مشاهده نسخه</button>
        {canWrite && <button disabled={busy || Boolean(request.current)} onClick={() => { if (dirty && !window.confirm('تغییرات ثبت‌نشده کنار گذاشته شوند؟')) return; setContent(prepareContent({ ...p.content, reviewed: false }, kind)); setSaved(null); setNotice('نسخهٔ جدید برای ویرایش آماده است؛ نسخهٔ قبلی تغییر نمی‌کند.'); }}><Copy size={16} />ساخت نسخه جدید</button>}
        <button onClick={() => void printAuthored(p, name).catch(e => setError(message(e)))}><FileDown size={16} />PDF</button>
      </div></article>)}
      {viewing && <section className="studio-snapshot" aria-label="نسخه ذخیره‌شده"><div className="studio-row"><h4>{viewing.content.title}</h4><button onClick={() => setViewing(null)}>بستن مشاهده نسخه</button></div>{viewing.content.sections.map((s, i) => <section key={i}><h4>{s.title}</h4>{s.lines.map((l, j) => <p key={j}><strong>{l.name}</strong><span>{lineDescription(l)}</span></p>)}</section>)}<p>{viewing.content.notes}</p></section>}
      <div className="pro-actions"><button disabled={page === 0 || historyBusy || busy} onClick={() => setPage(p => p - 1)}>جدیدتر</button><span>صفحه {(page + 1).toLocaleString('fa-IR')}</span><button disabled={!hasNext || historyBusy || busy} onClick={() => setPage(p => p + 1)}>قدیمی‌تر</button></div>
    </section>
  </section>;
}
