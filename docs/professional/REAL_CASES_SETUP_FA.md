# نصب پرونده واقعی و PDF به‌تن — نسخه اصلاح‌شده v2

این بسته **جایگزین کامل بسته v1** است، نه پچ مکمل آن. فرض: پچ v1 و Migration 025 قبلی را اجرا نکرده‌اید؛ فازهای 023 و 024 نصب‌اند. فقط فایل `behtan-pro-real-cases-v2.patch` را روی نسخه قبل از v1 اعمال کنید. هیچ فایل changed-files را هم‌زمان کپی نکنید. این بسته روی مخزن آنلاین push نشده و هیچ تغییر آنلاین در Supabase/Vercel انجام نشده است.

## چه چیزهایی دارد؟

پرونده با نام و شماره اختیاری؛ تاریخ تولد شمسی، مشخصات جسمی، هدف و فعالیت، ترجیحات و محدودیت‌ها؛ تاریخچه تغییرات؛ برنامه روز استراحت و تمرین؛ ۱ تا حداکثر ۴ منوی سازگار در هر وعده؛ ذخیره نسخه ثابت و چاپ فارسی A4. تعداد گزینه‌های معتبر ممکن است کمتر از چهار باشد. نام در سؤال اول B2C، پیش‌نویس و user_profiles.display_name ثبت می‌شود؛ نام کاربران قدیمی می‌تواند NULL بماند و مجبور به تکرار آنبوردینگ نیستند.

تفاوت اصلی v2: برنامه فقط روی سرور و از اطلاعات ذخیره‌شده پرونده و کاتالوگ/سیاست Supabase ساخته می‌شود. مرورگر پاسخ‌ها، غذاها یا اعداد تغذیه را برای تولید/ذخیره برنامه ارسال نمی‌کند. سرور پیش‌نمایش را نگه می‌دارد؛ تأیید فقط شناسه همان پیش‌نمایش را ذخیره می‌کند. API مستقیم قدیمی ذخیره snapshot برای authenticated مسدود است. خطای شبکه در بررسی فرم یا فضای کاری، ویرایش را از حافظه پاک نمی‌کند؛ لغو واقعی دسترسی همچنان محتوا را پنهان می‌کند.

## ۱. آماده‌سازی PowerShell و شاخه

ZIP را بیرون پروژه استخراج کنید؛ فقط فایل patch را کنار package.json کپی کنید.

```powershell
cd E:\Behtan-Final
git status --short
git switch main
git pull --ff-only origin main
git switch -c feature/pro-real-cases-v2
git apply --check behtan-pro-real-cases-v2.patch
```

پیش از switch، تغییرات دستی خودتان باید ذخیره/commit شده باشند. اگر --check خطا داد ادامه ندهید؛ force/reset نزنید. این پچ روی نسخه فاز 2a قبل از بسته v1 است و نباید روی v1 دوباره اعمال شود.

پس از check بدون خطا:

```powershell
git apply behtan-pro-real-cases-v2.patch
npm ci
npm run test:pro
npm run test:production
npm run test:onboarding
npm run test:protein
npm run test:feasibility
npm run build
npm run build:admin
npm run build:pro
```

## ۲. تست مرورگر و ساخت PR، بدون Merge

```powershell
npx playwright install chromium
npm run test:pro:browser
```

اگر مرورگر Playwright روی ویندوز نصب نمی‌شود ولی Microsoft Edge نصب است:

```powershell
$env:PRO_BROWSER_EXECUTABLE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
Test-Path $env:PRO_BROWSER_EXECUTABLE
npm run test:pro:browser
Remove-Item Env:PRO_BROWSER_EXECUTABLE
```

فقط اگر Test-Path برابر True باشد از مسیر Edge استفاده کنید. در غیر این صورت تست مرورگر CI را مبنا قرار دهید و تست را از workflow حذف نکنید.

برای stage دقیق فایل‌های پچ، بدون اضافه‌کردن .env، ZIP یا فایل patch:

```powershell
$patchPaths = git apply --numstat behtan-pro-real-cases-v2.patch | ForEach-Object { ($_ -split "`t", 3)[2] }
git add -- $patchPaths
git diff --cached --stat
git diff --cached --check
git commit -m "Add server-authoritative Pro cases, menu plans and Persian PDF"
git push -u origin HEAD
```

PR بسازید و قبل از Merge نتیجه workflow Professional foundation را ببینید:
https://github.com/realSoroush/Behtan-Final/compare/main...feature/pro-real-cases-v2

CI تست PostgreSQL واقعی، مرورگر و رگرسیون‌ها را اجرا می‌کند. خودمان PostgreSQL بومی یا اتصال واقعی Supabase را در این محیط اجرا نکرده‌ایم. برای اجرای test:pro:native از دیتابیس تست خالی استفاده شود؛ هرگز URL دیتابیس اصلی را به تست ندهید.

## ۳. تنظیم دو متغیر فقط در پروژه Vercel پنل Pro

در Vercel پروژه **behtan-pro**، Settings → Environment Variables:

| نام | مقدار |
| --- | --- |
| PRO_SERVER_PLANS_ENABLED | true |
| SUPABASE_SERVICE_ROLE_KEY | کلید server-only پروژه Supabase فعلی به‌تن |

کلید را از بخش API Keys پروژه Supabase، قسمت کلیدهای legacy service_role بردارید. آن را در چت، مخزن یا متغیری با پیشوند VITE_ نگذارید. این دو تنظیم برای پروژه Pro هستند؛ به پروژه‌های B2C و ادمین اضافه نکنید. مقادیر public فعلی VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY و VITE_PRO_SANDBOX_ENABLED=true حفظ شوند. اسم sandbox صرفاً برای سازگاری با تنظیم قبلی باقی مانده است.

Node.js پروژه Pro روی 24.x قرار بگیرد. Build Command همان `npm run build:pro`، Output Directory همان `dist-pro` و Install Command همان `npm ci` است. فایل vercel.json زمان اجرای API جدید را تنظیم می‌کند. پس از تغییر env، انتشار تازه لازم است؛ دیپلوی پس از Merge این تنظیمات را می‌گیرد.

مرجع پیکربندی API و زمان اجرا:
https://vercel.com/docs/functions/runtimes/node-js
https://vercel.com/docs/functions/configuring-functions/duration

## ۴. اجرای تنها Migration 025 اصلاح‌شده پیش از Merge

از دیتابیس بکاپ بگیرید. در SQL Editor همان Supabase اصلی به‌تن:

```sql
select to_regclass('public.pro_case_records') as phase_2a,
       to_regclass('public.pro_real_cases') as real_cases,
       to_regclass('public.pro_server_plan_drafts') as server_drafts;
select column_name from information_schema.columns
where table_schema='public' and table_name='user_profiles' and column_name='display_name';
```

phase_2a باید موجود باشد؛ real_cases و server_drafts باید NULL و کوئری دوم بدون ردیف باشد. اگر این شرایط برقرار نبود، برای بررسی وضعیت توقف کنید؛ جدول یا ستون را حذف نکنید و migration را دوباره اجرا نکنید.

کل فایل زیر از مخزن پچ‌شده را یک بار و یکجا اجرا کنید:

`supabase/migrations/20261021_025_pro_real_cases_and_names.sql`

Migration 023 و 024، schema.sql و seedها را تکرار نکنید. این migration افزایشی و در تراکنش است. اطلاعات قبلی را پاک نمی‌کند.

بعد از اجرا:

```sql
select to_regclass('public.pro_real_cases'),
       to_regclass('public.pro_real_intake_versions'),
       to_regclass('public.pro_real_plans'),
       to_regclass('public.pro_server_plan_drafts');
select has_function_privilege('authenticated',
 'public.pro_save_real_plan(uuid,uuid,integer,jsonb,uuid)','execute') as client_snapshot_write,
 has_function_privilege('authenticated',
 'public.pro_stage_server_plan(uuid,uuid,integer,uuid,uuid,jsonb,jsonb)','execute') as client_server_write;
```

چهار جدول باید موجود و هر دو مجوز در کوئری آخر false باشند.

## ۵. Merge و تست کاربردی

پس از موفقیت CI، تنظیم env و SQL، PR را Merge کنید. Vercel باید دیپلوی جدید هر اپ را کامل کند. در Pro:

1. با حساب فعلی وارد و فضای کاری را انتخاب کنید؛ مجوز آزمایشی زمان‌دار قبلی باید هنوز فعال باشد.
2. پرونده جدید بسازید، نام و اطلاعات را پر و ذخیره کنید.
3. تعداد منو و تاریخ و توضیحات را تعیین و «تولید و پیش‌نمایش برنامه» را بزنید.
4. مواد، مقدارها و ماکروها را بررسی و «ذخیره این برنامه» را بزنید.
5. «خروجی PDF / چاپ» → Save as PDF → A4؛ سربرگ و پاورقی مرورگر خاموش، popup سایت مجاز.
6. پرونده را ببندید و باز کنید؛ برنامه ذخیره‌شده باید همان نسخه قبلی باشد.
7. وزن را تغییر دهید ولی ذخیره نکنید، اینترنت را موقت قطع کنید و به تب برگردید؛ فرم باید پاسخ ویرایش‌شده را حفظ کند. پس از وصل‌شدن، بررسی دوره‌ای حداکثر حدود ۳۰ ثانیه بعد تکرار می‌شود؛ فرم قابل ادامه است. رفرش کامل صفحه، حافظه ذخیره‌نشده را حفظ نمی‌کند و مرورگر پیش از خروج هشدار می‌دهد.
8. در B2C با حساب تست نام را در اولین سؤال پر کنید؛ خروج و ادامه آنبوردینگ و تکمیل پروفایل را بررسی کنید. کاربر قدیمی نباید دوباره به آنبوردینگ برگردد.

اگر پیام «سرویس ساخت برنامه هنوز تنظیم نشده» دیدید، env سرور Pro و دیپلوی تازه را بررسی کنید. خطای 404 مسیر /api/pro-plan یعنی انتشار API باید بررسی شود؛ رژیم را از راه مستقیم دیتابیس ذخیره نکنید.

## اجرای لوکال Pro

دو متغیر سرور را فقط در فایل .env.local که در git نادیده گرفته می‌شود قرار دهید؛ مقادیر public فعلی هم باید موجود باشند. سپس `npm run dev:pro`؛ API محلی روی همین سرور Vite راه‌اندازی می‌شود. کلید واقعی را commit نکنید. تست‌های خودکار به کلید واقعی نیاز ندارند.

## محدودیت‌های شفاف این نسخه

- پیش‌نمایش ذخیره‌نشده ۳۰ دقیقه معتبر است؛ پس از انقضا دوباره تولید کنید. فعلاً هر حساب حداکثر ۲۰ پیش‌نمایش تازه در ساعت می‌تواند بسازد. پیش‌نمایش‌ها رکورد سروری‌اند، برنامه‌های تأییدشده نسخه‌های جدا و ثابت دارند. انقضای پیش‌نمایش به معنی پاک‌شدن خودکار ردیف آن نیست؛ سیاست نگهداری/پاک‌سازی داده باید پیش از گسترش استفاده نهایی شود.
- ویرایش دستی گرم مواد، اتصال پرونده به حساب OTP بیمار، پیامک دعوت و مدیریت تخصیص بین کارشناسان هنوز در این بسته نیست.
- فرم Pro ورودی‌های تغذیه ضروری را دارد و عین تمام جزئیات رفتاری آنبوردینگ B2C نیست. انتخاب سطح فعالیت در Pro مستقیم است. نام فعلاً در فرم، پروفایل و خروجی استفاده می‌شود؛ پیام‌های شخصی مسکات در این تغییر بازنویسی نشده‌اند.
- فهرست حداکثر ۲۰۰ پرونده اخیر و تاریخچه حداکثر ۱۰۰ نسخه اخیر دارد؛ جست‌وجو روی همان فهرست است.
- مالک به پرونده‌های سازمان خودش و کارشناس به پرونده‌های خودش دسترسی دارد؛ نقش پذیرش به اطلاعات تغذیه دسترسی ندارد. SMS/پرداخت یا اتصال بیمار بخشی از این تست نیست.
- کلید server-only برای انتشار API جدید ضروری است. به سرور دسترسی ممتاز می‌دهد؛ در مرورگر استفاده نشده و فعال‌سازی پیش‌فرض خاموش است. هیچ بررسی محلی به معنی تأیید الزامات انتشار عمومی داده سلامت نیست.
