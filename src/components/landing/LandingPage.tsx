import { useEffect, useRef, useState, type CSSProperties } from "react";
import { APP_LOGO_PATH } from "@/constants/brand";
import { FlowWave } from "./FlowWave";
import {
  GoalPicker,
  LandingPlans,
  MealDemo,
  ProductDetails,
  type MealKey,
} from "./LandingSections";
import "./relay-landing.css";

const ENAMAD_HTML =
  "<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=7609793&Code=scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=7609793&Code=scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO' alt='' style='cursor:pointer' code='scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO'></a>";

interface LandingPageProps {
  onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [completed, setCompleted] = useState<Set<MealKey>>(() => new Set());
  const toggleMeal = (key: MealKey) =>
    setCompleted((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setPaused(media.matches);
    media.addEventListener("change", updateMotion);
    return () => media.removeEventListener("change", updateMotion);
  }, []);

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousColor = meta?.content;
    if (meta) meta.content = '#080b09';
    return () => { if (meta && previousColor !== undefined) meta.content = previousColor; };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.1 },
    );
    root.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    const updateScroll = () => {
      if (progressRef.current)
        progressRef.current.style.width = `${(window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)) * 100}%`;
    };
    window.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    root.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateScroll);
      root.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const previousScroll = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = paused
      ? "auto"
      : previousScroll;
    return () => {
      document.documentElement.style.scrollBehavior = previousScroll;
    };
  }, [paused]);

  useEffect(() => {
    const scene = rootRef.current?.querySelector<HTMLElement>(".hero-scene");
    const product =
      rootRef.current?.querySelector<HTMLElement>("#hero-product");
    if (!scene || !product || paused || !matchMedia("(pointer:fine)").matches)
      return;
    const tilt = (e: PointerEvent) => {
      const r = scene.getBoundingClientRect();
      product.style.transform = `rotateY(${((e.clientX - r.left) / r.width) * 10}deg) rotateX(${2 - ((e.clientY - r.top) / r.height - 0.5) * 6}deg) rotateZ(-1deg)`;
    };
    const reset = () => {
      product.style.transform = "";
    };
    scene.addEventListener("pointermove", tilt);
    scene.addEventListener("pointerleave", reset);
    return () => {
      scene.removeEventListener("pointermove", tilt);
      scene.removeEventListener("pointerleave", reset);
      reset();
    };
  }, [paused]);

  return (
    <div
      ref={rootRef}
      id="top"
      dir="rtl"
      className={"behtan-landing" + (paused ? " motion-paused" : "")}
    >
      <a className="skip-link" href="#landing-main">
        رفتن به محتوای اصلی
      </a>
      <div className="scroll-progress" ref={progressRef} aria-hidden="true" />
      <header className="top wrap">
        <nav className="nav" aria-label="ناوبری اصلی">
          <a className="brand" href="#">
            <img src={APP_LOGO_PATH} alt="" />
            به‌تن
          </a>
          <div
            className={"navlinks" + (menuOpen ? " open" : "")}
            onClick={() => setMenuOpen(false)}
            id="navlinks"
          >
            <a href="#how">چطور کار می‌کند؟</a>
            <a href="#your-day">نمونهٔ برنامه</a>
            <a href="#plans">اشتراک‌ها</a>
            <a href="/professionals">پنل متخصصین</a>
          </div>
          <div className="navend">
            <button type="button" className="login-link" onClick={onStart}>
              ورود به حساب
            </button>
            <a href="/professionals">پنل متخصصین ↗</a>
            <button type="button" className="btn primary" onClick={onStart}>
              شروع مسیر <span className="arrow">←</span>
            </button>
            <button
              type="button"
              className="menu"
              aria-label={menuOpen ? "بستن منو" : "بازکردن منو"}
              aria-expanded={menuOpen}
              aria-controls="navlinks"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              ☰
            </button>
          </div>
        </nav>
      </header>
      <FlowWave paused={paused} />
      <main id="landing-main">
        <div className="wrap">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <div className="eyebrow intro">
                برنامهٔ غذایی متناسب با هدف و شرایط تو
              </div>
              <h1 id="hero-title" className="intro second">
                حالِ بهتر،
                <br />
                از بشقاب تو<span>شروع می‌شود.</span>
              </h1>
              <p className="lead intro third">
                به‌تن با توجه به هدف، فعالیت و سلیقهٔ غذایی تو برنامه می‌سازد.
                وعده‌ها و مقدار غذا مشخص است؛ هر روز آن‌ها را دنبال کن و
                تغییراتت را ببین.
              </p>
              <div className="hero-actions intro third">
                <button type="button" className="btn primary" onClick={onStart}>
                  ساخت برنامه شخصی ←
                </button>
                <a className="textlink" href="#your-day">
                  <span className="play">◀</span>اول یک نمونه ببینم
                </a>
              </div>
              <div className="micro intro third">
                <span>ورود با شمارهٔ موبایل</span>
                <span>غذاهای آشنا و در دسترس</span>
              </div>
            </div>
            <div className="hero-scene intro second">
              <div className="sample-tag">
                <span>برنامهٔ روزانهٔ به‌تن</span>
                <span>نمونهٔ نمایشی</span>
              </div>
              <div className="product" id="hero-product">
                <div className="product-top">
                  <div>
                    <b>امروز، برای خودت</b>
                    <br />
                    <small>یک وعده، یک قدم کوچک رو به جلو</small>
                  </div>
                  <div className="dots" aria-hidden="true">
                    <i></i>
                    <i></i>
                    <i></i>
                  </div>
                </div>
                <p className="today-msg">وعدهٔ بعدی‌ات آماده است.</p>
                <div className="meal-visual">
                  <div className="plate" aria-hidden="true">
                    <i className="rice"></i>
                    <i className="chicken"></i>
                    <i className="salad"></i>
                  </div>
                  <div className="meal-desc">
                    <span className="pill">ناهار · نمونهٔ نمایشی</span>
                    <b>مرغ، برنج و سالاد</b>
                    <p>ساده، آشنا و متناسب با برنامهٔ تو</p>
                  </div>
                </div>
                <div className="meal-bottom">
                  <button
                    type="button"
                    className="btn primary"
                    id="hero-done"
                    aria-pressed={completed.has("lunch")}
                    onClick={() => toggleMeal("lunch")}
                  >
                    {completed.has("lunch")
                      ? "✓ ثبت شد · لغو ثبت"
                      : "✓ این وعده را خوردم"}
                  </button>
                  <a className="swap tiny" href="#your-day">
                    دیدن مقدار مواد ←
                  </a>
                </div>
                <div className="mini-stats">
                  <div className="mini-stat">
                    <small>انرژی تقریبی این وعده</small>
                    <b>
                      ۴۷۰{" "}
                      <small style={{ display: "inline" } as CSSProperties}>
                        کالری
                      </small>
                    </b>
                    <div className="track">
                      <i style={{ "--p": "62%" } as CSSProperties}></i>
                    </div>
                  </div>
                  <div className="mini-stat">
                    <small>پروتئین</small>
                    <b>
                      ۴۱{" "}
                      <small style={{ display: "inline" } as CSSProperties}>
                        گرم
                      </small>
                    </b>
                    <div className="track">
                      <i
                        style={
                          {
                            "--p": "77%",
                            background: "#53bb9c",
                          } as CSSProperties
                        }
                      ></i>
                    </div>
                  </div>
                  <div className="mini-stat">
                    <small>ثبت وعده‌های امروز</small>
                    <b id="hero-count">
                      {completed.has("lunch") ? "۳ از ۵" : "۲ از ۵"}
                    </b>
                    <div className="track">
                      <i
                        id="hero-track"
                        style={{
                          width: completed.has("lunch") ? "60%" : "40%",
                          background: "#9aaae4",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="toast-chip">
                <span className="check">✓</span>
                <div>
                  <b id="hero-message" aria-live="polite">
                    {completed.has("lunch")
                      ? "وعده در این نمونه ثبت شد."
                      : "قدم بعدی، همین وعده است."}
                  </b>
                  <small>قرار نیست همه‌چیز یک‌باره عوض شود.</small>
                </div>
              </div>
              <p className="scene-caption">
                این نمونه برای آشنایی با برنامه است. برنامهٔ تو بر اساس اطلاعات
                خودت ساخته می‌شود.
              </p>
            </div>
          </section>
          <div className="herofoot">
            <div className="items">
              <span>غذاهای آشنا</span>
              <span>مقدار مشخص</span>
              <span>روند قابل مشاهده</span>
            </div>
            <a href="#how">
              مسیر را کشف کن <span>↓</span>
            </a>
          </div>
          <section className="section" id="how">
            <div className="section-title reveal">
              <div>
                <div className="eyebrow">
                  سردرگمی کمتر. جای بیشتر برای زندگی.
                </div>
                <h2>
                  برنامه‌ات روشن باشد.
                  <br />
                  <span className="accent">ذهنت آزادتر.</span>
                </h2>
              </div>
              <p>
                به‌جای فکرکردن مداوم به «الان چی بخورم؟»، یک مسیر مشخص جلویت
                داشته باش.
              </p>
            </div>
            <div className="steps">
              <article className="step reveal">
                <span className="step-number">۰۱ / شناخت شرایط تو</span>
                <span className="step-icon" aria-hidden="true">
                  ◎
                </span>
                <h3>از شرایط تو شروع می‌کنیم</h3>
                <p>
                  اطلاعات بدنی، هدف، فعالیت، ترجیحات غذایی و وضعیت سلامتت را ثبت
                  می‌کنی.
                </p>
              </article>
              <article
                className="step reveal"
                style={{ "--delay": "100ms" } as CSSProperties}
              >
                <span className="step-number">۰۲ / دریافت برنامه</span>
                <span className="step-icon" aria-hidden="true">
                  ≋
                </span>
                <h3>برنامه‌ات را می‌گیری</h3>
                <p>
                  به‌تن نیاز روزانه و وعده‌ها را محاسبه می‌کند. غذا و مقدار هر
                  ماده در برنامه مشخص است.
                </p>
              </article>
              <article
                className="step reveal"
                style={{ "--delay": "200ms" } as CSSProperties}
              >
                <span className="step-number">۰۳ / پیگیری روزانه</span>
                <span className="step-icon" aria-hidden="true">
                  ↗
                </span>
                <h3>روندت را دنبال می‌کنی</h3>
                <p>
                  وعده‌ها را ثبت می‌کنی، غذای مناسب را جایگزین می‌کنی و تغییرات
                  وزن و اندازه‌هایت را می‌بینی.
                </p>
              </article>
            </div>
          </section>
          <section className="section demo" id="your-day">
            <div className="reveal">
              <div className="eyebrow">برنامه‌ای برای خوردن، نه فقط خواندن</div>
              <h2>
                غذای واقعی.
                <br />
                مقدار مشخص.
                <br />
                <span className="accent">یک تصمیم کمتر.</span>
              </h2>
              <p className="bodycopy">
                برای پیش‌رفتن، همیشه به تصمیم‌های بزرگ نیاز نداری. گاهی کافی است
                بدانی برای وعدهٔ بعد چه چیزی روی بشقابت بگذاری.
              </p>
              <ul className="featurelist">
                <li>غذاهایی که می‌شناسی و دوست داری</li>
                <li>مقدار هر ماده، روشن و قابل فهم</li>
                <li>ثبت سادهٔ وعده‌هایی که خوردی</li>
              </ul>
            </div>
            <MealDemo completed={completed} onToggle={toggleMeal} />
          </section>
          <section className="showcase" id="progress">
            <div className="section-title reveal">
              <div>
                <div className="eyebrow">از یک روز، به یک مسیر</div>
                <h2>
                  تغییرهای کوچک،
                  <br />
                  وقتی <span className="accent">دیده می‌شوند.</span>
                </h2>
              </div>
              <p>
                یک عدد به‌تنهایی همهٔ داستان تو نیست. روندت را در گذر زمان ببین،
                با آرامش و بدون مسابقه با دیگران.
              </p>
            </div>
            <div className="progress-stage">
              <div className="chart-card reveal">
                <div className="chart-head">
                  <b>روند من</b>
                  <small>دادهٔ نمونه؛ نتیجهٔ واقعی کاربران نیست</small>
                </div>
                <div className="weight-head">
                  <span>تغییر ثبت‌شده در این نمونه</span>
                  <strong>
                    ۱٫۲{" "}
                    <span style={{ fontSize: "11px" } as CSSProperties}>
                      کیلوگرم
                    </span>
                  </strong>
                </div>
                <svg
                  className="chart"
                  viewBox="0 0 500 145"
                  role="img"
                  aria-label="نمودار نمونهٔ وزن از ۸۵ به ۸۳٫۸ کیلوگرم در چهار هفته"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop stopColor="#b9ef70" stopOpacity=".16"></stop>
                      <stop
                        offset="1"
                        stopColor="#b9ef70"
                        stopOpacity="0"
                      ></stop>
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 25H500M0 75H500M0 125H500"
                    stroke="#ffffff0b"
                    fill="none"
                  ></path>
                  <path
                    d="M10 25C60 25 70 55 110 50S170 33 205 65S265 60 300 88S355 83 390 105S450 105 490 125V145H10Z"
                    fill="url(#fill)"
                  ></path>
                  <path
                    d="M10 25C60 25 70 55 110 50S170 33 205 65S265 60 300 88S355 83 390 105S450 105 490 125"
                    fill="none"
                    stroke="#c8f589"
                    strokeWidth="2"
                    pathLength="1"
                    className="chart-line"
                  ></path>
                  <circle cx="490" cy="125" r="4" fill="#cef983"></circle>
                  <circle cx="490" cy="125" r="10" fill="#cef98315"></circle>
                </svg>
                <div className="chart-labels" dir="ltr">
                  <span>۱ مهر</span>
                  <span>۸ مهر</span>
                  <span>۱۵ مهر</span>
                  <span>۲۲ مهر</span>
                </div>
              </div>
              <div className="progress-side reveal">
                <div>
                  <h3>
                    از کامل‌بودن مهم‌تر،
                    <br />
                    ادامه‌دادن توست.
                  </h3>
                  <p>
                    یک روز متفاوت، تمام راهی را که آمده‌ای پاک نمی‌کند. از قدم
                    بعدی ادامه بده.
                  </p>
                </div>
                <div className="bars" aria-hidden="true">
                  <i
                    className="bar"
                    style={{ "--height": "22%" } as CSSProperties}
                  ></i>
                  <i
                    className="bar"
                    style={{ "--height": "39%" } as CSSProperties}
                  ></i>
                  <i
                    className="bar"
                    style={{ "--height": "50%" } as CSSProperties}
                  ></i>
                  <i
                    className="bar"
                    style={{ "--height": "75%" } as CSSProperties}
                  ></i>
                  <i
                    className="bar"
                    style={{ "--height": "92%" } as CSSProperties}
                  ></i>
                </div>
              </div>
            </div>
          </section>
          <section className="section goals">
            <div className="goal-grid">
              <div className="goal-title reveal">
                <div className="eyebrow">هدف تو، نقطهٔ شروع ما</div>
                <h2>
                  می‌خواهی چه چیزی
                  <br />
                  <span className="accent">برای تو بهتر شود؟</span>
                </h2>
                <p>
                  مسیرها یکسان نیستند. هدفت را انتخاب کن و اولین قدم را با شناخت
                  بیشتری بردار.
                </p>
              </div>
              <GoalPicker onStart={onStart} />
            </div>
          </section>
          <ProductDetails />
          <LandingPlans onStart={onStart} />
          <section className="section faq" id="questions">
            <div className="faq-title reveal">
              <div className="eyebrow">قبل از شروع</div>
              <h2>
                شاید سؤال تو
                <br />
                <span className="accent">هم همین باشد.</span>
              </h2>
            </div>
            <div className="reveal">
              <details>
                <summary>قرار است غذاهای عجیب و جداگانه درست کنم؟</summary>
                <p>
                  برنامه از غذاهای آشنا ساخته می‌شود؛ از نان و پنیر و تخم‌مرغ تا
                  برنج و مرغ. انتخاب غذا و مقدار آن به شرایط، هدف و ترجیحات
                  ثبت‌شدهٔ تو بستگی دارد.
                </p>
              </details>
              <details>
                <summary>اگر یک روز نتوانستم برنامه را رعایت کنم چه؟</summary>
                <p>
                  قرار نیست با یک وعده یا یک روز متفاوت، همه‌چیز را از اول شروع
                  کنی. از وعدهٔ بعد به برنامه‌ات برگرد و روند چند هفته‌ات را
                  ببین.
                </p>
              </details>
              <details>
                <summary>آیا به‌تن جای پزشک یا متخصص تغذیه است؟</summary>
                <p>
                  خیر. به‌تن ابزار برنامه‌ریزی غذایی است. برخی شرایط پزشکی نیاز
                  به بررسی متخصص دارند و ممکن است ساخت خودکار برنامه برای آن‌ها
                  ممکن نباشد.
                </p>
              </details>
              <details>
                <summary>متخصص یا مربی هستم؛ پنل جداگانه دارید؟</summary>
                <p>
                  بله؛ به‌تن Pro برای مدیریت مراجعان، تولید و بررسی برنامه‌ها و
                  دریافت خروجی PDF ساخته شده است.{" "}
                  <a
                    href="/professionals"
                    style={{ color: "var(--lime)" } as CSSProperties}
                  >
                    آشنایی با پنل متخصصین ↗
                  </a>
                </p>
              </details>
            </div>
          </section>
          <section className="final">
            <div className="final-box reveal">
              <div className="final-orbit" aria-hidden="true"></div>
              <div>
                <h2>آماده‌ای برنامهٔ خودت را بسازی؟</h2>
                <p>لازم نیست از فردا همه‌چیز عوض شود. از همین قدم شروع کن.</p>
              </div>
              <button type="button" className="btn" onClick={onStart}>
                برنامهٔ شخصی من <span className="arrow">←</span>
              </button>
            </div>
          </section>
        </div>
      </main>
      <footer className="footer wrap">
        <div className="footer-row">
          <a className="brand" href="#">
            <img src={APP_LOGO_PATH} alt="" />
            به‌تن
          </a>
          <p>برنامهٔ غذایی شخصی برای مدیریت وزن، همراه با زندگی تو.</p>
          <div className="footer-links">
            <a href="#questions">پرسش‌ها</a>
            <a href="/professionals">پنل متخصصین ↗</a>
            <button
              type="button"
              className="swap tiny"
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? "پخش حرکت‌ها" : "توقف حرکت‌ها"}
            </button>
          </div>
        </div>
        <div className="footer-bottom">
          <div>
            <p>به‌تن، برنامهٔ غذایی متناسب با شرایط تو.</p>
            <p>
              ساخت برنامهٔ خودکار برای بعضی شرایط پزشکی به بررسی متخصص نیاز
              دارد.
            </p>
            <p>
              ©{" "}
              {new Intl.DateTimeFormat("fa-IR", { year: "numeric" }).format(
                new Date(),
              )}{" "}
              به‌تن
            </p>
          </div>
          <div
            className="enamad-seal"
            aria-label="نماد اعتماد الکترونیکی"
            dangerouslySetInnerHTML={{ __html: ENAMAD_HTML }}
          />
        </div>
      </footer>
    </div>
  );
}
