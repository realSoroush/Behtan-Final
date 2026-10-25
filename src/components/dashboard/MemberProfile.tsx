import {ProfileCompletion} from '@/member/ProfileCompletion';
import {BodyReview} from '@/member/BodyReview';
import {ExperienceCards} from '@/member/ExperienceCards';
import { useEffect, useState } from "react";
import { Activity, ChevronDown, ReceiptText, UserRound, ScanLine, Send, ChevronLeft, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { UserProfile } from "@/types";

const n = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("fa-IR");
const goals: Record<string, string> = {
  weight_loss: "کاهش وزن",
  weight_gain: "افزایش وزن",
  maintenance: "حفظ وزن",
};
const budgets: Record<string, string> = {
  economic: "اقتصادی",
  balanced: "متعادل",
  performance: "عملکردی",
};
const levels: Record<string, string> = {
  sedentary: "کم‌تحرک",
  lightly_active: "کمی فعال",
  moderate: "فعالیت متوسط",
  active: "پرتحرک",
};
const date = (s: string) => new Date(s).toLocaleDateString("fa-IR");
type EnteredProfile = Pick<
  UserProfile,
  | "weight"
  | "height"
  | "goal"
  | "activity_level"
  | "workout_days"
  | "protein_budget_preference"
>;
type Membership = {
  subscriptions: { plan_code: string; starts_at: string; expires_at: string }[];
  orders: {
    id: string;
    plan_name: string;
    price_toman: number;
    mode: string;
    verified_at: string;
    captured_at: string | null;
    profile: EnteredProfile | null;
  }[];
};
function ProfileFacts({ profile }: { profile: EnteredProfile }) {
  return (
    <dl className="account-facts">
      {[
        [`${n(profile.weight)} کیلو`, "وزن مبنای برنامه"],
        [`${n(profile.height)} سانت`, "قد"],
        [`${n(profile.workout_days)} روز`, "ورزش در هفته"],
      ].map(([value, label]) => (
        <div key={label}>
          <dt className="text-xs text-neutral-500 dark:text-neutral-400">
            {label}
          </dt>
          <dd className="mt-1.5 text-sm font-bold text-neutral-900 dark:text-neutral-100">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function MemberProfile({
  profile,
}: {
  profile: UserProfile;
  today: string;
}) {
  const [scan,setScan]=useState(false);
  const [history, setHistory] = useState<Membership | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setHistory(null);
    setError(false);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    void (async () => {
      try {
        const { data, error } = await supabase
          .rpc("my_membership_history")
          .abortSignal(controller.signal);
        if (active) {
          if (
            error ||
            !data ||
            !Array.isArray(data.subscriptions) ||
            !Array.isArray(data.orders)
          )
            throw error ?? new Error("Invalid history");
          setHistory(data as Membership);
        }
      } catch {
        if (active) setError(true);
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [profile.id, retry]);
  const active = history?.subscriptions.find(
    (s) =>
      Date.parse(s.starts_at) <= Date.now() &&
      Date.parse(s.expires_at) > Date.now(),
  );
  return (
    <div className="member-profile-page account-native">
      <section className="account-hero" aria-labelledby="member-profile-title">
        <div className="account-identity"><span className="account-avatar"><UserRound size={30} aria-hidden="true"/></span><div><p className="account-eyebrow">به‌تن، همراه تو</p><h1 id="member-profile-title" tabIndex={-1}>{profile.display_name?.trim() || 'حساب من'}</h1><p className="account-phone"><bdi>{profile.phone}</bdi></p></div></div>
        <div className="account-goal"><span><Sparkles size={16} aria-hidden="true"/>{goals[profile.goal ?? ''] ?? 'هدف ثبت نشده'}</span><small>{budgets[profile.protein_budget_preference ?? ''] ?? 'ترجیح ثبت نشده'}</small></div>
        <ProfileFacts profile={profile}/>
        <p className="account-activity"><Activity size={16} aria-hidden="true"/>{levels[profile.activity_level ?? ''] ?? 'تحرک ثبت نشده'}</p>
      </section>
      <nav className="account-services" aria-label="خدمات حساب">
        <a href="https://t.me/soroushkheradmand" target="_blank" rel="noopener noreferrer"><span className="account-service-icon"><Send size={21} aria-hidden="true"/></span><span><strong>پشتیبانی به‌تن</strong><small>در تلگرام همراهت هستیم</small></span><ChevronLeft size={18} aria-hidden="true"/></a>
        <button type="button" onClick={()=>setScan(true)}><span className="account-service-icon is-peach"><ScanLine size={23} aria-hidden="true"/></span><span><strong>تحلیل ترکیب بدن</strong><small>بررسی تصویری · هر ۵ روز یک‌بار</small></span><ChevronLeft size={18} aria-hidden="true"/></button>
      </nav>
      {scan && <BodyReview profile={profile} onClose={()=>setScan(false)}/>}
      <ProfileCompletion profile={profile}/>
      <section aria-labelledby="membership-title" className="account-membership">
        <div className="flex items-center gap-2 mb-3">
          <ReceiptText
            size={18}
            className="text-primary-600 dark:text-primary-400"
            aria-hidden="true"
          />
          <h2
            id="membership-title"
            className="font-bold text-neutral-900 dark:text-neutral-100"
          >
            اشتراک‌های من
          </h2>
        </div>
        {error ? (
          <p
            role="alert"
            className="text-sm text-neutral-600 dark:text-neutral-400"
          >
            سابقه دریافت نشد.
            <button
              className="min-h-11 px-3 underline"
              onClick={() => setRetry((v) => v + 1)}
            >
              تلاش دوباره
            </button>
          </p>
        ) : !history ? (
          <p role="status" className="text-sm text-neutral-500">
            در حال دریافت…
          </p>
        ) : (
          <>
            {active && (
              <p className="mb-3 text-sm text-primary-700 dark:text-primary-300">
                فعال تا {date(active.expires_at)}
              </p>
            )}
            {history.orders.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                هنوز پرداخت تأییدشده‌ای ثبت نشده.
              </p>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {history.orders.map((o) => (
                  <details key={o.id} className="group py-1">
                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm text-neutral-900 dark:text-neutral-100">
                      <span>
                        <strong className="block">
                          {o.plan_name}
                          {o.mode === "sandbox" ? " · آزمایشی" : ""}
                        </strong>
                        <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                          {date(o.verified_at)} ·{" "}
                          {o.price_toman === 0
                            ? "رایگان"
                            : `${n(o.price_toman)} تومان`}
                        </span>
                      </span>
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </summary>
                    <div className="pb-4 pt-2">
                      {o.profile ? (
                        <>
                          <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
                            اطلاعات زمان درخواست اشتراک ·{" "}
                            {goals[o.profile.goal ?? ""] ?? "—"}
                          </p>
                          <ProfileFacts profile={o.profile} />
                        </>
                      ) : (
                        <p className="text-xs leading-6 text-neutral-500 dark:text-neutral-400">
                          برای این پرداخت قدیمی، نسخهٔ اطلاعات آن زمان ذخیره
                          نشده است.
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      <ExperienceCards userId={profile.id}/>
    </div>
  );
}
