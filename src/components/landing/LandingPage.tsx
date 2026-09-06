import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  CircleCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Utensils,
} from 'lucide-react';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

interface LandingPageProps {
  onStart: () => void;
}

const ENAMAD_HTML = "<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=7609793&Code=scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=7609793&Code=scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO' alt='' style='cursor:pointer' code='scgNPXGx8ajk1qpPJJpjVvWnsT3T3IOO'></a>";

const FEATURES = [
  {
    icon: Target,
    title: 'متناسب با هدف تو',
    description: 'برنامه بر اساس اطلاعات بدنی، سطح فعالیت، هدف و سبک زندگی تو ساخته می‌شود.',
  },
  {
    icon: Utensils,
    title: 'غذاهای واقعی و در دسترس',
    description: 'وعده‌هایی کاربردی با مقدار دقیق؛ بدون منوهای عجیب و غیرقابل‌اجرا.',
  },
  {
    icon: RefreshCw,
    title: 'جایگزینی هوشمند غذا',
    description: 'غذا را عوض کن و انتخاب‌هایی هماهنگ با همان وعده و نیاز تغذیه‌ای ببین.',
  },
  {
    icon: Camera,
    title: 'اسکن اختیاری بدن',
    description: 'با رضایت خودت از تخمین تصویری به‌عنوان یک داده کمکی استفاده کن.',
  },
];

const STEPS = [
  ['۱', 'خودت را معرفی کن', 'چند سؤال کوتاه درباره بدن، هدف، فعالیت و ترجیحات غذایی.'],
  ['۲', 'برنامه‌ات را بگیر', 'به‌تن نیاز روزانه و وعده‌های متناسب با شرایط تو را محاسبه می‌کند.'],
  ['۳', 'هر روز اجرا کن', 'وعده‌ها را دنبال کن، غذاها را جایگزین کن و روندت را منظم نگه دار.'],
] as const;

function LogoLockup() {
  return (
    <a href="#top" className="inline-flex items-center gap-2.5" aria-label="صفحه اصلی به‌تن">
      <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-neutral-950 p-1.5 shadow-sm dark:bg-transparent dark:shadow-none">
        <img src={APP_LOGO_PATH} alt="" className="h-full w-full object-contain" />
      </span>
      <span className="text-xl font-black tracking-tight text-neutral-950 dark:text-white">
        {APP_NAME_FA}
      </span>
    </a>
  );
}

function DailyPlanPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[430px]" aria-label="نمونه نمایشی برنامه روزانه">
      <div className="absolute -inset-5 rounded-[2.5rem] bg-primary-400/15 blur-3xl dark:bg-primary-500/10" />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.55 }}
        className="relative overflow-hidden rounded-[2rem] border border-neutral-200/80 bg-white p-5 shadow-2xl shadow-neutral-950/10 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/30 sm:p-6"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">نمونه برنامه روزانه</span>
            <h2 className="mt-1 text-xl font-black text-neutral-950 dark:text-white">امروزت را کامل کن</h2>
          </div>
          <span className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
            روز ۱
          </span>
        </div>

        <div className="mb-5 grid grid-cols-[96px_1fr] items-center gap-5 rounded-3xl bg-neutral-950 p-4 text-white dark:bg-black">
          <div className="relative grid h-24 w-24 place-items-center rounded-full bg-[conic-gradient(#10b981_0_72%,#262626_72%_100%)]">
            <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-neutral-950 text-center dark:bg-black">
              <div>
                <strong className="block text-lg font-black tabular-fa">۷۲٪</strong>
                <span className="text-[10px] text-neutral-400">پیشرفت امروز</span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs text-neutral-400">هدف روزانه نمونه</p>
            <p className="mt-1 text-2xl font-black tabular-fa">۲۱۵۰ <span className="text-sm font-medium text-neutral-400">کالری</span></p>
            <div className="mt-3 flex gap-2 text-[10px] font-semibold text-neutral-300">
              <span>پروتئین ۱۵۵g</span>
              <span className="text-neutral-600">•</span>
              <span>۶ وعده</span>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {[
            ['صبحانه', 'کامل شد', '۴۲۰ کالری', true],
            ['ناهار', 'وعده بعدی', '۶۸۰ کالری', false],
            ['شام', 'امشب', '۵۴۰ کالری', false],
          ].map(([meal, status, calories, done]) => (
            <div
              key={String(meal)}
              className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${done ? 'bg-primary-500 text-white' : 'bg-white text-neutral-400 dark:bg-neutral-900'}`}>
                {done ? <Check size={18} strokeWidth={3} /> : <Utensils size={17} />}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-neutral-900 dark:text-neutral-100">{meal}</strong>
                <span className={`text-[11px] ${done ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400'}`}>{status}</span>
              </span>
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{calories}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div id="top" className="min-h-screen overflow-hidden bg-white text-neutral-950 dark:bg-neutral-950 dark:text-white">
      <header className="sticky top-0 z-40 border-b border-neutral-200/70 bg-white/85 backdrop-blur-xl dark:border-neutral-800/80 dark:bg-neutral-950/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20 sm:px-8">
          <LogoLockup />
          <nav className="hidden items-center gap-7 text-sm font-semibold text-neutral-500 dark:text-neutral-400 md:flex" aria-label="منوی اصلی">
            <a href="#how-it-works" className="transition-colors hover:text-neutral-950 dark:hover:text-white">چطور کار می‌کند؟</a>
            <a href="#features" className="transition-colors hover:text-neutral-950 dark:hover:text-white">امکانات</a>
            <a href="#safety" className="transition-colors hover:text-neutral-950 dark:hover:text-white">ایمنی و حریم خصوصی</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={onStart}
              className="rounded-xl px-3 py-2 text-sm font-bold text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800 sm:px-4"
            >
              ورود
            </button>
            <button
              type="button"
              onClick={onStart}
              className="hidden rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-neutral-950 sm:inline-flex"
            >
              شروع رایگان
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative border-b border-neutral-100 px-5 pb-20 pt-16 dark:border-neutral-900 sm:px-8 sm:pb-28 sm:pt-24">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 mx-auto h-[560px] max-w-5xl bg-[radial-gradient(circle_at_70%_20%,rgba(16,185,129,0.13),transparent_42%)] dark:bg-[radial-gradient(circle_at_70%_20%,rgba(16,185,129,0.09),transparent_42%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center lg:text-right"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3.5 py-2 text-xs font-bold text-primary-700 dark:border-primary-900 dark:bg-primary-950/50 dark:text-primary-300">
                <Sparkles size={15} />
                تغذیه شخصی؛ نه یک نسخه عمومی
              </span>
              <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-black leading-[1.25] tracking-tight text-neutral-950 dark:text-white sm:text-6xl sm:leading-[1.2] lg:mx-0">
                برنامه غذایی‌ای که با
                <span className="relative mx-2 inline-block text-primary-500">
                  زندگی تو
                  <svg className="absolute -bottom-1 left-0 h-2 w-full text-primary-200 dark:text-primary-900" viewBox="0 0 200 8" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M2 6C55 1 127 1 198 5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
                جور درمی‌آید
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-neutral-600 dark:text-neutral-400 sm:text-lg lg:mx-0">
                به‌تن با شناخت هدف، شرایط بدنی و عادت‌های غذایی تو، یک برنامه دقیق و قابل‌اجرا می‌سازد؛ برنامه‌ای که بتوانی واقعاً ادامه‌اش بدهی.
              </p>
              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row lg:mx-0">
                <button
                  type="button"
                  onClick={onStart}
                  className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-500 px-6 py-4 text-base font-black text-white shadow-lg shadow-primary-500/20 transition-all hover:-translate-y-0.5 hover:bg-primary-600 active:translate-y-0"
                >
                  ساخت برنامه شخصی
                  <ArrowLeft size={19} />
                </button>
                <button
                  type="button"
                  onClick={onStart}
                  className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-neutral-200 bg-white px-6 py-4 text-base font-bold text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  ورود به حساب
                </button>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-neutral-500 dark:text-neutral-500 lg:justify-start">
                <span className="inline-flex items-center gap-1.5"><CircleCheck size={15} className="text-primary-500" />ورود با شماره موبایل</span>
                <span className="inline-flex items-center gap-1.5"><CircleCheck size={15} className="text-primary-500" />امکان تغییر غذاها</span>
                <span className="inline-flex items-center gap-1.5"><CircleCheck size={15} className="text-primary-500" />اسکن بدن اختیاری</span>
              </div>
            </motion.div>

            <DailyPlanPreview />
          </div>
          <a href="#how-it-works" aria-label="مشاهده ادامه صفحه" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-neutral-300 transition-colors hover:text-primary-500 sm:block dark:text-neutral-700">
            <ChevronDown className="animate-bounce" size={24} />
          </a>
        </section>

        <section className="bg-neutral-50 px-5 py-8 dark:bg-neutral-900/40 sm:px-8">
          <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-neutral-200 dark:divide-neutral-800 sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-y-0">
            {['محاسبه متناسب با شرایط تو', 'وعده‌های روزانه با مقدار دقیق', 'انتخاب‌های غذایی انعطاف‌پذیر'].map((item) => (
              <div key={item} className="flex items-center justify-center gap-2.5 px-4 py-4 text-center text-sm font-bold text-neutral-700 dark:text-neutral-300">
                <Check size={17} strokeWidth={3} className="text-primary-500" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 px-5 py-20 dark:bg-neutral-950 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <span className="text-sm font-black text-primary-600 dark:text-primary-400">ساده و روشن</span>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-neutral-950 dark:text-white sm:text-4xl">از شناخت تو تا برنامه روزانه</h2>
              <p className="mt-4 leading-7 text-neutral-500 dark:text-neutral-400">سه قدم مشخص؛ بدون پیچیدگی و حدس‌زدن مقدار غذا.</p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {STEPS.map(([number, title, description]) => (
                <article key={number} className="group rounded-3xl border border-neutral-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-primary-200 hover:shadow-xl hover:shadow-neutral-950/5 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-primary-900">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-neutral-950 text-sm font-black text-white transition-colors group-hover:bg-primary-500 dark:bg-white dark:text-neutral-950 dark:group-hover:bg-primary-500 dark:group-hover:text-white">{number}</span>
                  <h3 className="mt-6 text-lg font-black text-neutral-950 dark:text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-500 dark:text-neutral-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 bg-neutral-50 px-5 py-20 dark:bg-neutral-900/40 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-sm font-black text-primary-600 dark:text-primary-400">برای اجرای واقعی برنامه</span>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-neutral-950 dark:text-white sm:text-4xl">ابزارهایی که هر روز به کارت می‌آیند</h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <article key={title} className="flex gap-4 rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400">
                    <Icon size={22} />
                  </span>
                  <div>
                    <h3 className="text-base font-black text-neutral-950 dark:text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-7 text-neutral-500 dark:text-neutral-400">{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="safety" className="scroll-mt-24 px-5 py-20 dark:bg-neutral-950 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-neutral-950 px-6 py-10 text-white dark:border dark:border-neutral-800 dark:bg-black sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-16">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 text-sm font-black text-primary-400"><ShieldCheck size={20} />ایمنی قبل از برنامه</span>
              <h2 className="mt-4 text-2xl font-black leading-snug sm:text-3xl">سلامتی تو مهم‌تر از ساختن یک رژیم خودکار است.</h2>
              <p className="mt-4 text-sm leading-7 text-neutral-400 sm:text-base">به‌تن پیش از تولید برنامه، شرایط نیازمند بررسی تخصصی را ارزیابی می‌کند. اسکن بدن نیز کاملاً اختیاری است و تصویر خام در پروفایل تو نگهداری نمی‌شود.</p>
            </div>
            <button
              type="button"
              onClick={onStart}
              className="mt-8 inline-flex min-h-14 w-full flex-none items-center justify-center gap-2 rounded-2xl bg-primary-500 px-7 py-4 font-black text-white transition-colors hover:bg-primary-600 lg:mt-0 lg:w-auto"
            >
              شروع برنامه
              <ArrowLeft size={19} />
            </button>
          </div>
        </section>

        <section className="border-t border-primary-400 bg-primary-500 px-5 py-20 text-center sm:px-8 sm:py-24">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">آماده‌ای برنامه خودت را بسازی؟</h2>
            <p className="mt-4 leading-7 text-primary-50">اطلاعاتت را وارد کن و برنامه غذایی شخصی خودت را در به‌تن ببین.</p>
            <button
              type="button"
              onClick={onStart}
              className="mx-auto mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-8 py-4 font-black text-neutral-950 shadow-lg shadow-primary-800/15 transition-all hover:-translate-y-0.5 hover:bg-neutral-50"
            >
              شروع رایگان
              <ArrowLeft size={19} />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 bg-white px-5 py-10 dark:border-neutral-800 dark:bg-neutral-950 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <div>
              <LogoLockup />
              <p className="mt-3 max-w-sm text-sm leading-6 text-neutral-500 dark:text-neutral-400">برنامه تغذیه هوشمند و شخصی‌سازی‌شده برای انتخاب‌های بهتر و اجرای پایدارتر.</p>
              <a href="mailto:info@behtan.fit" className="mt-3 inline-block text-sm font-semibold text-neutral-700 transition-colors hover:text-primary-600 dark:text-neutral-300 dark:hover:text-primary-400" dir="ltr">info@behtan.fit</a>
            </div>
            <div
              className="enamad-seal flex min-h-[120px] min-w-[120px] items-center justify-center rounded-2xl border border-neutral-200 bg-white p-2 dark:border-neutral-700"
              aria-label="نماد اعتماد الکترونیکی به‌تن"
              dangerouslySetInnerHTML={{ __html: ENAMAD_HTML }}
            />
          </div>
          <div className="flex flex-col gap-2 border-t border-neutral-100 pt-6 text-xs text-neutral-400 dark:border-neutral-900 dark:text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
            <p>© ۱۴۰۵ به‌تن؛ تمامی حقوق محفوظ است.</p>
            <p>به‌تن جایگزین تشخیص یا درمان پزشکی نیست.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
