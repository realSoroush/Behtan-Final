import {trainingLine} from '../studioModel';
import {AuthoredPlanEditor} from '../AuthoredPlanEditor';
import type {AuthoredContent} from '../authoredPlan';
import { useEffect, useRef, useState } from "react";
import {
  Dumbbell,
  CalendarDays,
  Clock3,
  Check,
  FileDown,
  RefreshCw,
  WandSparkles,
  SlidersHorizontal,
} from "lucide-react";
import { PanelSelect } from "@/components/ui/PanelSelect";
import { EQUIPMENT, WEEKDAYS } from "../../training/engine";
import type {
  Equipment,
  TrainingInput,
  TrainingSnapshot,
} from "../../training/types";
import { ExerciseMedia } from "../../training/ExerciseMedia";
import { printTraining } from "../../training/print";
import { trainingApi, trainingError } from "./api";
import "../../training/training.css";
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function initialTrainingInput(): TrainingInput {
  return {
    version: 1,
    location: "home",
    experience: "beginner",
    goal: "general",
    days: [],
    minutes: 45,
    equipment: [],
    start_date: localToday(),
    screening: {
      confirmed: false,
      symptoms: false,
      pain: false,
      restriction: false,
      recent_surgery: false,
    },
  };
}
export function TrainingPanel({
  org,
  record,
  revision,
  canWrite,
  onBusy,
  name,
  onDirty,
  onSaved,
}: {
  onDirty?: (value:boolean)=>void;
  onSaved?: () => void;
  name: string;
  org: string;
  record: string;
  revision: number;
  canWrite: boolean;
  onBusy: (v: boolean) => void;
}) {
  const [authoredBusy,setAuthoredBusy]=useState(false),[authoredDirty,setAuthoredDirty]=useState(false),[engineDirty,setEngineDirty]=useState(false);
  const dirtyNotify=useRef(onDirty);dirtyNotify.current=onDirty;
  const [mode,setMode]=useState<'engine'|'authored'>('authored'),[seed,setSeed]=useState<AuthoredContent|undefined>();
  useEffect(()=>{dirtyNotify.current?.(mode==='authored'?authoredDirty:engineDirty);},[mode,authoredDirty,engineDirty]);
  useEffect(()=>()=>dirtyNotify.current?.(false),[]);
  const [input, setInput] = useState<TrainingInput>(initialTrainingInput),
    [rows, setRows] = useState<TrainingSnapshot[]>([]),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [selected, setSelected] = useState<TrainingSnapshot | null>(null),
    [week, setWeek] = useState(1),
    [day, setDay] = useState(0),
    [openExercise, setOpenExercise] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [checked, setChecked] = useState(false);
  const previewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected)
      previewRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [selected?.id]);
  const pending = useRef(false),
    request = useRef(crypto.randomUUID()),
    alive = useRef(true),
    notify = useRef(onBusy);
  notify.current = onBusy;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      notify.current(false);
    };
  }, []);
  async function load(p = page) {
    const result = await trainingApi.history(org, record, p);
    if (alive.current) {
      setRows(result.rows);
      setTotal(result.total);
      setPage(p);
    }
    return result;
  }
  useEffect(() => {
    let active = true;
    trainingApi
      .history(org, record, 0)
      .then((r) => {
        if (active) {
          setRows(r.rows);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (active) setError(trainingError(e));
      });
    return () => {
      active = false;
    };
  }, [org, record]);
  async function run(fn: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    notify.current(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) {
        setError(trainingError(e));
        if (e instanceof Error && e.message.includes("PRO_ACCESS_DENIED")) {
          setSelected(null);
          setRows([]);
        }
      }
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        notify.current(false);
      }
    }
  }
  function change(p: Partial<TrainingInput>) {
    setEngineDirty(true);
    setInput((v) => ({ ...v, ...p }));
    request.current = crypto.randomUUID();
    setError("");
  }
  function view(r: TrainingSnapshot) {
    setSelected(r);
    setWeek(1);
    setDay(0);
    setOpenExercise(null);
    setChecked(false);
    setNotice("");
  }
  const session = selected?.plan.weeks[week - 1]?.sessions[day];
  const equipmentOptions = (Object.keys(EQUIPMENT) as Equipment[]).filter(
    (e) =>
      input.location === "gym" ||
      ["dumbbells", "long_band", "stable_platform"].includes(e),
  );
  const previewStale = selected && selected.intake_revision !== revision;
  if(mode==='authored')return <div className="training-panel"><div className="pro-module-tabs"><button disabled={authoredBusy} aria-pressed={false} onClick={()=>{if(!authoredDirty||window.confirm('با تغییر مسیر، ویرایش‌های ثبت‌نشدهٔ دستی بسته می‌شوند. ادامه می‌دهید؟'))setMode('engine');}}><WandSparkles size={17}/>تمرین‌دهی خودکار</button><button aria-pressed={true}><SlidersHorizontal size={17}/>تنظیم دستی برنامه تمرینی</button></div><AuthoredPlanEditor org={org} record={record} revision={revision} kind="training" name={name} canWrite={canWrite} onBusy={value=>{setAuthoredBusy(value);onBusy(value);}} onDirty={setAuthoredDirty} onSaved={onSaved} seed={seed}/></div>;
  return (
    <div className="training-panel" aria-busy={busy}>
      <div className="pro-module-tabs"><button aria-pressed={true}><WandSparkles size={17}/>تمرین‌دهی خودکار</button><button disabled={busy} onClick={()=>{if(engineDirty&&!window.confirm('تنظیمات ثبت‌نشده موتور بسته شوند؟'))return;setSeed(undefined);setMode('authored');}}><SlidersHorizontal size={17}/>تنظیم دستی برنامه تمرینی</button></div><div className="training-intro">
        <span className="training-badge">
          <Dumbbell size={16} /> تمرین، قدم‌به‌قدم
        </span>
        <h3>یک برنامه که بشود ادامه‌اش داد.</h3>
        <p>
          پیش‌نویس را با روزها، زمان و تجهیزات مراجع بسازید؛ یا از تدوین اختصاصی برای انتخاب آزاد جلسات و حرکات استفاده کنید.
        </p>
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
      {!canWrite && (
        <p role="status" className="pro-muted">
          ساخت و تأیید برنامه متوقف است؛ برنامه‌های قبلی و PDFهای تأییدشده قابل
          مشاهده و دانلود هستند.
        </p>
      )}
      <details className="training-builder" open={!selected}>
        <summary>تنظیم برنامه جدید</summary>
        <fieldset disabled={busy || !canWrite}>
          <div className="pro-form-grid">
            <label>
              محل تمرین
              <PanelSelect
                aria-label="محل تمرین"
                value={input.location}
                onChange={(e) => {
                  const location = e.target.value as TrainingInput["location"];
                  change({ location, equipment: [] });
                }}
              >
                <option value="home">خانه</option>
                <option value="gym">باشگاه</option>
              </PanelSelect>
            </label>
            <label>
              سابقه تمرین
              <PanelSelect
                aria-label="سابقه تمرین"
                value={input.experience}
                onChange={(e) =>
                  change({
                    experience: e.target.value as TrainingInput["experience"],
                  })
                }
              >
                <option value="beginner">تازه‌کار</option>
                <option value="returning">بازگشت بعد از وقفه</option>
                <option value="regular">تمرین منظم تفریحی</option>
              </PanelSelect>
            </label>
            <label>
              هدف تمرین
              <PanelSelect
                aria-label="هدف تمرین"
                value={input.goal}
                onChange={(e) =>
                  change({ goal: e.target.value as TrainingInput["goal"] })
                }
              >
                <option value="general">آمادگی عمومی و حفظ عضلات</option>
                <option value="muscle">تقویت و رشد عضلات</option>
              </PanelSelect>
            </label>
            <label>
              زمان هر جلسه
              <PanelSelect
                aria-label="زمان هر جلسه"
                value={input.minutes}
                onChange={(e) =>
                  change({ minutes: Number(e.target.value) })
                }
              >
                {[30,45,60,75,90,120].map(n=><option key={n} value={n}>{n.toLocaleString('fa-IR')} دقیقه</option>)}
              </PanelSelect>
            </label>
            <label>
              تاریخ شروع
              <input
                aria-label="تاریخ شروع تمرین"
                type="date"
                dir="ltr"
                value={input.start_date}
                onChange={(e) => change({ start_date: e.target.value })}
              />
            </label>
          </div>
          <h4>تجهیزاتی که واقعاً در دسترس‌اند</h4>
          <div className="training-choices">
            {equipmentOptions.map((e) => (
              <label key={e}>
                <input
                  type="checkbox"
                  checked={input.equipment.includes(e)}
                  onChange={(event) =>
                    change({
                      equipment: event.target.checked
                        ? [...input.equipment, e]
                        : input.equipment.filter((x) => x !== e),
                    })
                  }
                />
                {EQUIPMENT[e]}
              </label>
            ))}
          </div>
          <p className="pro-muted">
            برای حرکت کششی پشت، دمبل یا کش بلند لازم است؛ در باشگاه می‌توان
            دستگاه کششی را انتخاب کرد. انتخاب «باشگاه» به‌تنهایی به معنی وجود
            همه دستگاه‌ها نیست.
          </p>
          <h4>روزهای تمرین را انتخاب کنید</h4>
          <div className="training-days">
            {WEEKDAYS.map((name, i) => (
              <label
                key={i}
                className={input.days.includes(i) ? "is-selected" : ""}
              >
                <input
                  type="checkbox"
                  aria-label={"تمرین " + name}
                  checked={input.days.includes(i)}
                  onChange={(e) =>
                    change({
                      days: e.target.checked
                        ? [...input.days, i]
                        : input.days.filter((d) => d !== i),
                    })
                  }
                />
                {name}
              </label>
            ))}
          </div>
          <div className="training-screen">
            <h4>آمادگی تمرین</h4>
            <p>
              موارد مرتبط را ثبت کنید. برای نسخهٔ اختصاصی، ابزار تدوین متخصص در همین پنجره در دسترس است.
            </p>
            {(
              [
                [
                  "symptoms",
                  "درد قفسه سینه، غش/سرگیجه یا تنگی نفس غیرمعمول با فعالیت",
                ],
                ["pain", "درد یا آسیب فعلی که روی اجرای حرکت اثر می‌گذارد"],
                ["restriction", "محدودیت یا منع تمرین از طرف پزشک"],
                ["recent_surgery", "جراحی اخیر یا دوره نقاهت"],
              ] as const
            ).map(([k, text]) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={input.screening[k]}
                  onChange={(e) =>
                    change({
                      screening: {
                        ...input.screening,
                        [k]: e.target.checked,
                        confirmed: false,
                      },
                    })
                  }
                />
                {text}
              </label>
            ))}
            <label className="training-confirm">
              <input
                type="checkbox"
                aria-label="تأیید بررسی آمادگی تمرین"
                checked={input.screening.confirmed}
                onChange={(e) =>
                  change({
                    screening: {
                      ...input.screening,
                      confirmed: e.target.checked,
                    },
                  })
                }
              />
              پرسش‌ها را از مراجع پرسیدم؛ موارد انتخاب‌شده و اطلاعات سلامت
              پرونده به‌روز هستند.
            </label>
          </div>
          <button
            className="pro-primary"
            disabled={busy || !canWrite || !input.screening.confirmed || input.days.length===0}
            onClick={() =>
              void run(async () => {
                const result = await trainingApi.generate(
                  org,
                  record,
                  revision,
                  input,
                  request.current,
                );
                view({
                  ...result,
                  intake_revision: revision,
                  created_at: result.plan.created_at,
                  approved_at: null,
                });
                setEngineDirty(false);
                await load(0);
                setNotice(
                  "پیش‌نویس آماده است؛ حرکات و مقدار تمرین را قبل از تأیید بررسی کن.",
                );
              })
            }
          >
            <Dumbbell size={17} />
            ساخت پیش‌نویس تمرین
          </button>
        </fieldset>
      </details>
      {selected && (
        <section ref={previewRef} className="training-preview">
          <button disabled={busy||!canWrite} onClick={()=>{setSeed({version:1,title:'برنامه تمرینی اختصاصی',notes:selected.plan.notes.join('\n'),reviewed:false,sections:selected.plan.weeks.flatMap(w=>w.sessions.map(s=>({title:'هفته '+w.week+' · '+s.title,lines:s.lines.map(l=>{const line=trainingLine(l.exercise.name);line.training!.sets=l.sets;line.training!.reps=l.reps[0];line.training!.rest=l.rest_seconds;line.details='بازه تکرار پیشنهادی: '+l.reps.join(' تا ');return line;})})))});setMode('authored');}}>ساخت نسخه اختصاصی از این پیش‌نویس</button><div className="training-preview-head">
            <div>
              <small>
                {selected.approved_at ? "تأییدشده" : "پیش‌نویس برای بازبینی"}
              </small>
              <h3>{selected.plan.display_name}</h3>
            </div>
            <span>
              {selected.plan.input.location === "home" ? "خانه" : "باشگاه"} ·{" "}
              {selected.plan.input.days.length.toLocaleString("fa-IR")} جلسه
            </span>
          </div>
          {previewStale && (
            <p role="status" className="pro-muted">
              این برنامه از نسخه قدیمی اطلاعات پرونده است. سوابق تأییدشده قابل
              چاپ‌اند؛ برای تأیید برنامه جدید از اطلاعات به‌روز استفاده کن.
            </p>
          )}
          <div className="training-tabs" role="group" aria-label="هفته تمرین">
            {selected.plan.weeks.map((w) => (
              <button
                key={w.week}
                aria-pressed={week === w.week}
                onClick={() => {
                  setWeek(w.week);
                  setOpenExercise(null);
                }}
              >
                هفته {w.week.toLocaleString("fa-IR")}
              </button>
            ))}
          </div>
          <div className="training-tabs" role="group" aria-label="روز تمرین">
            {selected.plan.weeks[week - 1].sessions.map((s, i) => (
              <button
                key={s.day}
                aria-pressed={day === i}
                onClick={() => {
                  setDay(i);
                  setOpenExercise(null);
                }}
              >
                {WEEKDAYS[s.day]}
              </button>
            ))}
          </div>
          {session && (
            <>
              <div className="training-session-meta">
                <span>
                  <CalendarDays size={16} />
                  {session.title} ·{" "}
                  {new Date(session.date + "T12:00:00Z").toLocaleDateString(
                    "fa-IR",
                    { timeZone: "UTC" },
                  )}
                </span>
                <span>
                  <Clock3 size={16} />
                  حدود {session.estimated_minutes.toLocaleString("fa-IR")} دقیقه
                </span>
              </div>
              <ol className="training-moves">
                {session.lines.map((l, i) => (
                  <li key={l.exercise.id}>
                    <button
                      className="training-move-heading"
                      aria-expanded={openExercise === l.exercise.id}
                      onClick={() =>
                        setOpenExercise(
                          openExercise === l.exercise.id ? null : l.exercise.id,
                        )
                      }
                    >
                      <span className="training-number">
                        {(i + 1).toLocaleString("fa-IR")}
                      </span>
                      <span>
                        <strong>{l.exercise.name}</strong>
                        <small>
                          {l.sets.toLocaleString("fa-IR")} ست ·{" "}
                          {l.reps
                            .map((r) => r.toLocaleString("fa-IR"))
                            .join(" تا ")}{" "}
                          تکرار{l.per_side ? " هر سمت" : ""}
                        </small>
                      </span>
                      <span className="training-move-more">
                        {openExercise === l.exercise.id ? "بستن" : "آموزش"}
                      </span>
                    </button>
                    {openExercise === l.exercise.id && (
                      <div className="training-move-content">
                        <ExerciseMedia exercise={l.exercise} />
                        <div>
                          <p>
                            استراحت بین ست‌ها:{" "}
                            {l.rest_seconds.toLocaleString("fa-IR")} ثانیه
                          </p>
                          <p>
                            پایان هر ست: حدود {l.rir.toLocaleString("fa-IR")}{" "}
                            تکرار دیگر در توانت بماند.
                          </p>
                          <ul>
                            {l.exercise.cues.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          <details className="training-help">
            <summary>شروع، انتخاب وزنه و قدم بعدی</summary>
            {selected.plan.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </details>
          {!selected.approved_at && (
            <label className="training-confirm">
              <input
                type="checkbox"
                checked={checked}
                disabled={!canWrite || Boolean(previewStale) || busy}
                onChange={(e) => setChecked(e.target.checked)}
              />
              حرکات، تجهیزات، مقدار تمرین و وضعیت مراجع را بازبینی کردم.
            </label>
          )}
          <div className="pro-actions">
            {!selected.approved_at && (
              <button
                className="pro-primary"
                disabled={
                  busy || !canWrite || !checked || Boolean(previewStale)
                }
                onClick={() =>
                  void run(async () => {
                    await trainingApi.approve(org, selected.id);
                    const r = await load();
                    const updated = r.rows.find((x) => x.id === selected.id);
                    if (updated) setSelected(updated);
                    else
                      setSelected({
                        ...selected,
                        approved_at: new Date().toISOString(),
                      });
                    setNotice("برنامه تأیید شد؛ PDF آماده دریافت است.");
                  })
                }
              >
                <Check size={17} />
                تأیید نهایی برنامه تمرینی
              </button>
            )}
            <button
              disabled={busy || !selected.approved_at}
              onClick={() => void run(() => printTraining(selected.plan))}
            >
              <FileDown size={17} />
              PDF برنامه تمرینی
            </button>
          </div>
        </section>
      )}
      <section className="training-history">
        <div className="pro-toolbar">
          <h3>سوابق تمرین ({total.toLocaleString("fa-IR")})</h3>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await load();
              })
            }
          >
            <RefreshCw size={15} />
            دریافت مجدد سوابق
          </button>
        </div>
        {!rows.length && (
          <p className="pro-muted">
            اولین برنامه تمرینی این مراجع را همین‌جا بساز.
          </p>
        )}
        <ul className="pro-cases">
          {rows.map((r) => (
            <li key={r.id}>
              <div>
                <strong>
                  {new Date(r.created_at).toLocaleDateString("fa-IR")}
                </strong>
                <small>
                  {r.approved_at ? "تأییدشده" : "پیش‌نویس"} · نسخه اطلاعات{" "}
                  {r.intake_revision.toLocaleString("fa-IR")}
                </small>
              </div>
              <button disabled={busy} onClick={() => view(r)}>
                مشاهده تمرین
              </button>
            </li>
          ))}
        </ul>
        <div className="pro-actions">
          <button
            disabled={busy || page === 0}
            onClick={() =>
              void run(async () => {
                await load(page - 1);
              })
            }
          >
            جدیدتر
          </button>
          <span>صفحه {(page + 1).toLocaleString("fa-IR")}</span>
          <button
            disabled={busy || (page + 1) * 10 >= total}
            onClick={() =>
              void run(async () => {
                await load(page + 1);
              })
            }
          >
            قدیمی‌تر
          </button>
        </div>
      </section>
    </div>
  );
}
