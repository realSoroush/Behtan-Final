import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  Dumbbell,
  Utensils,
  ScanLine,
  Layers3,
  FileText,
  Users,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { APP_LOGO_PATH } from "@/constants/brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { PanelSelect } from "@/components/ui/PanelSelect";
import { DURATIONS, offerPrice, type ProOffer } from "@/professional/modules";
import "./professionals.css";
export function ProfessionalsPage() {
  const [offers, setOffers] = useState<ProOffer[]>([]),
    [months, setMonths] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    supabase
      .rpc("pro_offer_catalog")
      .abortSignal(AbortSignal.timeout(12000))
      .retry(false)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !Array.isArray(data)) setError(true);
        else setOffers(data);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [retry]);
  return (
    <div className="professionals-page" dir="rtl">
      <header className="professionals-header">
        <a href="/" className="professionals-logo">
          <img src={APP_LOGO_PATH} alt="" />
          <span>
            به‌تن <small>PROFESSIONAL</small>
          </span>
        </a>
        <nav>
          <a href="#pro-features">امکانات</a>
          <a href="#pro-pricing">تعرفه‌ها</a>
          <ThemeToggle />
          <a className="professionals-login" href="https://pro.behtan.fit">
            ورود به پنل <ArrowUpLeft size={16} />
          </a>
        </nav>
      </header>
      <main>
        <section className="professionals-hero">
          <div className="professionals-copy">
            <span className="professionals-eyebrow">
              <span /> فضای کار متخصصان
            </span>
            <h1>
              تخصص از شما.
              <br />
              <em>نظم و ابزار از به‌تن.</em>
            </h1>
            <p>
              پروندهٔ مراجع، برنامهٔ تغذیه و تمرین، و خروجی فارسی؛ کنار هم، در
              یک پنل که با شیوهٔ کار شما هماهنگ می‌شود.
            </p>
            <div className="professionals-hero-actions">
              <a className="professionals-primary" href="#pro-pricing">
                پنل مناسب کارم را ببینم <ArrowLeft size={18} />
              </a>
              <a href="https://pro.behtan.fit">
                ورود متخصصان <ArrowUpLeft size={17} />
              </a>
            </div>
            <small>
              تغذیه، تمرین یا هر دو؛ ابزار موردنیازتان را انتخاب کنید.
            </small>
          </div>
          <div
            className="professionals-board"
            aria-label="نمای شماتیک امکانات پنل"
          >
            <div className="professionals-board-top">
              <span>BEHTAN / PRO</span>
              <span className="professionals-dot">فضای کاری شما</span>
            </div>
            <div className="professionals-board-heading">
              <Users size={26} />
              <div>
                <small>هر مراجع، یک مسیر مشخص</small>
                <strong>از پرونده تا برنامه</strong>
              </div>
            </div>
            <div className="professionals-flow">
              <div>
                <span>۰۱</span>
                <div>
                  <strong>شناخت مراجع</strong>
                  <small>اطلاعات، ترجیحات و سوابق</small>
                </div>
                <Check size={17} />
              </div>
              <div>
                <span>۰۲</span>
                <div>
                  <strong>تدوین و بازبینی</strong>
                  <small>پیش‌نویس موتور یا برنامهٔ اختصاصی شما</small>
                </div>
                <Layers3 size={18} />
              </div>
              <div>
                <span>۰۳</span>
                <div>
                  <strong>خروجی آمادهٔ ارائه</strong>
                  <small>PDF فارسی و نسخه‌های ذخیره‌شده</small>
                </div>
                <FileText size={18} />
              </div>
            </div>
            <div className="professionals-board-bottom">
              <span>
                <Utensils size={17} /> تغذیه
              </span>
              <span>
                <Dumbbell size={17} /> تمرین
              </span>
              <span>
                <ScanLine size={17} /> گزارش بدن
              </span>
            </div>
          </div>
        </section>
        <section id="pro-features" className="professionals-features">
          <div>
            <span className="professionals-eyebrow">
              کمتر درگیر ابزار، بیشتر کنار مراجع
            </span>
            <h2>
              همان جریان کار شما،
              <br />
              مرتب‌تر و قابل‌پیگیری‌تر.
            </h2>
          </div>
          <div className="professionals-feature-grid">
            {[
              {
                icon: Users,
                title: "پروندهٔ یکپارچه",
                text: "اطلاعات مراجع را ثبت و اصلاح کنید؛ نسخه‌های قبلی و برنامه‌ها در سوابق باقی می‌مانند.",
              },
              {
                icon: Layers3,
                title: "اختیار در تدوین",
                text: "از موتور برای پیش‌نویس کمک بگیرید یا برنامهٔ اختصاصی‌تان را تدوین و پس از بازبینی ثبت کنید.",
              },
              {
                icon: FileText,
                title: "خروجی فارسی",
                text: "برنامه را در قالب PDF ذخیره کنید و با همان ابزار همیشگی خودتان به مراجع تحویل دهید.",
              },
              {
                icon: ScanLine,
                title: "گزارش تصویری بدن",
                text: "بارگذاری عکس و گزارش‌های بدن در هر دو پنل در دسترس است؛ این ابزار، اندازه‌گیری سه‌بعدی پزشکی نیست.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={22} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="pro-pricing" className="professionals-pricing">
          <div className="professionals-pricing-heading">
            <div>
              <span className="professionals-eyebrow">
                به‌اندازهٔ نیاز کارتان
              </span>
              <h2>پنل شما. انتخاب شما.</h2>
              <p>همهٔ مبلغ‌ها به تومان و برای کل دورهٔ انتخابی هستند.</p>
            </div>
            <label className="professionals-period">
              مدت اشتراک
              <PanelSelect
                aria-label="مدت اشتراک متخصصین"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d.months} value={d.months}>
                    {d.label}
                  </option>
                ))}
              </PanelSelect>
            </label>
          </div>
          {loading && <p role="status">در حال دریافت تعرفه‌های به‌روز…</p>}
          {error && (
            <div className="professionals-error" role="alert">
              دریافت تعرفه‌ها انجام نشد؛ برای دیدن قیمت معتبر دوباره تلاش کنید.
              <button onClick={() => setRetry((x) => x + 1)}>
                <RefreshCw size={16} /> دریافت مجدد
              </button>
            </div>
          )}
          <div className="professionals-plans">
            {offers.map((o) => {
              const Icon =
                o.code === "nutrition"
                  ? Utensils
                  : o.code === "training"
                    ? Dumbbell
                    : Layers3;
              return (
                <article
                  key={o.code}
                  className={
                    "professionals-plan " +
                    (o.code === "combined" ? "is-combined" : "")
                  }
                >
                  <div className="professionals-plan-top">
                    <span className="professionals-plan-icon">
                      <Icon size={25} />
                    </span>
                    {o.code === "combined" && (
                      <span className="professionals-plan-badge">
                        دو سیستم، یک پنل
                      </span>
                    )}
                  </div>
                  <h3>{o.title}</h3>
                  <p>{o.subtitle}</p>
                  <div className="professionals-price" aria-live="polite">
                    <strong>
                      {offerPrice(o, months).toLocaleString("fa-IR")}
                    </strong>
                    <span>
                      تومان /{" "}
                      {DURATIONS.find((d) => d.months === months)?.label}
                    </span>
                  </div>
                  {months > 1 && (
                    <small className="professionals-monthly">
                      معادل ماهی{" "}
                      {Math.round(
                        offerPrice(o, months) / months,
                      ).toLocaleString("fa-IR")}{" "}
                      تومان
                    </small>
                  )}
                  <a
                    className="professionals-plan-cta"
                    href="https://pro.behtan.fit"
                  >
                    ورود به پنل متخصصان <ArrowLeft size={17} />
                  </a>
                  <ul>
                    {o.features.map((f) => (
                      <li key={f}>
                        <Check size={16} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <span className="professionals-plan-foot">
                    اسکن و گزارش بدن در این پنل موجود است.
                  </span>
                </article>
              );
            })}
          </div>
          {!loading && !error && !offers.length && (
            <p>تعرفه‌ای برای نمایش فعال نیست.</p>
          )}
          <p className="professionals-pricing-note">
            فعال‌سازی و تمدید فعلاً توسط مدیریت انجام می‌شود. پرداخت آنلاین
            اشتراک Pro هنوز فعال نیست.
          </p>
        </section>
        <section className="professionals-end">
          <span>یک فضای کاری برای کارِ دقیق‌تر.</span>
          <h2>وقتتان را برای مراجع نگه دارید.</h2>
          <a href="https://pro.behtan.fit">
            ورود به به‌تن Professional <ArrowUpLeft size={18} />
          </a>
        </section>
      </main>
      <footer className="professionals-footer">
        <a href="/">به‌تن برای کاربران</a>
        <span>Behtan Professional</span>
        <a href="https://pro.behtan.fit">پنل متخصصان</a>
      </footer>
    </div>
  );
}
