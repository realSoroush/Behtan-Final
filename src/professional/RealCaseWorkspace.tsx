import {AuthoredPlanEditor} from './AuthoredPlanEditor';
import type {AuthoredContent} from './authoredPlan';
import {TrainingPanel} from './training/TrainingPanel';
import {PanelModal} from "@/components/ui/PanelModal";
import { PanelSelect } from "@/components/ui/PanelSelect";
import { Archive, ArchiveRestore, ArrowRight, Check, ChevronLeft, FileText, FolderHeart, Plus, RefreshCw, Save, Search, Sparkles, UserRound, Users, Dumbbell, Utensils, ScanLine, ArrowUpLeft, PenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaseIntakeForm } from "./CaseIntakeForm";
import {
  realCaseApi,
  type CaseSummary,
  type WorkspaceStatus,
  type RealRevision,
  type SavedRealPlan,
} from "./realCaseApi";
import {
  emptyRealIntake,
  type RealIntake,
  type PrintedPlan,
} from "./menuPlan";
import { BodyScanPanel } from "./body/BodyScanPanel";
import {ReportAttachment} from "./body/ReportAttachment";
import {printPlanWithBody} from "./body/printBodyPlan";
import { PlanPreview } from "./PlanPreview";
import { proErrorMessage, type ProRole } from "./contracts";
const baseMessage = (e: unknown) =>
  e instanceof Error && !e.message.startsWith("PRO_")
    ? e.message
    : proErrorMessage(e);
const message = (e: unknown) => {
  const text = baseMessage(e);
  const id = e instanceof Error ? /\[([0-9a-f-]{36})\]/.exec(e.message)?.[1] : null;
  return text + (id ? ' · کد پیگیری: ' + id : '');
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function RealCaseWorkspace({
  org,
  roles,
}: {
  org: string;
  roles: ProRole[];
}) {
  const [rows, setRows] = useState<CaseSummary[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [archivedOnly,setArchivedOnly]=useState(false),
    [search, setSearch] = useState(""), [query,setQuery] = useState(''), [page,setPage] = useState(0),
    [total,setTotal] = useState(0), [access,setAccess] = useState<WorkspaceStatus|null>(null);
  const seq = useRef(0);
  const archiveKeys=useRef(new Map<string,string>());
  const load = useCallback(async () => {
    const n = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const [data,status] = await Promise.all([realCaseApi.list(org,query,page,archivedOnly),realCaseApi.status(org)]);
      if (seq.current === n) {setRows(data.rows);setTotal(data.total);setAccess(status);}
    } catch (e) {
      if (seq.current === n) setError(message(e));
    } finally {
      if (seq.current === n) setBusy(false);
    }
  }, [org,query,page,archivedOnly]);
  useEffect(() => {
    void load();
    return () => {
      seq.current++;
    };
  }, [load]);
  async function archiveRow(row:CaseSummary){
    if(busy||!access?.can_write)return;
    const next=!row.archived_at;
    if(!window.confirm(next?'پرونده بایگانی شود؟ تمام برنامه‌ها و PDFهای قبلی حفظ می‌شوند.':'پرونده از بایگانی بازگردد؟'))return;
    const request=row.id+':'+(row.archive_revision??0)+':'+next;
    if(!archiveKeys.current.has(request))archiveKeys.current.set(request,crypto.randomUUID());
    setBusy(true);setError('');try{await realCaseApi.archive(org,row.id,row.archive_revision??0,next,archiveKeys.current.get(request)!);await load();}catch(e){setError(message(e));}finally{setBusy(false);}
  }
  if (!roles.some((r) => r === "owner" || r === "practitioner"))
    return (
      <section className="pro-panel">
        <p>
          دسترسی ساخت و مشاهده برنامه برای نقش مالک یا کارشناس فضای کاری فعال
          است.
        </p>
      </section>
    );
  if (selected !== null)
    return (
      <RealCaseDetail
        key={selected}
        org={org}
        initialId={selected === "new" ? null : selected}
        onBack={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  return (
    <section className="pro-panel pro-record-workspace pro-directory">
      <div className="pro-toolbar pro-directory-heading">
        <div><p className="pro-section-kicker">مراجعان شما</p><h2>هر پرونده، یک مسیر تازه.</h2></div>
        <div className="pro-actions">
          <button disabled={busy} onClick={() => void load()}>
            <RefreshCw size={16} className={busy ? "pro-spin" : ""} /> دریافت مجدد
          </button>
          <button className="pro-primary" disabled={busy||!access?.can_write||(access.case_limit!==null&&access.case_count>=access.case_limit)} onClick={() => setSelected("new")}>
            <Plus size={18} /> پرونده جدید
          </button>
        </div>
      </div>
      {access && <div className="pro-overview" aria-label="خلاصه فضای کاری">
        <div><span className="pro-stat-icon"><Users size={19} /></span><span><small>پرونده‌های فضای کاری</small><strong>{access.case_count.toLocaleString('fa-IR')} <em>{access.case_limit !== null ? 'از '+access.case_limit.toLocaleString('fa-IR') : 'پرونده'}</em></strong></span></div>
        <div><span className={'pro-license-dot '+(!access.can_write?'is-paused':'')} /><span><small>وضعیت دسترسی</small><strong className="pro-stat-caption">{access.can_write ? 'آمادهٔ ساخت برنامه' : 'مشاهدهٔ سوابق'}<em>{access.expires_at ? 'تا '+new Date(access.expires_at).toLocaleDateString('fa-IR') : 'فضای کاری فعال'}</em></strong></span></div>
      </div>}
      {access && !access.can_write && <p className="pro-muted">ساخت و ویرایش فعلاً غیرفعال است؛ همه سوابق و PDFها در دسترس‌اند. برای ادامه، از «اشتراک و ظرفیت» درخواست تمدید ثبت کنید.</p>}
      <div className="pro-directory-filter"><button aria-pressed={!archivedOnly} onClick={()=>{setArchivedOnly(false);setPage(0);}}>پرونده‌های فعال</button><button aria-pressed={archivedOnly} onClick={()=>{setArchivedOnly(true);setPage(0);}}><Archive size={16}/>بایگانی</button></div>
      <form className="pro-search-bar" onSubmit={e=>{e.preventDefault();setPage(0);setQuery(search.trim().replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/^\+/, '').replace(/^0(?=9\d{9}$)/,'98'));}}>
        <label><span className="sr-only">جست‌وجوی نام یا شماره</span><Search size={19} aria-hidden="true" /><input placeholder="نام یا شماره تماس مراجع…" aria-label="جست‌وجوی پرونده" type="search" value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/></label>
        <button disabled={busy}>جستجو</button><span className="pro-result-count">{total.toLocaleString("fa-IR")} نتیجه</span>
      </form>
      {error && (
        <p role="alert" className="pro-error">
          {error}
        </p>
      )}
      {busy && <p role="status">در حال دریافت پرونده‌ها…</p>}
      {!busy && !error && !rows.length && (
        <div className="pro-empty pro-directory-empty"><span className="pro-empty-icon"><FolderHeart size={30} /></span><h3>{query ? 'پرونده‌ای پیدا نشد' : 'اولین همراهی از اینجا شروع می‌شود.'}</h3><p>{query ? 'نام یا شماره را دوباره بررسی کنید.' : 'برای شروع، اولین مراجع را با «پرونده جدید» ثبت کنید.'}</p>{query && <button onClick={()=>{setSearch('');setQuery('');setPage(0);}}>نمایش همه مراجعان</button>}</div>
      )}
      <div className="pro-list-caption"><span>مراجع / شماره تماس</span><span>آخرین ویرایش</span><span>پرونده</span></div>
      <ul className="pro-cases pro-directory-list">
        {rows.map((r) => (
            <li key={r.id}>
              <div className="pro-person"><span className="pro-avatar" aria-hidden="true">{r.display_name.trim().slice(0,1)}</span><div><strong>{r.display_name}</strong><span dir="ltr">{r.phone || '—'}</span></div></div>
              <div className="pro-record-meta"><time>{new Date(r.updated_at).toLocaleDateString('fa-IR')}</time><small>نسخه {r.revision.toLocaleString("fa-IR")}</small></div>
              <div className="pro-case-row-actions"><button className="pro-open-case" onClick={() => setSelected(r.id)}>بازکردن پرونده<ChevronLeft size={16} /></button><button className="pro-archive-action" aria-label={r.archived_at?'بازگرداندن پرونده':'بایگانی پرونده'} disabled={busy||!access?.can_write} onClick={()=>void archiveRow(r)}>{r.archived_at?<ArchiveRestore size={16}/>:<Archive size={16}/>}</button></div>
            </li>
          ))}
      </ul>
      <div className="pro-actions pro-pagination"><button disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>صفحه قبل</button><span>صفحه {(page+1).toLocaleString('fa-IR')} · {total.toLocaleString('fa-IR')} پرونده</span><button disabled={busy||(page+1)*25>=total} onClick={()=>setPage(p=>p+1)}>صفحه بعد</button></div>
    </section>
  );
}
function RealCaseDetail({
  org,
  initialId,
  onBack,
}: {
  org: string;
  initialId: string | null;
  onBack: () => void;
}) {
  const [authoredOpen,setAuthoredOpen]=useState(false),[authoredBusy,setAuthoredBusy]=useState(false),[authoredSeed,setAuthoredSeed]=useState<AuthoredContent|undefined>();
  const [trainingOpen,setTrainingOpen]=useState(false),[trainingBusy,setTrainingBusy]=useState(false);
  const [previewOpen,setPreviewOpen]=useState(false),[scanOpen,setScanOpen]=useState(false),[scanBusy,setScanBusy]=useState(false);
  const [archived,setArchived]=useState(false),[duplicates,setDuplicates]=useState<{id:string;display_name:string}[]>([]);
  const [id, setId] = useState(initialId),
    [revision, setRevision] = useState(0),
    [form, setForm] = useState<RealIntake>(emptyRealIntake),
    [saved, setSaved] = useState(""),
    [history, setHistory] = useState<RealRevision[]>([]),
    [plans, setPlans] = useState<SavedRealPlan[]>([]),
    [plan, setPlan] = useState<PrintedPlan | null>(null),
    [planId, setPlanId] = useState(""),
    [draftId, setDraftId] = useState(""),
    [connectionWarning, setConnectionWarning] = useState(false),
    [count, setCount] = useState(4),
    [date, setDate] = useState(today),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [locked, setLocked] = useState(false),
    [stale, setStale] = useState(false),
    [access,setAccess] = useState<WorkspaceStatus|null>(null),
    [historyPage,setHistoryPage] = useState(0),[historyTotal,setHistoryTotal] = useState(0),
    [plansPage,setPlansPage] = useState(0),[plansTotal,setPlansTotal] = useState(0);
  const pending = useRef(false),
    mounted = useRef(true),
    saveRequest = useRef<{
      answers: RealIntake;
      expected: number;
      key: string;
    } | null>(null),
    planKey = useRef(crypto.randomUUID()),
    generationKey = useRef(crypto.randomUUID());
  const dirty = !saved || JSON.stringify(form) !== saved;
  const hydrate = useCallback(
    async (record: string) => {
      const [c, h, p, status] = await Promise.all([
        realCaseApi.get(org, record),
        realCaseApi.history(org, record),
        realCaseApi.plans(org, record),
        realCaseApi.status(org),
      ]);
      if (!mounted.current) return;
      setId(c.id);setArchived(Boolean(c.archived_at));
      setRevision(c.revision);
      setForm(c.answers);
      setSaved(JSON.stringify(c.answers));
      setHistory(h.rows);setHistoryTotal(h.total);setHistoryPage(0);
      setPlans(p.rows);setPlansTotal(p.total);setPlansPage(0);setAccess(status);
      setLocked(false);
      setConnectionWarning(false);
      setStale(false);
      saveRequest.current = null;
    },
    [org],
  );
  useEffect(() => {
    mounted.current = true;
    if (!initialId) void realCaseApi.status(org).then(x=>{if(mounted.current)setAccess(x);}).catch(e=>{if(mounted.current)setError(message(e));});
    if (initialId) {
      setBusy(true);
      void hydrate(initialId)
        .catch((e) => {
          if (mounted.current) {
            setLocked(true);
            setError(message(e));
          }
        })
        .finally(() => {
          if (mounted.current) setBusy(false);
        });
    }
    return () => {
      mounted.current = false;
    };
  }, [initialId, hydrate]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    const check = async () => {
      if (pending.current || document.hidden) return;
      try {
        const [c,status] = await Promise.all([realCaseApi.get(org,id),realCaseApi.status(org)]);
        if (active) {
          setAccess(status);setArchived(Boolean(c.archived_at));
          setConnectionWarning(false);
          if (c.revision !== revision) setStale(true);
        }
      } catch (e) {
        if (active && e instanceof Error && e.message === 'PRO_ACCESS_DENIED') {
          setLocked(true);setScanOpen(false);setPreviewOpen(false);setTrainingOpen(false);setAuthoredOpen(false);
          saveRequest.current = null;
          setDraftId('');
          setPlanId('');
          setForm(emptyRealIntake());
          setSaved("");
          setHistory([]);
          setPlans([]);
          setPlan(null);
          setError(message(e));
        } else if (active) {
          // Temporary transport/5xx failure is not evidence of revoked access.
          // Keep the in-memory form and pending idempotency keys intact.
          setConnectionWarning(true);
        }
      }
    };
    const visible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener("focus", check);
    const t = window.setInterval(() => void check(), 30000);
    return () => {
      active = false;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(t);
    };
  }, [id, org, revision]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function run(fn: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current) {
        setError(message(e));
        if (
          e instanceof Error &&
          /PRO_INVALID_INTAKE|PRO_STALE_REVISION|PRO_ACCESS_DENIED/.test(
            e.message,
          )
        )
          saveRequest.current = null;
        if (e instanceof Error && e.message.includes("PRO_STALE_REVISION"))
          setStale(true);
        if (e instanceof Error && /PRO_DRAFT_EXPIRED|PRO_GENERATION_LIMIT/.test(e.message)) {
          generationKey.current = crypto.randomUUID();
          setDraftId(''); setPlan(null); setPlanId('');
        }
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function save(allowDuplicate=false) {
    await run(async () => {
      if(!id&&!saveRequest.current&&form.phone.trim()&&!allowDuplicate){const matches=await realCaseApi.duplicates(org,form.phone);if(matches.length){setDuplicates(matches);return;}}
      const request = saveRequest.current ?? {
        answers: {
          ...structuredClone(form),
          display_name: form.display_name.trim(),
          phone: form.phone.trim(),
        },
        expected: revision,
        key: crypto.randomUUID(),
      };
      saveRequest.current = request;
      const result = await realCaseApi.save(
        org,
        id,
        request.expected,
        request.answers,
        request.key,
      );
      await hydrate(result.id);
      setPlan(null);
      setPlanId("");
      setDraftId('');
      generationKey.current = crypto.randomUUID();
      setNotice("اطلاعات پرونده ذخیره شد.");
    });
  }
  async function generate() {
    await run(async () => {
      if (dirty || !id || stale || connectionWarning || !access?.can_write || !access?.modules?.nutrition)
        throw new Error('ابتدا اطلاعات پرونده را ذخیره و اتصال را بررسی کنید.');
      const result = await realCaseApi.generatePlan(org, id, revision, count, date, notes, generationKey.current);
      setPlan(result.plan);setPreviewOpen(true);
      setDraftId(result.draft_id);
      generationKey.current = crypto.randomUUID();
      setPlanId("");
      planKey.current = crypto.randomUUID();
    });
  }
  async function savePlan() {
    await run(async () => {
      if (!plan || !id || !draftId || dirty || stale) return;
      const key = await realCaseApi.savePlan(
        org,
        id,
        revision,
        draftId,
        planKey.current,
      );
      setPlanId(key);
      const list=await realCaseApi.plans(org,id);setPlans(list.rows);setPlansTotal(list.total);setPlansPage(0);
      setNotice("برنامه ذخیره شد و برای خروجی PDF آماده است.");
    });
  }
  function invalidatePreview() {
    setPlan(null); setPlanId(''); setDraftId('');
    generationKey.current = crypto.randomUUID();
  }
  function back() {
    if (!dirty || window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟"))
      onBack();
  }
  return (
    <section className="pro-panel pro-record-workspace pro-detail" aria-busy={busy}>
      <div className="pro-toolbar pro-detail-heading">
        <div className="pro-detail-person"><span className="pro-avatar"><UserRound size={23} /></span><div>
          <h2>{id ? form.display_name || "پرونده مراجع" : "پرونده جدید"}</h2>
          <span className="pro-record-state">{id && <small>نسخه {revision.toLocaleString("fa-IR")}</small>}<span className={dirty ? 'is-unsaved' : 'is-saved'}>{dirty ? 'در حال تکمیل اطلاعات' : 'اطلاعات ذخیره شده'}</span></span>
        </div></div>
        <button className="pro-back" disabled={busy} onClick={back}>
          <ArrowRight size={17} /> فهرست مراجعان
        </button>
      </div>
      {id&&!locked&&<div className="pro-module-launcher" aria-label="ابزارهای پرونده">
        <button className="pro-module-card" disabled={busy} onClick={()=>document.getElementById('pro-plan-builder')?.scrollIntoView({behavior:'smooth',block:'start'})}><span className="pro-module-symbol"><Utensils size={22}/></span><span><strong>تغذیه مراجع</strong><small>{access?.modules?.nutrition?'پیش‌نویس، تدوین و خروجی':'مشاهده سوابق تغذیه'}</small></span><ArrowUpLeft size={18}/></button>
        <button className="pro-module-card" disabled={busy} onClick={()=>setTrainingOpen(true)} aria-label="برنامه تمرینی مراجع"><span className="pro-module-symbol"><Dumbbell size={22}/></span><span><strong>تمرین مراجع</strong><small>{access?.modules?.training?'جلسات، حرکات و برنامه اختصاصی':'مشاهده سوابق تمرین'}</small></span><ArrowUpLeft size={18}/></button>
        <button className="pro-module-card" disabled={busy} onClick={()=>setScanOpen(true)} aria-label="تحلیل تصویری بدن و گزارش‌ها"><span className="pro-module-symbol"><ScanLine size={22}/></span><span><strong>گزارش بدن</strong><small>عکس‌ها، ارزیابی و گزارش‌های ثبت‌شده</small></span><ArrowUpLeft size={18}/></button>
      </div>}
      {id&&authoredOpen&&<PanelModal title="تدوین اختصاصی برنامه غذایی" busy={authoredBusy} onClose={()=>setAuthoredOpen(false)}><AuthoredPlanEditor org={org} record={id} revision={revision} kind="nutrition" name={form.display_name} canWrite={Boolean(access?.can_write&&access?.modules?.nutrition)&&!archived&&!dirty&&!stale&&!connectionWarning} onBusy={setAuthoredBusy} seed={authoredSeed}/></PanelModal>}
      {id&&!locked&&trainingOpen&&<PanelModal title="برنامه تمرینی مراجع" busy={trainingBusy} onClose={()=>setTrainingOpen(false)}><TrainingPanel org={org} record={id} revision={revision} name={form.display_name} canWrite={Boolean(access?.can_write&&access?.modules?.training)&&!archived&&!dirty&&!stale&&!connectionWarning} onBusy={setTrainingBusy}/></PanelModal>}
      {id&&scanOpen&&<PanelModal title="تحلیل تصویری بدن" busy={scanBusy} onClose={()=>setScanOpen(false)}><BodyScanPanel org={org} record={id} revision={revision} canWrite={Boolean(access?.can_write)&&!archived&&!dirty&&!stale&&!connectionWarning} onBusy={setScanBusy}/></PanelModal>}
      <nav className="pro-case-path" aria-label="مسیر آماده‌سازی برنامه">
        <a href="#pro-intake-editor"><span>۱</span>اطلاعات مراجع</a>
        {id ? <a href="#pro-plan-builder"><span>۲</span>ساخت برنامه</a> : <span className="pro-path-inactive"><span>۲</span>ساخت برنامه</span>}
        {id ? <a href="#pro-saved-programs"><span>۳</span>برنامه‌ها و خروجی</a> : <span className="pro-path-inactive"><span>۳</span>برنامه‌ها و خروجی</span>}
      </nav>
      {error && !(previewOpen&&plan) && (
        <p role="alert" className="pro-error">
          {error}
        </p>
      )}
      {notice && !(previewOpen&&plan) && (
        <p role="status" className="pro-success">
          {notice}
        </p>
      )}
      {busy && <p role="status">در حال انجام…</p>}
      {connectionWarning && (
        <p role="status" className="pro-muted">
          اتصال موقتاً برقرار نیست؛ تغییرات شما حفظ شده‌اند. پس از اتصال، بررسی دوباره انجام می‌شود.
        </p>
      )}
      {stale && (
        <p className="pro-error">
          این پرونده در جای دیگری تغییر کرده است. آخرین نسخه را دریافت کنید.
        </p>
      )}
      {id && (stale || locked) && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await hydrate(id);
              setPlan(null);
              setPlanId("");
            })
          }
        >
          دریافت آخرین نسخه
        </button>
      )}
      {!locked && (
        <>
          <div id="pro-intake-editor" className="pro-intake-editor">
          <CaseIntakeForm
            value={form}
            disabled={busy || archived || Boolean(saveRequest.current) || !access?.can_write}
            onChange={(a) => {
              setForm({ ...form, ...a });
              setNotice("");
            }}
            identity={
              <>
                <label>
                  نام مراجع
                  <input
                    aria-label="نام مراجع"
                    maxLength={80}
                    autoComplete="off"
                    value={form.display_name}
                    onChange={(e) =>
                      setForm({ ...form, display_name: e.target.value })
                    }
                  />
                </label>
                <label>
                  شماره تماس (اختیاری)
                  <input
                    aria-label="شماره تماس"
                    dir="ltr"
                    type="tel"
                    maxLength={20}
                    value={form.phone}
                    onChange={(e) =>
                      (setDuplicates([]),setForm({
                        ...form,
                        phone: e.target.value
                          .replace(/[۰-۹]/g, (d) =>
                            String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
                          )
                          .replace(/[٠-٩]/g, (d) =>
                            String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
                          ),
                      }))
                    }
                  />
                </label>
              </>
            }
          />
          {archived&&<p role="status" className="pro-muted">این پرونده بایگانی شده است؛ مشاهده سوابق و PDFهای قبلی فعال است. برای ویرایش، از فهرست بایگانی بازگردانید.</p>}
          {duplicates.length>0&&<div className="pro-duplicate-notice" role="alert"><strong>با این شماره پرونده ثبت شده است.</strong><p>{duplicates.map(x=>x.display_name).join('، ')}</p><button disabled={busy} onClick={()=>void save(true)}>این مراجع جدید است؛ ادامه ثبت</button><button disabled={busy} onClick={()=>setDuplicates([])}>بازبینی اطلاعات</button></div>}
          <div className="pro-actions pro-save-bar">
            <button
              className="pro-primary"
              disabled={
                busy || archived ||
                stale ||
                !form.display_name.trim() ||
                !access?.can_write || !form.safety_confirmed
              }
              onClick={() => void save()}
            >
              <Save size={17} />{saveRequest.current ? "تلاش مجدد ذخیره" : "ذخیره اطلاعات پرونده"}
            </button>
            <span className="pro-save-status">{dirty ? <><span className="pro-unsaved-dot" />تغییرات ذخیره نشده</> : <><Check size={16} />آخرین تغییرات ذخیره شده‌اند</>}</span>
          </div>
          </div>
          {id && (
            <>
              <details className="pro-permissions">
                <summary>
                  تاریخچه اطلاعات ({historyTotal.toLocaleString("fa-IR")})
                </summary>
                {history.map((h) => (
                  <details key={h.revision}>
                    <summary>
                      نسخه {h.revision.toLocaleString("fa-IR")} ·{" "}
                      {new Date(h.recorded_at).toLocaleString("fa-IR")}
                    </summary>
                    <CaseIntakeForm
                      value={h.answers}
                      disabled
                      onChange={() => {}}
                      identity={
                        <label>
                          نام مراجع
                          <input value={h.answers.display_name} disabled />
                        </label>
                      }
                    />
                  </details>
                ))}
                <div className="pro-actions"><button disabled={busy||historyPage===0} onClick={()=>void run(async()=>{const r=await realCaseApi.history(org,id,historyPage-1);setHistory(r.rows);setHistoryPage(p=>p-1);})}>نسخه‌های جدیدتر</button><span>صفحه {(historyPage+1).toLocaleString('fa-IR')}</span><button disabled={busy||(historyPage+1)*10>=historyTotal} onClick={()=>void run(async()=>{const r=await realCaseApi.history(org,id,historyPage+1);setHistory(r.rows);setHistoryPage(p=>p+1);})}>نسخه‌های قدیمی‌تر</button></div>
              </details>
              {!access?.can_write && <p role="status" className="pro-muted">ساخت و ویرایش در این پنل فعلاً غیرفعال است؛ مشاهده سوابق و خروجی PDF فعال است.</p>}
              <section id="pro-plan-builder" className="pro-generation">
                <div className="pro-generation-choice"><div><h3>ابزار تدوین شما</h3><p className="pro-muted">با پیش‌نویس موتور شروع کنید یا برنامه را از ابتدا با نظر خودتان بچینید.</p></div><button disabled={busy||dirty||stale} onClick={()=>{setAuthoredSeed(undefined);setAuthoredOpen(true);}}><PenLine size={17}/> تدوین اختصاصی تغذیه و سوابق</button></div>
                {!access?.modules?.nutrition&&<p role="status" className="pro-muted">ماژول تغذیه در اشتراک فعلی فعال نیست؛ سوابق و PDFهای قبلی قابل مشاهده‌اند.</p>}
                <div className="pro-block-heading"><span className="pro-block-icon"><Sparkles size={22} /></span><div><small>قدم بعدی</small><h3>ساخت برنامه غذایی</h3></div></div>
                <p>
                  برنامه با موتور به‌تن تولید می‌شود. در PDF از هر وعده یک منو
                  انتخاب خواهد شد.
                </p>
                <div className="pro-form-grid">
                  <label>
                    تعداد منو برای هر وعده
                    <PanelSelect
                      aria-label="تعداد منو"
                      value={count}
                      disabled={busy}
                      onChange={(e) => { setCount(Number(e.target.value)); invalidatePreview(); }}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n.toLocaleString("fa-IR")}
                        </option>
                      ))}
                    </PanelSelect>
                  </label>
                  <label>
                    تاریخ برنامه
                    <input
                      aria-label="تاریخ برنامه"
                      dir="ltr"
                      type="date"
                      value={date}
                      disabled={busy}
                      onChange={(e) => { setDate(e.target.value); invalidatePreview(); }}
                    />
                  </label>
                </div>
                <label>
                  توضیحات برای مراجع
                  <textarea
                    maxLength={2000}
                    value={notes}
                    disabled={busy}
                    onChange={(e) => { setNotes(e.target.value); invalidatePreview(); }}
                  />
                </label>
                <button
                  className="pro-primary pro-generate-button"
                  disabled={
                    busy || archived ||
                    dirty ||
                    stale ||
                    !date || connectionWarning || !access?.can_write || !access?.modules?.nutrition
                  }
                  onClick={() => void generate()}
                >
                  <Sparkles size={18} /> تولید و پیش‌نمایش برنامه
                </button>
                {dirty && (
                  <p className="pro-muted">
                    قبل از تولید، پاسخ‌های ویرایش‌شده را ذخیره کنید.
                  </p>
                )}
                {plan && previewOpen && (
                  <>
                    <PanelModal title="برنامه غذایی مراجع" busy={busy} onClose={()=>setPreviewOpen(false)}>{error&&<p role="alert" className="pro-error">{error}</p>}{notice&&<p role="status" className="pro-success">{notice}</p>}{busy&&<p role="status">در حال انجام…</p>}<PlanPreview plan={plan} /><button disabled={busy||!access?.can_write||!access?.modules?.nutrition||dirty||stale} onClick={()=>{setAuthoredSeed({version:1,title:'برنامه غذایی اختصاصی',notes:plan.notes,reviewed:false,sections:plan.days.flatMap(d=>d.slots.map(slot=>({title:(d.workout?'روز تمرین · ':'روز استراحت · ')+slot.label,lines:slot.options.map((m,i)=>({name:'منو '+(i+1),details:m.components.map(c=>c.foodItem.name+' '+Math.round(c.grams)+' گرم').join(' + ')}))})))});setPreviewOpen(false);setAuthoredOpen(true);}}>ساخت نسخه اختصاصی از این برنامه</button>{planId&&id&&<ReportAttachment org={org} record={id} plan={planId} revision={plan.intake_revision} canWrite={Boolean(access?.can_write)&&!archived}/>}
                    <div className="pro-actions">
                      <button
                        disabled={busy || archived || Boolean(planId) || dirty || stale || !access?.can_write || !access?.modules?.nutrition}
                        onClick={() => void savePlan()}
                      >
                        {planId ? "برنامه ذخیره شده" : "ذخیره این برنامه"}
                      </button>
                      <button
                        disabled={busy || !planId}
                        onClick={() => void run(() => printPlanWithBody(plan,org,planId))}
                      >
                        خروجی PDF / چاپ
                      </button>
                    </div>
                    <p className="pro-muted">
                      در پنجره چاپ، مقصد «Save as PDF» را انتخاب کنید.
                    </p></PanelModal>
                  </>
                )}
                <div id="pro-saved-programs" className="pro-block-heading pro-saved-heading"><span className="pro-block-icon"><FileText size={21} /></span><div><small>آرشیو مراجع</small><h3>برنامه‌های ذخیره‌شده</h3></div></div>
                {!plans.length && <p>هنوز برنامه‌ای ذخیره نشده است.</p>}
                <ul className="pro-cases">
                  {plans.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>
                          {new Date(p.recorded_at).toLocaleString("fa-IR")}
                        </strong>
                        <small>
                          بر اساس نسخه{" "}
                          {p.intake_revision.toLocaleString("fa-IR")}
                        </small>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setPlan(p.plan);setPreviewOpen(true);
                          setPlanId(p.id);
                        }}
                      >
                        مشاهده برنامه
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="pro-actions"><button disabled={busy||plansPage===0} onClick={()=>void run(async()=>{const r=await realCaseApi.plans(org,id,plansPage-1);setPlans(r.rows);setPlansPage(p=>p-1);})}>برنامه‌های جدیدتر</button><span>صفحه {(plansPage+1).toLocaleString('fa-IR')} · {plansTotal.toLocaleString('fa-IR')} برنامه</span><button disabled={busy||(plansPage+1)*10>=plansTotal} onClick={()=>void run(async()=>{const r=await realCaseApi.plans(org,id,plansPage+1);setPlans(r.rows);setPlansPage(p=>p+1);})}>برنامه‌های قدیمی‌تر</button></div>
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}
