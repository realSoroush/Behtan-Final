import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, FileDown, Copy, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { rpc } from "./api";
import {
  type AuthoredContent,
  type AuthoredSnapshot,
  printAuthored,
} from "./authoredPlan";
const empty = (kind: string): AuthoredContent => ({
  version: 1,
  title:
    kind === "nutrition" ? "برنامه غذایی اختصاصی" : "برنامه تمرینی اختصاصی",
  notes: "",
  reviewed: false,
  sections: [
    {
      title: kind === "nutrition" ? "صبحانه" : "جلسه اول",
      lines: [{ name: "", details: "" }],
    },
  ],
});
export function AuthoredPlanEditor({
  org,
  record,
  revision,
  kind,
  name,
  canWrite,
  onBusy,
  seed,
}: {
  org: string;
  record: string;
  revision: number;
  kind: "nutrition" | "training";
  name: string;
  canWrite: boolean;
  onBusy: (b: boolean) => void;
  seed?: AuthoredContent;
}) {
  const [content, setContent] = useState<AuthoredContent>(() =>
      seed ? { ...structuredClone(seed), reviewed: false } : empty(kind),
    ),
    [rows, setRows] = useState<AuthoredSnapshot[]>([]),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState<AuthoredSnapshot | null>(null),
    [loaded, setLoaded] = useState(false);
  const request = useRef<{ key: string; content: AuthoredContent } | null>(
      null,
    ),
    pending = useRef(false),
    notify = useRef(onBusy);
  notify.current = onBusy;
  useEffect(() => () => notify.current(false), []);
  const message = (e: unknown) => {
    const s = e instanceof Error ? e.message : "";
    return s.includes("PRO_STALE_REVISION")
      ? "نسخه پرونده تغییر کرده است؛ اطلاعات را دوباره دریافت کنید."
      : s.includes("PRO_MODULE_DISABLED")
        ? "ساخت در این ماژول فعال نیست؛ سوابق همچنان در دسترس‌اند."
        : s.includes("PRO_SUBSCRIPTION_EXPIRED")
          ? "اعتبار ساخت و ویرایش پایان یافته؛ سوابق و PDF باز هستند."
          : s.includes("PRO_INVALID_PLAN")
            ? "عنوان، بخش‌ها و سطرهای برنامه را کامل کنید."
            : "عملیات کامل نشد؛ پاسخ‌ها حفظ شدند. دوباره تلاش کنید.";
  };
  async function load(p = page) {
    const { data, error } = await supabase
      .from("pro_authored_plans")
      .select("id,kind,content,intake_revision,recorded_at,display_name")
      .eq("organization_id", org)
      .eq("record_id", record)
      .eq("kind", kind)
      .order("recorded_at", { ascending: false })
      .order("id")
      .range(p * 10, p * 10 + 9)
      .abortSignal(AbortSignal.timeout(12000))
      .retry(false);
    if (error) throw new Error(error.message);
    setRows(data ?? []);
    setLoaded(true);
  }
  useEffect(() => {
    setLoaded(false);
    void load().catch((e) => setError(message(e)));
  }, [org, record, kind, page]);
  const mutate = (fn: (d: AuthoredContent) => void) => {
    setContent((c) => {
      const d = structuredClone(c);
      fn(d);
      d.reviewed = false;
      return d;
    });
    setSaved(null);
    setNotice("");
  };
  async function save() {
    if (pending.current || !canWrite) return;
    pending.current = true;
    setBusy(true);
    notify.current(true);
    setError("");
    try {
      const req = request.current ?? {
        key: crypto.randomUUID(),
        content: structuredClone(content),
      };
      request.current = req;
      const id = await rpc<string>("pro_save_authored_plan", {
        p_org: org,
        p_record: record,
        p_revision: revision,
        p_kind: kind,
        p_content: req.content,
        p_key: req.key,
      });
      setSaved({
        id,
        kind,
        content: req.content,
        display_name: name,
        intake_revision: revision,
        recorded_at: new Date().toISOString(),
      });
      request.current = null;
      setNotice("نسخهٔ تأییدشده ذخیره شد؛ برای تغییر، نسخهٔ جدید بسازید.");
      setPage(0);
      await load(0);
    } catch (e) {
      if (
        e instanceof Error &&
        /PRO_INVALID_PLAN|PRO_STALE_REVISION|PRO_MODULE_DISABLED/.test(
          e.message,
        )
      )
        request.current = null;
      setError(message(e));
    } finally {
      pending.current = false;
      setBusy(false);
      notify.current(false);
    }
  }
  const valid =
    content.title.trim() &&
    content.sections.length &&
    content.sections.every(
      (s) =>
        s.title.trim() && s.lines.length && s.lines.every((l) => l.name.trim()),
    );
  return (
    <section className="pro-authored-editor">
      <div className="pro-authored-heading">
        <div>
          <small>تدوین اختصاصی متخصص</small>
          <h3>برنامه را با صلاحدید خودتان بچینید.</h3>
        </div>
        <span>{kind === "nutrition" ? "تغذیه" : "تمرین"}</span>
      </div>
      <p className="pro-muted">
        تعداد بخش‌ها، جلسات و محتوای برنامه را خودتان تعیین کنید. این مسیر از
        قالب خودکار مستقل است؛ اعداد و دستورهای واردشده باید توسط شما بازبینی
        شوند.
      </p>
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
      {!canWrite && (
        <p role="status" className="pro-muted">
          مشاهده و دانلود سوابق فعال است؛ ساخت نسخهٔ جدید در این پنل فعلاً بسته
          است.
        </p>
      )}
      {canWrite && (
        <>
          <fieldset disabled={busy || Boolean(request.current)}>
            <label>
              عنوان برنامه
              <input
                aria-label="عنوان برنامه اختصاصی"
                value={content.title}
                maxLength={160}
                onChange={(e) =>
                  mutate((d) => {
                    d.title = e.target.value;
                  })
                }
              />
            </label>
            {content.sections.map((s, i) => (
              <section className="pro-authored-section" key={i}>
                <div className="pro-authored-section-head">
                  <label>
                    عنوان {kind === "nutrition" ? "وعده / بخش" : "جلسه / بخش"}
                    <input
                      aria-label={"عنوان بخش " + (i + 1)}
                      value={s.title}
                      maxLength={100}
                      onChange={(e) =>
                        mutate((d) => {
                          d.sections[i].title = e.target.value;
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={content.sections.length === 1}
                    aria-label={"حذف بخش " + (i + 1)}
                    onClick={() =>
                      mutate((d) => {
                        d.sections.splice(i, 1);
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {s.lines.map((l, j) => (
                  <div className="pro-authored-line" key={j}>
                    <label>
                      {kind === "training" ? "نام حرکت" : "منو / ماده غذایی"}
                      <input
                        aria-label={"نام سطر " + (i + 1) + "-" + (j + 1)}
                        value={l.name}
                        maxLength={300}
                        onChange={(e) =>
                          mutate((d) => {
                            d.sections[i].lines[j].name = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      {kind === "training"
                        ? "ست، تکرار، استراحت و توضیحات"
                        : "مقدار، واحد و توضیحات"}
                      <textarea
                        aria-label={"توضیحات سطر " + (i + 1) + "-" + (j + 1)}
                        value={l.details}
                        maxLength={2000}
                        rows={2}
                        onChange={(e) =>
                          mutate((d) => {
                            d.sections[i].lines[j].details = e.target.value;
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={s.lines.length === 1}
                      aria-label={"حذف سطر " + (i + 1) + "-" + (j + 1)}
                      onClick={() =>
                        mutate((d) => {
                          d.sections[i].lines.splice(j, 1);
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={s.lines.length >= 30}
                  onClick={() =>
                    mutate((d) => {
                      d.sections[i].lines.push({ name: "", details: "" });
                    })
                  }
                >
                  <Plus size={16} /> افزودن{" "}
                  {kind === "training" ? "حرکت" : "منو / ماده"}
                </button>
              </section>
            ))}
            <button
              type="button"
              disabled={content.sections.length >= 28}
              onClick={() =>
                mutate((d) => {
                  d.sections.push({
                    title: "",
                    lines: [{ name: "", details: "" }],
                  });
                })
              }
            >
              <Plus size={16} /> افزودن{" "}
              {kind === "training" ? "جلسه" : "وعده / بخش"}
            </button>
            <label className="pro-authored-notes">
              توضیحات برنامه
              <textarea
                value={content.notes}
                maxLength={4000}
                rows={3}
                onChange={(e) =>
                  mutate((d) => {
                    d.notes = e.target.value;
                  })
                }
              />
            </label>
            <label className="pro-authored-review">
              <input
                type="checkbox"
                aria-label="تأیید برنامه اختصاصی متخصص"
                checked={content.reviewed}
                onChange={(e) =>
                  setContent({ ...content, reviewed: e.target.checked })
                }
              />
              این نسخه و تناسب آن با شرایط مراجع را بازبینی و تأیید کردم.
            </label>
          </fieldset>
          <div className="pro-actions">
            <button
              className="pro-primary"
              disabled={busy || !valid || !content.reviewed || Boolean(saved)}
              onClick={() => void save()}
            >
              <Save size={17} />
              {request.current ? "تلاش مجدد ثبت نسخه" : "ثبت نسخهٔ تأییدشده"}
            </button>
            {saved && (
              <button
                onClick={() =>
                  void printAuthored(saved, name).catch((e) =>
                    setError(message(e)),
                  )
                }
              >
                <FileDown size={17} /> PDF نسخه ثبت‌شده
              </button>
            )}
          </div>
        </>
      )}
      <h3>سوابق برنامه‌های اختصاصی</h3>
      {loaded && !rows.length && (
        <p className="pro-muted">هنوز برنامهٔ اختصاصی ثبت نشده است.</p>
      )}
      {rows.map((p) => (
        <article className="pro-authored-snapshot" key={p.id}>
          <div>
            <strong>{p.content.title}</strong>
            <small>
              {new Date(p.recorded_at).toLocaleString("fa-IR")} · نسخه پرونده{" "}
              {p.intake_revision.toLocaleString("fa-IR")}
            </small>
          </div>
          <div className="pro-actions">
            {canWrite && (
              <button
                disabled={busy || Boolean(request.current)}
                onClick={() => {
                  setContent({
                    ...structuredClone(p.content),
                    reviewed: false,
                  });
                  setSaved(null);
                  setNotice(
                    "نسخهٔ جدید برای ویرایش آماده است؛ نسخهٔ قبلی تغییر نمی‌کند.",
                  );
                }}
              >
                <Copy size={16} /> ساخت نسخه جدید
              </button>
            )}
            <button
              onClick={() =>
                void printAuthored(p, name).catch((e) => setError(message(e)))
              }
            >
              <FileDown size={16} /> PDF
            </button>
          </div>
        </article>
      ))}
      <div className="pro-actions">
        <button
          disabled={page === 0 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          جدیدتر
        </button>
        <span>{(page + 1).toLocaleString("fa-IR")}</span>
        <button
          disabled={rows.length < 10 || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          قدیمی‌تر
        </button>
      </div>
    </section>
  );
}
