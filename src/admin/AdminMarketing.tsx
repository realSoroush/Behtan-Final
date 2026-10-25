import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
type Review = {
  id: string;
  author_name: string;
  author_role: string;
  quote: string;
  is_published: boolean;
  consent_confirmed: boolean;
  sort_order: number;
  revision: number;
};
const empty = (): Review => ({
  id: crypto.randomUUID(),
  author_name: "",
  author_role: "",
  quote: "",
  is_published: false,
  consent_confirmed: false,
  sort_order: 0,
  revision: 0,
});
export function AdminMarketing() {
  const [rows, setRows] = useState<Review[]>([]),
    [edit, setEdit] = useState<Review | null>(null),
    [video, setVideo] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const explain = (e: unknown) =>
    e instanceof Error && e.message === "STALE"
      ? "این مورد هم‌زمان تغییر کرده؛ دوباره دریافت کنید."
      : "عملیات انجام نشد. دسترسی مدیر، اتصال و اجرای مایگریشن محتوای سایت را بررسی کنید.";
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [s, r] = await Promise.all([
        supabase
          .from("marketing_settings")
          .select("*")
          .eq("id", true)
          .abortSignal(AbortSignal.timeout(10000))
          .single(),
        supabase
          .from("marketing_testimonials")
          .select("*")
          .order("sort_order")
          .order("id")
          .abortSignal(AbortSignal.timeout(10000)),
      ]);
      if (s.error || r.error) throw s.error || r.error;
      setVideo(s.data.video_url);
      setRevision(s.data.revision);
      setRows(r.data);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function saveVideo() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error } = await supabase
        .from("marketing_settings")
        .update({ video_url: video.trim() })
        .eq("id", true)
        .eq("revision", revision)
        .select("revision")
        .abortSignal(AbortSignal.timeout(10000))
        .single();
      if (error || !data) throw Error("STALE");
      setRevision(data.revision);
      setNotice(
        "ویدئو ذخیره شد؛ صفحهٔ سایت حداکثر تا ۱۵ ثانیه بازخوانی می‌شود.",
      );
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveReview() {
    if (!edit) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { revision: rev, ...payload } = edit;
      const q = rev
        ? supabase
            .from("marketing_testimonials")
            .update(payload)
            .eq("id", edit.id)
            .eq("revision", rev)
        : supabase.from("marketing_testimonials").insert(payload);
      const { data, error } = await q
        .select("*")
        .abortSignal(AbortSignal.timeout(10000))
        .single();
      if (error || !data) throw error || Error("STALE");
      setRows((x) =>
        [...x.filter((r) => r.id !== data.id), data].sort(
          (a, b) => a.sort_order - b.sort_order,
        ),
      );
      setEdit(null);
      setNotice(
        "نظر ذخیره شد. فقط نظر دارای رضایت و وضعیت انتشار در سایت دیده می‌شود.",
      );
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card admin-marketing">
      <header className="admin-tools">
        <h3>محتوای وب‌سایت به‌تن</h3>
        <a
          href="https://behtan.fit/site.html#pro"
          target="_blank"
          rel="noopener noreferrer"
        >
          مشاهده سایت پس از انتشار
        </a>
        <button disabled={busy} onClick={() => void load()}>
          دریافت دوباره
        </button>
      </header>
      <p>
        قیمت‌های پرو از «تعرفه‌های پنل متخصصین» و قیمت‌های اپ از اشتراک‌های فعلی
        خوانده می‌شوند. این بخش قیمت یا مجوز اشتراک را تغییر نمی‌دهد.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveVideo();
        }}
      >
        <label>
          لینک HTTPS ویدئوی معرفی پنل
          <input
            type="url"
            value={video}
            maxLength={2048}
            onChange={(e) => setVideo(e.target.value)}
            placeholder="https://…"
            dir="ltr"
          />
        </label>
        <p>
          لینک مستقیم فایل قابل پخش را وارد کنید، نه لینک صفحهٔ یوتیوب. خالی
          گذاشتن، ویدئو را از سایت حذف می‌کند. این فرم فایل آپلود نمی‌کند.
        </p>
        <button disabled={busy || !revision}>ذخیره ویدئو</button>
      </form>
      <h4>تجربه‌های واقعی متخصصان</h4>
      <p>
        قبل از انتشار، رضایت فرد برای نمایش نام و متن را دریافت کنید. شماره تماس
        یا اطلاعات شاگردان را اینجا ننویسید.
      </p>
      <button disabled={busy || !!edit} onClick={() => setEdit(empty())}>
        افزودن تجربهٔ واقعی
      </button>
      {edit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveReview();
          }}
        >
          <label>
            نام متخصص
            <input
              required
              maxLength={100}
              value={edit.author_name}
              onChange={(e) =>
                setEdit({ ...edit, author_name: e.target.value })
              }
            />
          </label>
          <label>
            حوزهٔ فعالیت
            <input
              maxLength={150}
              value={edit.author_role}
              onChange={(e) =>
                setEdit({ ...edit, author_role: e.target.value })
              }
            />
          </label>
          <label>
            متن تجربه
            <textarea
              required
              maxLength={2000}
              rows={4}
              value={edit.quote}
              onChange={(e) => setEdit({ ...edit, quote: e.target.value })}
            />
          </label>
          <label>
            ترتیب نمایش
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              value={edit.sort_order}
              onChange={(e) =>
                setEdit({ ...edit, sort_order: Number(e.target.value) })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={edit.consent_confirmed}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  consent_confirmed: e.target.checked,
                  is_published: e.target.checked && edit.is_published,
                })
              }
            />
            رضایت انتشار دریافت شده است
          </label>
          <label>
            <input
              type="checkbox"
              disabled={!edit.consent_confirmed}
              checked={edit.is_published}
              onChange={(e) =>
                setEdit({ ...edit, is_published: e.target.checked })
              }
            />
            در سایت منتشر شود
          </label>
          <div className="admin-tools">
            <button disabled={busy}>ذخیره</button>
            <button type="button" disabled={busy} onClick={() => setEdit(null)}>
              انصراف
            </button>
          </div>
        </form>
      )}
      {rows.map((r) => (
        <article className="admin-sub" key={r.id}>
          <strong>
            {r.author_name} · {r.is_published ? "منتشرشده" : "پیش‌نویس"}
          </strong>
          <p>{r.quote}</p>
          <button disabled={busy || !!edit} onClick={() => setEdit({ ...r })}>
            ویرایش / توقف انتشار
          </button>
        </article>
      ))}
    </section>
  );
}
