# پنل مدیریت به‌تن — راهنمای نصب و کار

## ساختار و دامنهٔ نسخهٔ اول

یک مخزن GitHub، دو خروجی و دو پروژهٔ Vercel مستقل:

| قسمت | مسیر کد | دستور بیلد | خروجی | دامنه |
| --- | --- | --- | --- | --- |
| اپ کاربران | src/main.tsx | npm run build | dist | behtan.fit |
| پنل مدیریت | src/admin/main.tsx | npm run build:admin | dist-admin | admin.behtan.fit |

کارت غذا، خلاصهٔ کالری و ماکرو، کیفیت غذا، فونت و تم از کامپوننت‌های فعلی اپ استفاده می‌کنند. پنل مسیر آنبوردینگ یا خرید ندارد. ورود پیامکی و CAPTCHA همان زیرساخت موجود است؛ ورود موفق به‌تنهایی دسترسی مدیریتی نمی‌دهد. دیتابیس برای تک‌تک درخواست‌ها عضویت در admin_members و تأیید شماره را بررسی می‌کند. هیچ service-role key در پنل قرار نمی‌گیرد.

### قابلیت‌های پیاده‌شده

- لیست تمام کاربران Authentication، جدیدترین‌ها در ابتدا، جستجو با موبایل بین‌المللی/ایمیل/UUID و صفحه‌بندی ۵۰تایی.
- آمار عضویت ۷ روز اخیر، کاربران با اشتراک واقعی فعال، تعداد پرداخت‌های واقعی موفق و مجموع مبلغ تأییدشده به تومان.
- فهرست پرداخت‌ها با فیلتر وضعیت و محیط live/sandbox، کد پیگیری؛ مجموع پرداخت تأییدشده معادل تسویهٔ بانکی یا سود خالص نیست.
- پروفایل کامل، وضعیت آنبوردینگ، اشتراک‌ها، ۱۰۰ سفارش آخر و ۱۰۰ تغییر مدیریتی آخر هر کاربر.
- اعطای اشتراک دستی، تعیین پایان تا دقیقه، افزایش/کاهش روزها و قطع فوری. تغییر پلن با قطع اشتراک قبلی و اعطای پلن جدید انجام می‌شود.
- ثبت دلیل اجباری، شناسهٔ ادمین، زمان، وضعیت قبل و بعد؛ جلوگیری از ثبت تکراری درخواست و ویرایش روی اطلاعات قدیمی.
- اشتراک دستی بدون جعل payment_order؛ مبلغی به گزارش درآمد اضافه نمی‌کند. اشتراک دستی همیشه live است. سفارش تعیین‌تکلیف‌نشده مانع اعطای دستی است تا پرداخت در حال انجام با هدیه تداخل نکند.
- برنامهٔ کامل هر روز، اهداف کالری/پروتئین/کربوهیدرات/چربی، جمع کل غذاها، مصرف در آخرین گزارش، فیبر، مقادیر غذا و جایگزینی‌ها؛ همان UI اپ به‌صورت فقط‌خواندنی.
- تاریخ انتخابی، ۷ تاریخ اخیر به‌صورت میان‌بر و زمان آخرین همگام‌سازی. داده‌های بیشتر همان روز از بخش جزئیات JSON قابل مشاهده‌اند.

### محدودیت شفاف

برنامه‌های قبلی که ذخیره نشده‌اند قابل بازیابی دقیق نیستند. از نصب این نسخه، هنگام بازبودن داشبورد، آخرین برنامهٔ نمایش‌داده‌شده با هر تغییر همگام می‌شود. هر کاربر در هر روز یک رکورد دارد؛ آخرین نسخه جای قبلی را می‌گیرد، نه یک تاریخچهٔ نامحدود از تک‌تک تغییرات. برنامه‌های روزهای گذشته حفظ می‌شوند.

این «آخرین گزارش اپ» است، نه مشاهدهٔ زندهٔ صفحه یا ورود به حساب کاربر. اگر کاربر آفلاین باشد، درجا صفحه را ببندد یا هنوز نسخهٔ جدید را باز نکرده باشد، پنل لزوماً وضعیت فعلی او را ندارد. زمان ثبت را بررسی کنید. برای به‌روزرسانی پنل روی دکمهٔ به‌روزرسانی بزنید.

برنامه گزارش‌شده از مرورگر کاربر می‌آید؛ مرجع امنیتی پرداخت/اشتراک نیست. ذخیرهٔ گزارش، رفتار فعلی تولید برنامه هنگام رفرش را تغییر نمی‌دهد. تغییرات ذخیره‌نشدهٔ قبلی بازیابی نمی‌شوند. مدیریت قیمت پلن‌ها همچنان از subscription_plans در Supabase انجام می‌شود. نسخهٔ اول ابزار ویرایش رژیم کاربر، بازپرداخت، حذف کاربر یا جابه‌جایی هویت‌ها ندارد.

## ۱. اعمال بسته در مخزن فعلی

بسته یک patch است؛ پروژهٔ قدیمی یا فایل‌های کلیدها را جایگزین نمی‌کند.

در PowerShell پروژه:

```powershell
cd E:\Behtan-Final
git status
git pull --rebase origin main
git switch -c feature/admin-console
```

اگر تغییر محلی داری ابتدا آن را بازبینی و commit کن تا pull تداخل نکند. از دستور حذف تغییرات یا reset --hard استفاده نکن.

فایل behtan-admin.patch داخل ZIP را به ریشهٔ پروژه (کنار package.json) کپی کن. سپس:

```powershell
git apply --check behtan-admin.patch
git apply behtan-admin.patch
npm ci
npm run test:admin
npm run test:payments
npm run test:meal-progress
npm run build
npm run build:admin
```

اگر apply --check خطا داد، apply را اجرا نکن؛ یعنی نسخهٔ فایل‌ها با مبنای این بسته تفاوت دارد. خروجی خطا و فایل‌های مورد اختلاف را برای تطبیق بفرست. این کار جلوی بازنویسی تغییرات جدیدت را می‌گیرد. اگر فایل‌های جدید از قبل وجود دارند نیز همین بررسی مانع بازنویسی می‌شود.

وابستگی جدیدی اضافه نشده است؛ package-lock.json فعلی حفظ می‌شود. Node 22 جدید یا بالاتر استفاده کن. فایل خروجی، .env، کلیدهای SMS و کلید service-role نباید commit شوند.

## ۲. ساخت جدول‌ها و توابع

در پروژهٔ درست Supabase، SQL Editor را باز کن. پروژهٔ فعلی به‌تن: mfnsrseymivirdmfbkrm.

فایل زیر که با patch اضافه شده را باز کن و **کل محتوایش** را در یک کوئری جدید اجرا کن:

`supabase/migrations/20260915_016_admin_console.sql`

این migration نیاز دارد migrations 001 تا 015 قبلاً اجرا شده باشند. روی دیتابیس موجود فقط 016 را اجرا کن؛ schema.sql یا migrationهای قدیمی را دوباره اجرا نکن. 016 را هم یک بار اجرا کن. تمام عملیات داخل transaction هستند؛ اگر خطا بدهد نصفه اعمال نمی‌شود.

تغییرها:

- admin_members: فهرست ادمین‌های مجاز.
- admin_audit_log: سابقهٔ تغییرات مدیریتی.
- daily_plan_snapshots: آخرین نسخهٔ کامل برنامه برای هر کاربر/روز.
- user_subscriptions: grant_source و امکان source_order_id خالی فقط برای اعطای دستی.
- RPCهای مدیریت و ذخیرهٔ برنامه؛ جداول مدیریت برای دسترسی مستقیم کاربر بسته‌اند.

برای بررسی نصب:

```sql
select
  to_regclass('public.admin_members') as admins,
  to_regclass('public.admin_audit_log') as audit,
  to_regclass('public.daily_plan_snapshots') as snapshots;
```

هر سه باید نام جدول برگردانند، نه NULL. نیازی به deploy تابع Edge جدید، تغییر secrets پیامک، merchant یا خاموش کردن RLS نیست. API این پنل RPC دیتابیس است.

## ۳. ادمین‌کردن حساب خودت

با شمارهٔ خودت یک بار ورود پیامکی واقعی انجام بده. از Authentication → Users، حسابی را پیدا کن که Phone دارد و شماره‌اش تأیید شده؛ حساب ایمیلی قدیمی را انتخاب نکن. UUID را کپی کن.

در SQL Editor، مقدار YOUR_AUTH_USER_UUID را جایگزین کن:

```sql
insert into public.admin_members(user_id)
select id from auth.users
where id = 'YOUR_AUTH_USER_UUID'::uuid
  and phone is not null
  and phone_confirmed_at is not null
on conflict(user_id) do nothing
returning user_id;
```

باید یک ردیف برگردد. اگر قبلاً اضافه شده باشد returning خالی طبیعی است؛ بررسی کن:

```sql
select user_id, created_at from public.admin_members;
```

اگر عضو نیست و insert خروجی ندارد، UUID و تأیید شماره را بررسی کن. مجوز ادمین از پروفایل/متادیتای قابل‌ویرایش توسط کاربر خوانده نمی‌شود. برای حساب ادمین کد ثابت آزمایشی Phone OTP تنظیم نکن؛ از مسیر واقعی پیامک استفاده کن.

لغو دسترسی ادمین (وقتی خودت تصمیم گرفتی):

```sql
delete from public.admin_members
where user_id = 'YOUR_AUTH_USER_UUID'::uuid;
```

پس از لغو، درخواست بعدی پنل رد می‌شود. ممکن است دادهٔ قبلاً نمایش‌داده‌شده تا بستن صفحه روی همان دستگاه باقی بماند.

## ۴. پوش و استقرار اپ اصلی

پس از موفقیت تست‌ها:

```powershell
git add src/admin src/hooks/usePlanReporting.ts src/components/dashboard/DashboardPage.tsx src/components/dashboard/MealCard.tsx supabase/migrations/20260915_016_admin_console.sql scripts/admin-database.test.mjs vite.admin.config.ts package.json .gitignore .devcontainer ADMIN_SETUP_FA.md
git diff --cached --stat
git commit -m "Add separate admin console and daily plan reporting"
git push -u origin feature/admin-console
```

در GitHub یک Pull Request از feature/admin-console به main بساز، تغییرات را بررسی و merge کن. پروژهٔ Vercel اصلی باید با همان `npm run build` و خروجی `dist` استقرار پیدا کند. Build Command اپ اصلی را به build:admin تغییر نده.

migration را قبل از انتشار اپ جدید اجرا کن. بعد از استقرار، یک کاربر دارای اشتراک داشبورد خود را باز کند؛ چند ثانیه صبر کند. ذخیرهٔ گزارش از همین نسخه شروع می‌شود. اگر migration اجرا نشده یا شبکه قطع باشد، پیام ذخیره‌نشدن برنامه در داشبورد نمایش داده می‌شود و هر ۱۵ ثانیه تلاش مجدد انجام می‌شود.

## ۵. ساخت پروژهٔ مستقل Vercel برای ادمین

در Vercel گزینه Add New → Project را انتخاب کن و **همان مخزن realSoroush/Behtan-Final** را دوباره Import کن. نام پروژه را `behtan-admin` بگذار.

| تنظیم | مقدار |
| --- | --- |
| Root Directory | همان ریشهٔ مخزن، کنار package.json؛ نه src/admin |
| Framework Preset | Vite |
| Install Command | npm ci |
| Build Command (Override) | npm run build:admin |
| Output Directory (Override) | dist-admin |
| Production Branch | main |

متغیرهای Environment Variables را برای Production در **پروژهٔ ادمین** وارد کن:

```text
VITE_SUPABASE_URL=https://mfnsrseymivirdmfbkrm.supabase.co
VITE_SUPABASE_ANON_KEY=کلید عمومی همان پروژه
VITE_TURNSTILE_SITE_KEY=Site Key ویجت Turnstile
```

مقادیر واقعی را از تنظیمات پروژهٔ فعلی‌ات کپی کن. هیچ کلید SMS.ir، merchant secret یا SUPABASE_SERVICE_ROLE_KEY برای این پنل نیاز نیست. کلید عمومی Supabase با کلید service-role متفاوت است. برای Preview فقط اگر قصد تست آن محیط را داری، همین متغیرها و hostname مجاز Turnstile را تنظیم کن.

Deploy کن. آدرس vercel.app باید صفحهٔ «ورود به پنل مدیریت به‌تن» بدهد. اگر صفحهٔ لندینگ یا آنبوردینگ اپ آمد، Build Command یا Output Directory اشتباه است. در هر push به main هر دو پروژه ممکن است دوباره deploy شوند؛ خروجی مستقل دارند و کامپوننت‌های مشترک را از همان مخزن می‌گیرند.

مرجع: https://vercel.com/docs/monorepos

## ۶. اتصال admin.behtan.fit

در **پروژه behtan-admin**، Settings → Domains → Add Domain، مقدار `admin.behtan.fit` را وارد کن.

Vercel رکورد DNS لازم را نشان می‌دهد. در Cloudflare، دامنه behtan.fit → DNS → Add record:

- Type: همان نوع پیشنهادی Vercel، معمولاً CNAME.
- Name: admin.
- Target: **دقیقاً مقدار نمایش‌داده‌شده در Vercel**؛ یک مقدار قدیمی یا حدسی استفاده نکن.
- Proxy status: برای تنظیم اولیه DNS only.
- TTL: Auto.

رکوردهای apex و www را تغییر نده. اگر رکورد admin از قبل وجود دارد، مقصد آن را با پروژهٔ جدید تطبیق بده. اگر Vercel TXT تأیید مالکیت خواست، همان را هم اضافه کن. تا Valid Configuration و صدور HTTPS صبر کن.

مرجع: https://vercel.com/docs/domains/working-with-domains/add-a-domain

## ۷. مجاز کردن دامنهٔ ادمین در Turnstile

در Cloudflare، ویجتی که Site Key آن را در پنل گذاشته‌ای باز کن. در Hostname Management مقدار `admin.behtan.fit` را اضافه کن؛ بدون https و بدون مسیر. اگر از ویجت فعلی اپ استفاده می‌کنی، hostnameهای قبلی به‌تن را نگه دار.

Site Key همان ویجت باید با Secret تنظیم‌شده در Supabase Attack Protection تطابق داشته باشد. ساده‌ترین راه استفاده از ویجت فعلی و افزودن hostname جدید است. نیازی به تغییر URL مربوط به Send SMS Hook، تنظیم Twilio یا واردکردن شمارهٔ خط پیامک نیست.

ورود این پروژه با کد پیامکی است و OAuth redirect ندارد؛ Site URL اپ اصلی را به دامنهٔ ادمین تغییر نده.

## ۸. تست واقعی بعد از استقرار

۱. admin.behtan.fit را باز کن، شمارهٔ خودت و کد پیامکی واقعی را وارد کن. لیست کاربران باید باز شود.
۲. در مرورگر خصوصی با یک حساب عادی وارد شو؛ باید پیام نداشتن دسترسی مدیریت ببینی.
۳. با حساب تست خودت در اپ اصلی، داشبورد را باز کن. یکی از غذاها را جایگزین و یک وعده را تیک بزن؛ چند ثانیه صبر کن.
۴. در پنل همان UUID را باز کن، روز درست را انتخاب و به‌روزرسانی کن. نام غذا، گرم، هدف‌ها، جمع برنامه و تیک را با اپ مقایسه کن. تغییر تیک از پنل ممکن نیست.
۵. اگر روز قدیمی برنامه ندارد، پیام «نسخهٔ کامل ذخیره نشده» درست است. ساعت/تاریخ براساس دستگاه و روز برنامه براساس مرورگر کاربر است؛ timezone در جزئیات snapshot وجود دارد.
۶. روی حساب تستِ بدون اشتراک فعال و بدون سفارش pending، اشتراک دستی با پایان ۲ دقیقه بعد بده؛ دلیل بنویس. پرداخت جدید نباید ساخته شود و درآمد نباید تغییر کند.
۷. در اپ، دسترسی را بررسی کن؛ سپس پایان را یک روز جلو ببر یا قطع فوری بزن. اپ در بررسی بعدی (معمولاً حداکثر ۳۰ ثانیه در صفحهٔ فعال، یا با رفرش) تغییر را می‌بیند. قطع اشتراک پول را برنمی‌گرداند.
۸. بخش سابقه باید ادمین، دلیل، زمان و اطلاعات قبل/بعد را نشان دهد.
۹. پرداخت واقعی را فقط از مسیر عادی اپ انجام بده؛ دکمهٔ «paid کردن دستی» عمداً وجود ندارد.

## ۹. Codespaces از صفر

بعد از merge، در GitHub مخزن realSoroush/Behtan-Final را باز کن:

۱. دکمهٔ سبز Code → تب Codespaces → Create codespace on main.
۲. فایل .devcontainer/devcontainer.json محیط Node 22 را آماده می‌کند و npm ci را اجرا می‌کند. صبر کن نصب تمام شود.
۳. Terminal → New Terminal را باز کن. اگر نصب خودکار ناموفق بود، `npm ci` را اجرا کن.
۴. در ریشه یک `.env.local` بساز و همان سه VITE_ بالا را وارد کن؛ این فایل در gitignore است. کلیدهای سرور را وارد نکن.
۵. برای اجرای پنل:

```bash
npm run dev:admin -- --host 0.0.0.0
```

۶. از تب Ports، پورت 5174 را Open in Browser کن. برای اپ، در ترمینال دوم:

```bash
npm run dev -- --host 0.0.0.0
```

اپ روی 5173 است. پورت‌ها را Private نگه دار.

۷. برای کارکرد CAPTCHA روی URL پیش‌نمایش Codespaces، hostname کامل همان URL را در ویجت Turnstile اضافه کن. با ساخت Codespace جدید ممکن است hostname عوض شود. اگر نمی‌خواهی hostname پیش‌نمایش اضافه کنی، build را در Codespaces انجام بده و ورود واقعی را روی admin.behtan.fit تست کن؛ CAPTCHA را خاموش نکن.

۸. برای تغییر جدید:

```bash
git switch main
git pull --rebase origin main
git switch -c feature/admin-improvements
```

فایل‌ها را از Explorer ویرایش و ذخیره کن. مسیرهای اصلی:

- `src/admin/AdminApp.tsx`: صفحات و عملیات مدیریت.
- `src/admin/admin.css`: چیدمان پنل.
- `src/components/dashboard/MealCard.tsx`: کارت غذای مشترک؛ تغییر آن بر اپ هم اثر دارد.
- `src/hooks/usePlanReporting.ts`: همگام‌سازی برنامه از اپ.
- `supabase/migrations/20260915_016_admin_console.sql`: ساخت اولیه؛ برای تغییر دیتابیسِ نصب‌شده migration جدید 017 بنویس، 016 اجراشده را ویرایش نکن.

۹. بعد از ویرایش:

```bash
npm run test:admin
npm run test:payments
npm run build
npm run build:admin
git status
git diff
```

فقط مسیرهایی که عمداً تغییر داده‌ای stage کن. مثال:

```bash
git add src/admin/AdminApp.tsx src/admin/admin.css
git diff --cached
git commit -m "Improve admin user details"
git push -u origin feature/admin-improvements
```

۱۰. PR بساز و پس از بررسی merge کن؛ Vercel انتشار را از main انجام می‌دهد. Codespaces خودش جایگزین هاست نیست. وقتی کار تمام شد از منوی Codespaces، Stop codespace را بزن؛ فایل‌های commit/pushنشده را قبل از حذف Codespace حفظ کن.

مرجع: https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository

## ۱۰. عیب‌یابی

| خطا | اقدام |
| --- | --- |
| ADMIN_REQUIRED | UUID حساب واردشده باید در admin_members باشد و phone_confirmed_at خالی نباشد |
| Could not find function | migration 016 را در همان Supabase که VITE_SUPABASE_URL به آن اشاره می‌کند بررسی کن |
| permission denied | با حساب ادمین و RPC وارد شو؛ GRANT عمومی یا خاموش‌کردن RLS راه‌حل نیست |
| برنامه‌ای ثبت نشده | اپ جدید باید توسط همان کاربر با اشتراک باز شده باشد؛ تاریخ و UUID را بررسی کن |
| ذخیرهٔ برنامه ناموفق | Network → save_daily_plan → Response؛ خطای پاسخ را بدون token ارسال کن |
| STALE_SUBSCRIPTION | اطلاعات تغییر کرده؛ جزئیات کاربر را به‌روزرسانی و تغییر جدید ثبت کن |
| ALREADY_ACTIVE | اشتراک فعال موجود را ویرایش کن، اشتراک موازی ایجاد نکن |
| PENDING_ORDER_EXISTS | ابتدا سفارش در حال انجام را با جریان عادی پرداخت تعیین تکلیف کن |
| CAPTCHA کار نمی‌کند | hostname و Site Key همان ویجت مرتبط با Secret سوپابیس را بررسی کن |

## نقشهٔ کار

- [x] طراحی دسترسی ادمین در دیتابیس و خروجی مستقل.
- [x] کاربران، آمار، پرداخت‌ها و مدیریت اشتراک با سابقه.
- [x] ثبت آخرین برنامهٔ روزانه و نمایش مشترک غذا و ماکروها.
- [x] تست SQL/RLS و بیلد دو اپ.
- [ ] بررسی تصویری واقعی در مرورگر؛ در محیط ساخت، دانلود Chromium به timeout خورد.
- [x] راهنمای استقرار و Codespaces.
- [ ] اجرای migration و افزودن ادمین در پروژهٔ واقعی شما.
- [ ] استقرار هر دو پروژه و تنظیم DNS/Turnstile.
- [ ] تطبیق برنامه و آزمایش OTP/اشتراک روی محیط واقعی.

تست‌های خودکار روی دیتابیس محلی PGlite اجرا شده‌اند؛ تست‌های پرداخت و ثبت وعده و بیلد اپ/ادمین موفق بودند. ارسال SMS، پرداخت بانکی و DNS حساب شما در این محیط آزموده نشده‌اند.

فایل‌ها آمادهٔ اعمال‌اند؛ این بسته به‌تنهایی چیزی را در حساب Vercel، GitHub، Cloudflare یا Supabase شما منتشر نمی‌کند.
