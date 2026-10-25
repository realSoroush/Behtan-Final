import {TrainingSetup,useTrainingDraft} from './TrainingSetup';
import { trainingError } from "../professional/training/api";
import { useEffect, useState } from "react";
import type { SubscriptionPlan, UserProfile } from "../types";
import type { TrainingPlan } from "../training/types";
import { WEEKDAYS } from "../training/engine";
import { ExerciseMedia } from "../training/ExerciseMedia";
import { memberRequest, memberRpc } from "./api";
import {
  paymentRequest,
  startCheckout,
  type BillingStatus,
} from "../lib/payments";
import { useSubscriptionPlans } from "../hooks/useSubscriptionPlans";
import { periodOffer } from "./offers";
import { track } from "./analytics";
import "../training/training.css";
export function MemberTraining(_props: { profile: UserProfile }) {
  const [access, setAccess] = useState<boolean | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [plan, setPlan] = useState<TrainingPlan | null>(null),
    [session, setSession] = useState(0),
    [week, setWeek] = useState(1),
    [offer, setOffer] = useState<SubscriptionPlan | null>(null);
  const { plans } = useSubscriptionPlans();
  const [input,setInput]=useTrainingDraft();
  useEffect(() => {
    let alive = true;
    track("training_view");
    memberRpc<{ training: boolean }>("member_entitlements")
      .then(async (a) => {
        if (!alive) return;
        setAccess(a.training);
        if (a.training) {
          const r = await memberRequest<{ plan: TrainingPlan } | null>(
            "training_history",
          );
          if (alive) {setPlan(r?.plan ?? null);if(r && 'needsPreparation' in r)setError('اشتراکت فعال است؛ اطلاعات تمرین را بررسی کن و بدون پرداخت دوباره برنامه را بساز.');if(r && 'outdated' in r)setError('اطلاعات پروفایل تغییر کرده است؛ پیش از تمرین، برنامه را دوباره بساز.');}
        }
      })
      .catch(() => {
        if (alive)
          setError("دریافت دسترسی تمرین انجام نشد. صفحه را دوباره باز کن.");
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (access !== false || !plans.length) return;
    let alive = true;
    void paymentRequest<BillingStatus>({ action: "status" })
      .then((status) => {
        const gold = plans.find((p) => p.code === "gold");
        if (!gold) return;
        const current = status.active;
        const days =
          current &&
          current.plan_code !== "trial" &&
          Math.ceil(
            (Date.parse(current.expires_at) - Date.parse(current.starts_at)) /
              86400000,
          ) <= 14
            ? 14
            : 30;
        const target = periodOffer(gold, days);
        const old = plans.find((p) => p.code === current?.plan_code);
        const credit =
          old && old.code !== "trial" ? periodOffer(old, days).priceToman : 0;
        if (alive)
          setOffer({
            ...target,
            priceToman: Math.max(0, target.priceToman - credit),
          });
      })
      .catch(() => {
        if (alive) setError("قیمت ارتقا دریافت نشد.");
      });
    return () => {
      alive = false;
    };
  }, [access, plans]);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await memberRequest<{ plan: TrainingPlan }>("training", {
        input,
      });
      setPlan(r.plan);
      setSession(0);
      setWeek(1);
      window.dispatchEvent(new Event("member-profile-changed"));
      track("training_generated");
    } catch (e) {
      setError(trainingError(e));
    } finally {
      setBusy(false);
    }
  };
  if (access === null && !error)
    return <p role="status">در حال دریافت برنامه تمرین…</p>;
  const active = plan?.weeks[week - 1].sessions[session];
  return (
    <section className="member-training member-surface space-y-5">
      <h1 className="text-xl font-bold">تمرین من</h1>
      {error && (
        <p role="alert" className="member-notice">
          {error}
        </p>
      )}
      {access === false ? (
        <>
          <p>
            این قابلیت برات غیرفعال هست، برای دریافت برنامه تمرینی برای خودت،
            اشتراک ات رو ارتقا بده.
          </p>
          <p className="member-muted">
            برای اشتراک تغذیه، مابه‌تفاوت قیمت دوره پرداخت می‌شود و تاریخ پایان
            حفظ می‌شود. آزمایشی با خرید دورهٔ کامل ارتقا می‌یابد.
          </p>
          <TrainingSetup input={input} setInput={setInput}/>
          <button
            className="member-primary"
            disabled={!offer || busy || !input.screening.confirmed}
            onClick={async () => {
              if (!offer) return;
              setBusy(true);
              try {
                await startCheckout(offer, true);
                const a = await memberRpc<{ training: boolean }>(
                  "member_entitlements",
                );
                setAccess(a.training);
              } catch (e) {
                setError(e instanceof Error ? e.message : "پرداخت شروع نشد.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {offer
              ? `ارتقا — ${offer.priceToman.toLocaleString("fa-IR")} تومان`
              : "دریافت قیمت…"}
          </button>
        </>
      ) : (
        access && (
          <>
            {plan && (
              <div className="member-period">
                {plan.weeks.map((w) => (
                  <button
                    key={w.week}
                    aria-pressed={week === w.week}
                    onClick={() => {
                      setWeek(w.week);
                      setSession(0);
                    }}
                  >
                    هفتهٔ {w.week.toLocaleString("fa-IR")}
                  </button>
                ))}
              </div>
            )}
            {active && (
              <>
                <div className="member-period">
                  {plan!.weeks[week - 1].sessions.map((s, i) => (
                    <button
                      key={s.day}
                      aria-pressed={session === i}
                      onClick={() => setSession(i)}
                    >
                      {WEEKDAYS[s.day]}
                    </button>
                  ))}
                </div>
                <h2>
                  {active.title} · حدود {active.estimated_minutes} دقیقه
                </h2>
                {active.lines.map((l) => (
                  <article key={l.exercise.id} className="member-chart-card">
                    <h3>{l.exercise.name}</h3>
                    <p>
                      {l.sets} ست · {l.reps[0]} تا {l.reps[1]} تکرار · استراحت{" "}
                      {l.rest_seconds} ثانیه
                    </p>
                    <ExerciseMedia exercise={l.exercise} />
                  </article>
                ))}
                <p className="member-muted">{plan!.notes.join(" ")}</p>
              </>
            )}
            <details open={!plan}>
              <summary className="member-secondary">
                {plan ? "ساخت دوباره با امکانات جدید" : "آماده‌سازی برنامهٔ من"}
              </summary>
              <TrainingSetup input={input} setInput={setInput}/>
                <button
                  className="member-primary"
                  disabled={busy || !input.screening.confirmed}
                  onClick={() => void submit()}
                >
                  {busy ? "در حال ساخت…" : "برنامه تمرینم را بساز"}
                </button>
            </details>
          </>
        )
      )}
    </section>
  );
}
