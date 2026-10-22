import { useRef, useState, type KeyboardEvent } from "react";
import {
  Camera,
  Check,
  FileText,
  RefreshCw,
  ShieldCheck,
  Utensils,
} from "lucide-react";
import { useSubscriptionPlans } from "@/hooks/useSubscriptionPlans";
import { formatSubscriptionPrice } from "@/utils/subscriptionPlans";

export type MealKey = "breakfast" | "lunch" | "dinner";
const MEALS = {
  breakfast: {
    label: "صبحانه",
    name: "نان، پنیر، گردو و سبزیجات",
    kcal: 350,
    items: [
      ["نان سنگک", "۶۰ گرم"],
      ["پنیر کم‌چرب", "۴۰ گرم"],
      ["گردو", "۱۰ گرم"],
      ["خیار و گوجه", "۱۵۰ گرم"],
    ],
  },
  lunch: {
    label: "ناهار",
    name: "مرغ، برنج و سالاد",
    kcal: 470,
    items: [
      ["سینهٔ مرغ پخته", "۱۲۰ گرم"],
      ["برنج پخته", "۱۵۰ گرم"],
      ["سالاد بدون سس", "۱۵۰ گرم"],
      ["روغن زیتون", "۵ گرم"],
    ],
  },
  dinner: {
    label: "شام",
    name: "املت، نان و سبزی خوردن",
    kcal: 340,
    items: [
      ["تخم‌مرغ", "۲ عدد"],
      ["نان سنگک", "۵۰ گرم"],
      ["گوجه‌فرنگی", "۱۵۰ گرم"],
      ["روغن", "۳ گرم"],
    ],
  },
} as const;
const KEYS = Object.keys(MEALS) as MealKey[];

export function MealDemo({
  completed,
  onToggle,
}: {
  completed: Set<MealKey>;
  onToggle: (meal: MealKey) => void;
}) {
  const [current, setCurrent] = useState<MealKey>("lunch");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const meal = MEALS[current];
  const done = completed.has(current);
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowLeft") next = (index + 1) % KEYS.length;
    else if (event.key === "ArrowRight")
      next = (index + KEYS.length - 1) % KEYS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = KEYS.length - 1;
    else return;
    event.preventDefault();
    setCurrent(KEYS[next]);
    tabs.current[next]?.focus();
  };
  return (
    <div className="demo-panel reveal">
      <div className="demo-tabs" role="tablist" aria-label="وعدهٔ نمونه">
        {KEYS.map((key, index) => (
          <button
            type="button"
            key={key}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            id={"tab-" + key}
            role="tab"
            aria-selected={key === current}
            tabIndex={key === current ? 0 : -1}
            aria-controls="meal-panel"
            onKeyDown={(e) => onKey(e, index)}
            onClick={() => setCurrent(key)}
          >
            {MEALS[key].label}
          </button>
        ))}
      </div>
      <div
        id="meal-panel"
        role="tabpanel"
        aria-labelledby={"tab-" + current}
        tabIndex={0}
      >
        <div className="eyebrow">نمونهٔ نمایشی؛ برنامهٔ شخصی تو نیست</div>
        <h3>{meal.name}</h3>
        {meal.items.map(([name, quantity]) => (
          <div className="ingredient" key={name}>
            <span>
              <i className="ingdot" />
              {name}
            </span>
            <span className="qty">{quantity}</span>
          </div>
        ))}
        <div className="demo-panel-foot">
          <span className="demo-kcal">
            <b>{meal.kcal.toLocaleString("fa-IR")}</b> کالری تقریبی
          </span>
          <button
            type="button"
            className="btn primary"
            aria-pressed={done}
            onClick={() => onToggle(current)}
          >
            {done ? "✓ ثبت شد · لغو ثبت" : "✓ این وعده را خوردم"}
          </button>
        </div>
        <p className="day-done" aria-live="polite">
          {done
            ? "وعده در این نمونه ثبت شد."
            : "اینجا ثبت وعده را امتحان کن؛ در حساب تو ذخیره نمی‌شود."}
        </p>
      </div>
    </div>
  );
}

const GOALS = [
  {
    key: "loss",
    name: "کاهش وزن",
    icon: "↘",
    message:
      "برای کاهش وزن، برنامه بر اساس اطلاعات بدنی و سطح فعالیتت تنظیم می‌شود.",
  },
  {
    key: "maintain",
    name: "حفظ وزن",
    icon: "↔",
    message:
      "برای حفظ وزن، برنامه به تو کمک می‌کند وعده‌های منظم و مقدار مناسب داشته باشی.",
  },
  {
    key: "gain",
    name: "افزایش وزن",
    icon: "↗",
    message:
      "برای افزایش وزن، مقدار و ترکیب وعده‌ها با هدف و شرایطت هماهنگ می‌شود.",
  },
];
export function GoalPicker({ onStart }: { onStart: () => void }) {
  const [selected, setSelected] = useState("loss");
  return (
    <div className="goal-picker reveal">
      <div className="goal-options" aria-label="آشنایی با هدف‌های برنامه">
        {GOALS.map((goal) => (
          <button
            type="button"
            key={goal.key}
            aria-pressed={selected === goal.key}
            onClick={() => setSelected(goal.key)}
          >
            <span aria-hidden="true">{goal.icon}</span>
            {goal.name}
          </button>
        ))}
      </div>
      <p className="goal-message" aria-live="polite">
        {GOALS.find((g) => g.key === selected)?.message}
      </p>
      <button type="button" className="btn primary" onClick={onStart}>
        ساخت برنامه شخصی ←
      </button>
      <p className="tiny goal-note">
        هدف نهایی را هنگام ثبت اطلاعاتت انتخاب می‌کنی.
      </p>
    </div>
  );
}

export function ProductDetails() {
  return (
    <>
      <section className="section" id="features">
        <div className="section-title reveal">
          <div>
            <div className="eyebrow">ابزارهایی برای هر روز</div>
            <h2>
              برنامه‌ات را راحت‌تر
              <br />
              <span className="accent">دنبال کن.</span>
            </h2>
          </div>
          <p>
            از انتخاب غذا تا ثبت تغییرات، اطلاعات موردنیازت کنار هم قرار دارد.
          </p>
        </div>
        <div className="feature-grid">
          {[
            {
              Icon: RefreshCw,
              title: "جایگزینی غذا",
              text: "اگر غذایی را نمی‌خواهی، از بین جایگزین‌های همان وعده انتخاب کن. مقدار جدید با نیاز برنامه هماهنگ می‌شود.",
            },
            {
              Icon: Utensils,
              title: "مقدار روشن برای هر وعده",
              text: "انرژی روزانه، ترکیب مواد مغذی و مقدار غذاها را ببین و وعده‌هایی را که خوردی ثبت کن.",
            },
            {
              Icon: Camera,
              title: "اسکن اختیاری بدن",
              text: "اگر بخواهی، از تخمین تصویری به‌عنوان اطلاعات کمکی استفاده کن. برای شروع برنامه مجبور به ارسال عکس نیستی.",
            },
            {
              Icon: FileText,
              title: "پیگیری تغییرات",
              text: "وزن و اندازه‌هایت را ثبت کن تا روند تغییرات را در کنار برنامهٔ روزانه ببینی.",
            },
          ].map(({ Icon, title, text }) => (
            <article className="feature-card reveal" key={title}>
              <Icon aria-hidden="true" size={24} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="pro-banner reveal" aria-labelledby="pro-title">
        <div>
          <span className="eyebrow">به‌تن برای متخصصان و مربیان</span>
          <h2 id="pro-title">
            پرونده، برنامه و گزارش؛
            <br />
            <span className="accent">در یک پنل.</span>
          </h2>
          <p>
            برنامه‌سازی تغذیه، تمرین یا هر دو را انتخاب کنید. اطلاعات مراجع،
            بازبینی برنامه‌ها، گزارش تصویری بدن و خروجی PDF فارسی در پنل در
            دسترس است.
          </p>
          <a className="btn primary" href="/professionals">
            امکانات و تعرفه‌های پنل متخصصین ←
          </a>
        </div>
        <div className="pro-mini">
          <span>به‌تن / پنل متخصصین</span>
          <div>
            <Check size={17} /> مدیریت پروندهٔ مراجعان
          </div>
          <div>
            <Check size={17} /> تدوین و ویرایش برنامه
          </div>
          <div>
            <Check size={17} /> سوابق و خروجی PDF
          </div>
          <small>اسکن و گزارش بدن در هر دو پنل</small>
        </div>
      </section>
      <section className="safety-note reveal" id="safety">
        <ShieldCheck size={28} aria-hidden="true" />
        <div>
          <h2>با آگاهی شروع کن.</h2>
          <p>
            به‌تن ابزار برنامه‌ریزی غذایی است و جای تشخیص یا درمان پزشکی را
            نمی‌گیرد. پیش از ساخت برنامه، وضعیت سلامتت بررسی می‌شود؛ بعضی شرایط
            به ارزیابی متخصص نیاز دارند. اسکن تصویری اختیاری است و دقت
            اندازه‌گیری پزشکی ندارد.
          </p>
        </div>
      </section>
    </>
  );
}

export function LandingPlans({ onStart }: { onStart: () => void }) {
  const { plans, loading, error, refetch } = useSubscriptionPlans(true);
  return (
    <section
      id="plans"
      className="section landing-pricing"
      aria-labelledby="plans-title"
    >
      <div className="section-title reveal">
        <div>
          <span className="eyebrow">اشتراک کاربران به‌تن</span>
          <h2 id="plans-title">
            برنامهٔ تو،
            <br />
            <span className="accent">با انتخاب خودت.</span>
          </h2>
        </div>
        <p>
          نام، امکانات و مبلغ هر اشتراک را اینجا ببین. انتخاب و تأیید نهایی بعد
          از ورود و ثبت اطلاعات انجام می‌شود.
        </p>
      </div>
      {loading && <p role="status">در حال دریافت اشتراک‌های به‌روز…</p>}
      {error && (
        <div className="catalog-error" role="alert">
          <p>دریافت اشتراک‌ها انجام نشد. برای دیدن قیمت‌ها دوباره تلاش کن.</p>
          <button type="button" className="btn" onClick={() => void refetch()}>
            دریافت دوباره
          </button>
        </div>
      )}
      {!loading && !error && !plans.length && (
        <p>در حال حاضر اشتراکی برای نمایش فعال نیست.</p>
      )}
      {!error && (
        <div className="plan-grid">
          {plans.map((plan) => (
            <article
              className={"landing-plan" + (plan.badge ? " has-badge" : "")}
              key={plan.code}
            >
              <div className="plan-heading">
                <h3>{plan.name}</h3>
                {plan.badge && <span className="pill">{plan.badge}</span>}
              </div>
              <div className="plan-price">
                <strong>{formatSubscriptionPrice(plan.priceToman)}</strong>
                {plan.priceToman > 0 && <span> تومان</span>}
              </div>
              <p>{plan.priceNote}</p>
              <p className="tiny">
                مدت اعتبار: {plan.durationDays.toLocaleString("fa-IR")} روز
              </p>
              <ul>
                {plan.features.map((feature, index) => (
                  <li key={index}>
                    <Check size={16} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn primary" onClick={onStart}>
                ورود و انتخاب اشتراک ←
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="pricing-note">
        مبلغ‌ها به تومان هستند. قیمت و شرایط نهایی را پیش از پرداخت در حساب خودت
        تأیید می‌کنی. <a href="/professionals">تعرفه‌های پنل متخصصین جداست ↗</a>
      </p>
    </section>
  );
}
