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
import { printSavedPlan } from "./printPlan";
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
    [search, setSearch] = useState(""), [query,setQuery] = useState(''), [page,setPage] = useState(0),
    [total,setTotal] = useState(0), [access,setAccess] = useState<WorkspaceStatus|null>(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const [data,status] = await Promise.all([realCaseApi.list(org,query,page),realCaseApi.status(org)]);
      if (seq.current === n) {setRows(data.rows);setTotal(data.total);setAccess(status);}
    } catch (e) {
      if (seq.current === n) setError(message(e));
    } finally {
      if (seq.current === n) setBusy(false);
    }
  }, [org,query,page]);
  useEffect(() => {
    void load();
    return () => {
      seq.current++;
    };
  }, [load]);
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
    <section className="pro-panel pro-record-workspace">
      <div className="pro-toolbar">
        <h2>مراجعان و برنامه‌ها</h2>
        <div className="pro-actions">
          <button disabled={busy} onClick={() => void load()}>
            دریافت مجدد
          </button>
          <button className="pro-primary" disabled={busy||!access?.can_write||(access.case_limit!==null&&access.case_count>=access.case_limit)} onClick={() => setSelected("new")}>
            پرونده جدید
          </button>
        </div>
      </div>
      {access && <p className="pro-muted">{access.can_write ? 'دسترسی ساخت برنامه فعال است' : 'اعتبار ساخت برنامه پایان یافته؛ سوابق و PDF همچنان در دسترس‌اند.'} · {access.case_count.toLocaleString('fa-IR')} پرونده{access.case_limit !== null ? ' از '+access.case_limit.toLocaleString('fa-IR') : ''}{access.expires_at ? ' · تا '+new Date(access.expires_at).toLocaleDateString('fa-IR') : ''}</p>}
      <form className="pro-toolbar" onSubmit={e=>{e.preventDefault();setPage(0);setQuery(search.trim().replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/^\+/, '').replace(/^0(?=9\d{9}$)/,'98'));}}>
        <label>جست‌وجوی نام یا شماره<input aria-label="جست‌وجوی پرونده" type="search" value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/></label>
        <button disabled={busy}>جستجو</button>
      </form>
      {error && (
        <p role="alert" className="pro-error">
          {error}
        </p>
      )}
      {busy && <p role="status">در حال دریافت پرونده‌ها…</p>}
      {!busy && !error && !rows.length && (
        <p className="pro-empty">اولین مراجع را با «پرونده جدید» ثبت کنید.</p>
      )}
      <ul className="pro-cases">
        {rows.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.display_name}</strong>
                <span dir="ltr">{r.phone}</span>
                <small>نسخه {r.revision.toLocaleString("fa-IR")}</small>
              </div>
              <button onClick={() => setSelected(r.id)}>بازکردن پرونده</button>
            </li>
          ))}
      </ul>
      <div className="pro-actions"><button disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>صفحه قبل</button><span>صفحه {(page+1).toLocaleString('fa-IR')} · {total.toLocaleString('fa-IR')} پرونده</span><button disabled={busy||(page+1)*25>=total} onClick={()=>setPage(p=>p+1)}>صفحه بعد</button></div>
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
      setId(c.id);
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
          setAccess(status);
          setConnectionWarning(false);
          if (c.revision !== revision) setStale(true);
        }
      } catch (e) {
        if (active && e instanceof Error && e.message === 'PRO_ACCESS_DENIED') {
          setLocked(true);
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
  async function save() {
    await run(async () => {
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
      if (dirty || !id || stale || connectionWarning || !access?.can_write)
        throw new Error('ابتدا اطلاعات پرونده را ذخیره و اتصال را بررسی کنید.');
      const result = await realCaseApi.generatePlan(org, id, revision, count, date, notes, generationKey.current);
      setPlan(result.plan);
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
    <section className="pro-panel pro-record-workspace" aria-busy={busy}>
      <div className="pro-toolbar">
        <div>
          <h2>{id ? form.display_name || "پرونده مراجع" : "پرونده جدید"}</h2>
          {id && <small>نسخه {revision.toLocaleString("fa-IR")}</small>}
        </div>
        <button disabled={busy} onClick={back}>
          فهرست مراجعان
        </button>
      </div>
      {error && (
        <p role="alert" className="pro-error">
          {error}
        </p>
      )}
      {notice && (
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
          <CaseIntakeForm
            value={form}
            disabled={busy || Boolean(saveRequest.current) || !access?.can_write}
            onChange={(a) => {
              setForm({ ...form, ...a });
              setNotice("");
            }}
            identity={
              <>
                <label>
                  چه اسمی صدات کنیم؟
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
                      setForm({
                        ...form,
                        phone: e.target.value
                          .replace(/[۰-۹]/g, (d) =>
                            String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
                          )
                          .replace(/[٠-٩]/g, (d) =>
                            String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
                          ),
                      })
                    }
                  />
                </label>
              </>
            }
          />
          <div className="pro-actions">
            <button
              className="pro-primary"
              disabled={
                busy ||
                stale ||
                !form.display_name.trim() ||
                !access?.can_write || !form.safety_confirmed
              }
              onClick={() => void save()}
            >
              {saveRequest.current ? "تلاش مجدد ذخیره" : "ذخیره اطلاعات پرونده"}
            </button>
            {dirty && <span>تغییرات ذخیره نشده</span>}
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
              {!access?.can_write && <p role="status" className="pro-muted">اعتبار ساخت و ویرایش برنامه پایان یافته است؛ مشاهده سوابق و خروجی PDF فعال است.</p>}
              <section className="pro-generation">
                <h3>ساخت برنامه غذایی</h3>
                <p>
                  برنامه با موتور به‌تن تولید می‌شود. در PDF از هر وعده یک منو
                  انتخاب خواهد شد.
                </p>
                <div className="pro-form-grid">
                  <label>
                    تعداد منو برای هر وعده
                    <select
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
                    </select>
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
                  className="pro-primary"
                  disabled={
                    busy ||
                    dirty ||
                    stale ||
                    !date || connectionWarning || !access?.can_write
                  }
                  onClick={() => void generate()}
                >
                  تولید و پیش‌نمایش برنامه
                </button>
                {dirty && (
                  <p className="pro-muted">
                    قبل از تولید، پاسخ‌های ویرایش‌شده را ذخیره کنید.
                  </p>
                )}
                {plan && (
                  <>
                    <PlanPreview plan={plan} />
                    <div className="pro-actions">
                      <button
                        disabled={busy || Boolean(planId) || dirty || stale || !access?.can_write}
                        onClick={() => void savePlan()}
                      >
                        {planId ? "برنامه ذخیره شده" : "ذخیره این برنامه"}
                      </button>
                      <button
                        disabled={busy || !planId}
                        onClick={() => void run(() => printSavedPlan(plan))}
                      >
                        خروجی PDF / چاپ
                      </button>
                    </div>
                    <p className="pro-muted">
                      در پنجره چاپ، مقصد «Save as PDF» را انتخاب کنید.
                    </p>
                  </>
                )}
                <h3>برنامه‌های ذخیره‌شده</h3>
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
                          setPlan(p.plan);
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
