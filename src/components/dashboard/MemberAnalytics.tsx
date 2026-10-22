import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { DailyMealPlan } from "@/types";
import { addPlanDays } from "@/utils/mealPresentation";
import {
  activityDays,
  activityTotals,
  activityBuckets,
  type ActivityDay,
} from "@/utils/memberActivity";
const n = (v: number) => Math.round(v).toLocaleString("fa-IR");
const label = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("fa-IR", {
    day: "numeric",
    month: "short",
  });
export function MemberAnalytics({
  userId,
  today,
  currentPlan,
}: {
  userId: string;
  today: string;
  currentPlan: DailyMealPlan | null;
}) {
  const [range, setRange] = useState(7),
    [retry, setRetry] = useState(0),
    [selection, setSelection] = useState(today);
  const key = `${userId}:${today}:${range}`;
  const [state, setState] = useState<{
    key: string;
    rows: ActivityDay[];
    error: boolean;
  }>({ key: "", rows: [], error: false });
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    void (async () => {
      try {
        const { data, error } = await supabase
          .rpc("member_meal_activity", {
            p_from: addPlanDays(today, 1 - range),
            p_to: today,
          })
          .abortSignal(controller.signal)
          .retry(false);
        if (alive)
          setState({
            key,
            rows: Array.isArray(data) ? data : [],
            error: Boolean(error) || !Array.isArray(data),
          });
      } catch {
        if (alive) setState({ key, rows: [], error: true });
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [userId, today, range, key, retry]);
  const loading = state.key !== key;
  const days = activityDays(
    loading ? [] : state.rows,
    today,
    range,
    currentPlan,
  );
  const totals = activityTotals(days);
  const buckets=activityBuckets(days,range===7?1:range===30?5:15);
  const max=Math.max(1,...buckets.map(d=>Math.max(d.kcal??0,d.target_kcal??0)));
  const selected=buckets.find(d=>selection>=d.from&&selection<=d.to)??buckets[buckets.length-1];
  return (
    <section className="member-analytics" aria-labelledby="analytics-title">
      <div className="member-section-heading">
        <div>
          <span className="member-eyebrow">قدم‌های ثبت‌شدهٔ تو</span>
          <h1 id="analytics-title">روند من</h1>
        </div>
        <span>
          {label(days[0].date)} تا {label(today)}
        </span>
      </div>
      <div className="member-period" aria-label="بازهٔ روند">
        {[
          { days: 7, label: "هفته" },
          { days: 30, label: "ماه" },
          { days: 90, label: "سه ماه" },
        ].map((r) => (
          <button
            type="button"
            key={r.days}
            aria-pressed={range === r.days}
            onClick={() => {
              setRange(r.days);
              setSelection(today);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p role="status" className="member-muted">
          در حال دریافت ثبت‌ها…
        </p>
      ) : state.error ? (
        <div role="alert" className="member-notice">
          دریافت روند وعده‌ها انجام نشد.
          <button type="button" onClick={() => setRetry((r) => r + 1)}>
            تلاش دوباره
          </button>
        </div>
      ) : (
        <>
          <div className="member-stat-grid">
            <div>
              <span>میانگین کالری ثبت‌شده</span>
              <strong>
                {totals.averageKcal === null ? "—" : n(totals.averageKcal)}
              </strong>
              <small>در {n(totals.recorded)} روز دارای ثبت</small>
            </div>
            <div>
              <span>روزهای با ثبت همهٔ وعده‌ها</span>
              <strong>{n(totals.completedDays)}</strong>
              <small>از {n(range)} روز این بازه</small>
            </div>
          </div>
          <article className="member-chart-card">
            <div className="member-section-heading">
              <h2>{range===7?"کالری ثبت‌شده":"میانگین کالری ثبت‌شده"}</h2>
              <span>
                {selected.kcal === null
                  ? "بدون ثبت"
                  : n(Number(selected.kcal)) + " کالری"}
              </span>
            </div>
            <div className="activity-legend" aria-label="راهنمای نمودار"><span><i/>کالری ثبت‌شده</span><span><b/>هدف</span></div>
            <div
              className="activity-bars"
              style={{
                gridTemplateColumns: `repeat(${buckets.length},minmax(0,1fr))`,
              }}
              dir="ltr"
            >
              {buckets.map((d) => (
                <button
                  type="button"
                  key={d.from}
                  aria-pressed={selected.from === d.from}
                  aria-label={`${label(d.from)}${d.from!==d.to?" تا "+label(d.to):""}، ${d.kcal===null?"بدون ثبت":n(d.kcal)+" کالری"}`}
                  onClick={() => setSelection(d.to)}
                >
                  <span className="activity-track">
                    {d.kcal !== null ? (
                      <i
                        style={{
                          height: `${Math.max(3, (Number(d.kcal) / max) * 100)}%`,
                        }}
                      />
                    ) : (
                      <em />
                    )}
                    {d.target_kcal !== null && (
                      <b
                        style={{
                          bottom: `${(Number(d.target_kcal) / max) * 100}%`,
                        }}
                      />
                    )}
                  </span>
                  <small>
                    {range === 7
                      ? new Date(d.from + "T12:00:00").toLocaleDateString(
                          "fa-IR",
                          { weekday: "narrow" },
                        )
                      : new Date(d.from + "T12:00:00").toLocaleDateString(
                          "fa-IR",
                          { day: "numeric" },
                        )}
                  </small>
                </button>
              ))}
            </div>
            <p className="member-chart-detail" aria-live="polite">
              {label(selected.from)}{selected.from!==selected.to?' تا '+label(selected.to):''} · {selected.recorded?n(selected.recorded)+' روز دارای ثبت':'بدون ثبت'}{selected.target_kcal!==null?' · '+(range===7?'هدف ':'میانگین هدف ')+n(selected.target_kcal)+' کالری':''}
            </p>
            <p className="member-muted">
              {range===7?'هر ستون یک روز است. خط کوتاه، هدف همان روز را نشان می‌دهد.':`هر ستون، میانگین روزهای دارای ثبت در یک بازهٔ ${range===30?'۵':'۱۵'}روزه است.`} روز بدون ثبت، صفر کالری محسوب نمی‌شود؛ ثبت ناقص هم مصرف کل روز نیست.
            </p>
          </article>
          <article className="member-chart-card">
            <h2>مواد مغذی ثبت‌شده در بازه</h2>
            <div className="member-macro-totals">
              {[
                { label: "پروتئین", v: totals.protein, c: "var(--macro-protein)" },
                { label: "کربوهیدرات", v: totals.carbs, c: "var(--macro-carbs)" },
                { label: "چربی", v: totals.fat, c: "var(--macro-fat)" },
              ].map((m) => (
                <div key={m.label}>
                  <i style={{ background: m.c }} />
                  <span>{m.label}</span>
                  <strong>
                    {totals.recorded ? n(m.v) : "—"}
                    <small> گرم</small>
                  </strong>
                </div>
              ))}
            </div>
          </article>
        </>
      )}
    </section>
  );
}
