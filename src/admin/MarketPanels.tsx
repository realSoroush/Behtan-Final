import { PanelSelect } from '@/components/ui/PanelSelect';
import { useEffect, useState } from "react";
import { memberRpc } from "../member/api";
import { experienceLabels } from "../member/experienceLabels";
type EventRow = { event: string; events: number; users: number };
type Pulse = {
  events: EventRow[];
  daily: { date: string; active_users: number }[];
  payments: { successful: number; attempts: number; revenue: number; trials:number };
  payment_segments:{source:string;plan_code:string;duration_days:number;attempts:number;successful:number;revenue:number}[];
  retention: { day: number; eligible: number; returned: number }[];
  onboarding: { step: number; users: number }[];
};
const n = (x: number) => Number(x).toLocaleString("fa-IR");
const labels: Record<string, string> = {
  app_open: "بازگشت به اپ",
  onboarding_step: "مراحل آنبوردینگ",
  onboarding_complete: "تکمیل اطلاعات",
  paywall_view: "مشاهده اشتراک",
  preflight_ok: "برنامه آماده پرداخت",
  preflight_failed: "شکست آماده‌سازی",
  checkout_started: "شروع پرداخت",
  meal_recorded: "ثبت وعده",
  meal_skipped: "نخوردن وعده",
  progress_saved: "ثبت روند",
  training_view: "مشاهده تمرین",
  training_generated: "ساخت تمرین",
  food_manual: "ثبت دستی غذا",
};
export function BusinessPulse() {
  const [funnel, setFunnel] = useState<Record<string, number> | null>(null);
  const [days, setDays] = useState(30),
    [data, setData] = useState<Pulse | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    memberRpc<Record<string, number>>("admin_member_funnel", { p_days: days })
      .then((v) => {
        if (alive) setFunnel(v);
      })
      .catch(() => {
        if (alive) setFunnel(null);
      });
    memberRpc<Pulse>("admin_business_pulse", { p_days: days })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError("دریافت نبض بیزینس انجام نشد.");
      });
    return () => {
      alive = false;
    };
  }, [days]);
  return (
    <section className="admin-card space-y-5">
      <h2>نبض بیزینس</h2>
      <PanelSelect
        aria-label="بازه تحلیل"
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
      >
        {[7, 30, 90].map((d) => (
          <option key={d} value={d}>
            {n(d)} روز
          </option>
        ))}
      </PanelSelect>
      {error && <p role="alert">{error}</p>}
      {funnel && (
        <div>
          <h3>قیف حساب‌های تأییدشدهٔ جدید</h3>
          <p>
            یک کوهورت مشترک از شروع سنجش در بازهٔ انتخابی؛ مراحل از پروفایل، پیش‌بررسی و سفارش‌های سمت سرور محاسبه می‌شوند؛ ترتیب رسیدن رویداد مرورگر روی خرید اثر ندارد. این گزارش پوشش مراحل یک گروه کاربر است، نه قیف زمانی بازدید ناشناس. این قیف مخصوص اپ تغذیه است و بازدید ناشناس یا خرید Pro را شامل نمی‌شود.
          </p>
          <div className="admin-stats">
            {Object.entries({
              registered: "عضویت تأییدشده",
              trial: "فعال‌سازی رایگان (جدا از خرید)",
              onboarded: "تکمیل اطلاعات",
              preflight: "برنامه آماده",
              checkout: "سفارش واقعی",
              paid: "خریدار واقعی",
            }).map(([k, label]) => (
              <div key={k} className="admin-card">
                <span>{label}</span>
                <strong>{n(funnel[k] ?? 0)}</strong>
              </div>
            ))}
          </div>
          <p>
            تبدیل به خرید:{" "}
            {funnel.registered
              ? n(Math.round(((funnel.paid ?? 0) / funnel.registered) * 100)) +
                "٪"
              : "داده کافی نیست"}
          </p>
        </div>
      )}
      {data?.payment_segments?.length ? <div className="admin-table"><h3>پرداخت به تفکیک محصول و دوره</h3><table><thead><tr><th>محصول</th><th>پلن</th><th>روز</th><th>سفارش پولی</th><th>موفق</th><th>درآمد، تومان</th></tr></thead><tbody>{data.payment_segments.map(r=><tr key={r.source+r.plan_code+r.duration_days}><td>{r.source==='pro'?'Pro':'اپ'}</td><td>{r.plan_code}</td><td>{n(r.duration_days)}</td><td>{n(r.attempts)}</td><td>{n(r.successful)}</td><td>{n(r.revenue)}</td></tr>)}</tbody></table></div>:null}
      {data && (
        <>
          <div className="admin-stats">
            {[
              ["درآمد واقعی، تومان", data.payments.revenue],
              ["پرداخت موفق با مبلغ مثبت", data.payments.successful],
              ["فعال‌سازی رایگان", data.payments.trials],
              [
                "نرخ موفقیت سفارش",
                data.payments.attempts
                  ? Math.round(
                      (data.payments.successful / data.payments.attempts) * 100,
                    )
                  : 0,
              ],
            ].map(([k, v]) => (
              <div className="admin-card" key={k}>
                <span>{k}</span>
                <strong>
                  {n(Number(v))}
                  {String(k).includes("نرخ") ? "٪" : ""}
                </strong>
              </div>
            ))}
          </div>
          <p>
            تراکنش‌ها از دیتابیس پرداخت‌اند؛ رویدادهای مرورگر شاخص تعامل‌اند و
            منبع تأیید خرید نیستند. آمار گذشتهٔ قبل از نصب ابزار ساخته نمی‌شود.
          </p>
          <h3>رویدادهای مسیر کاربر</h3>
          <table>
            <thead>
              <tr>
                <th>رویداد</th>
                <th>کاربران یکتا</th>
                <th>تعداد</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.event}>
                  <td>{labels[e.event] ?? e.event}</td>
                  <td>{n(e.users)}</td>
                  <td>{n(e.events)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>ماندگاری روز دقیق پس از عضویت · کوهورت ۹۰روزه از شروع سنجش</h3>
          <table>
            <thead>
              <tr>
                <th>روز</th>
                <th>واجد مشاهده</th>
                <th>برگشته</th>
                <th>نرخ</th>
              </tr>
            </thead>
            <tbody>
              {data.retention.map((r) => (
                <tr key={r.day}>
                  <td>{n(r.day)}</td>
                  <td>{n(r.eligible)}</td>
                  <td>{n(r.returned)}</td>
                  <td>
                    {r.eligible
                      ? n(Math.round((r.returned / r.eligible) * 100)) + "٪"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>پیشروی آنبوردینگ</h3>
          {data.onboarding.map((r) => (
            <p key={r.step}>
              مرحله {n(r.step)} · {n(r.users)} کاربر
            </p>
          ))}
          <h3>کاربران فعال روزانه</h3>
          <div className="flex gap-1 items-end h-32">
            {data.daily.map((d) => (
              <div
                key={d.date}
                title={d.date + " · " + n(d.active_users)}
                style={{
                  height:
                    Math.max(
                      4,
                      (d.active_users /
                        Math.max(1, ...data.daily.map((x) => x.active_users))) *
                        100,
                    ) + "%",
                  flex: 1,
                  background: "#258869",
                  borderRadius: 5,
                }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
interface Experience {
  id: string;
  created_at: string;
  phone: string;
  weight_kg: number | null;
  adherence: string;
  hunger: string;
  difficulty: string;
}
export function UserExperiences() {
  const [page, setPage] = useState(0),
    [rows, setRows] = useState<Experience[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    memberRpc<Experience[]>("admin_member_experiences", { p_page: page })
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) setError("دریافت تجربه‌ها انجام نشد.");
      });
    return () => {
      alive = false;
    };
  }, [page]);
  return (
    <section className="admin-card">
      <h2>تجربیات کاربران</h2>
      {error && <p role="alert">{error}</p>}
      <div className="admin-table">
        <table>
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>کاربر</th>
              <th>وزن</th>
              <th>اجرای برنامه</th>
              <th>گرسنگی</th>
              <th>مانع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString("fa-IR")}</td>
                <td>
                  <bdi>{r.phone}</bdi>
                </td>
                <td>{r.weight_kg ?? "—"}</td>
                {[r.adherence, r.hunger, r.difficulty].map((x, i) => (
                  <td key={i}>{experienceLabels[x] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
        قبلی
      </button>
      <button disabled={rows.length < 50} onClick={() => setPage((p) => p + 1)}>
        بعدی
      </button>
    </section>
  );
}
