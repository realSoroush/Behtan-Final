# نصب مدیریت و عملیات Pro — پس از نسخه real-cases-v2

این بسته مکمل نسخه v2 نصب‌شده است؛ جایگزین یا تکرار Migration 025 نیست. مبنا: main در commit 67437eb020e5925b7b650a1a318c218f0a225486 (Merge PR #12). اتصال بیمار به اپ و دعوت پیامکی اضافه نشده است. هیچ انتشار آنلاین، اجرای SQL اصلی، پیامک یا تغییر تنظیم Vercel توسط این بسته انجام نشده است.

## ابتدا رفع پیام فعلی ساخت برنامه

پیام «سرویس ساخت برنامه هنوز تنظیم نشده» در نسخه v2 ممکن است هم از تنظیمات ناقص و هم از پاسخ غیر JSON مثل صفحه 404/خطای تابع بیاید. این پیام به‌تنهایی علت را ثابت نمی‌کند و نقش owner مشکل آن را توضیح نمی‌دهد.

در Vercel فقط پروژه behtan-pro → Environment Variables → Production را بررسی کنید:

- PRO_SERVER_PLANS_ENABLED دقیقاً true، بدون علامت نقل‌قول یا فاصله باشد.
- SUPABASE_SERVICE_ROLE_KEY مقدار واقعی کلید service_role همان Supabase به‌تن باشد؛ نامش نباید با VITE_ شروع شود.
- VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY همان پروژه فعلی باشند و برای Production ثبت شده باشند.
- پس از ذخیره env، آخرین انتشار Production را Redeploy کنید. تغییر env روی دیپلوی قبلی اثر ندارد. کلید را در چت یا git قرار ندهید.

اگر همچنان پیام باقی بود، DevTools → Network → درخواست POST /api/pro-plan را بررسی کنید. فقط Status و Response بدون Authorization/توکن را برای بررسی بفرستید. در نسخه جدید دکمه «بررسی سرویس ساخت برنامه» نیز وجود دارد: وجود API، کامل‌بودن env، اعتبار کلید سروری و نسخه Migration را جدا بررسی می‌کند. خطاهای احراز هویت یا اتصال با «تنظیم نشده» یکی نیستند. پاسخ GET بدون توکن برای عیب‌یابی کافی نیست؛ دکمه از نشست خودتان استفاده می‌کند.

## ۱. اعمال پچ روی مخزن لوکال

ZIP را بیرون E:\Behtan-Final استخراج و فقط behtan-pro-operations.patch را کنار package.json کپی کنید. changed-files فقط برای بازبینی است؛ آن را هم‌زمان کپی نکنید.

```powershell
cd E:\Behtan-Final
git status --short
git switch main
git pull --ff-only origin main
git switch -c feature/pro-operations
git apply --check behtan-pro-operations.patch
```

اگر تغییر دستی دارید ابتدا آن را حفظ/commit کنید. اگر --check خطا داد ادامه ندهید و force/reset نزنید. پس از check بدون خطا:

```powershell
git apply behtan-pro-operations.patch
npm ci
npm run test:pro
npm run test:production
npm run test:admin
npm run test:onboarding
npm run test:protein
npm run test:feasibility
npm run build
npm run build:admin
npm run build:pro
npx playwright install chromium
npm run test:pro:browser
npm run test:pro:admin:browser
```

## ۲. پوش و ساخت PR، بدون Merge

```powershell
$patchPaths = git apply --numstat behtan-pro-operations.patch | ForEach-Object { ($_ -split "`t", 3)[2] }
git add -- $patchPaths
git diff --cached --stat
git diff --cached --check
git commit -m "Add Pro administration, access licenses, pagination and operations"
git push -u origin HEAD
```

PR:
https://github.com/realSoroush/Behtan-Final/compare/main...feature/pro-operations

در Checks منتظر Professional foundation بمانید. این workflow اکنون PostgreSQL واقعی، تست هم‌زمانی ادمین، dump/restore دیتابیس مصنوعی و مقایسه داده/مجوزها و تست مرورگر هر دو پنل را اجرا می‌کند. تست recovery فقط دو دیتابیس تست با نام‌های ثابت می‌پذیرد؛ URL اصلی Supabase را به تست‌ها ندهید.

## ۳. Migration 026 در همان Supabase اصلی

بعد از بکاپ، در SQL Editor:

```sql
select to_regclass('public.pro_server_plan_drafts') as phase_025,
       to_regclass('public.pro_workspace_licenses') as phase_026;
```

اولی باید موجود و دومی NULL باشد. در غیر این صورت وضعیت را بررسی کنید و migration را تکرار نکنید.

کل فایل زیر را یک بار و یکجا اجرا کنید:

supabase/migrations/20261021_026_pro_operations.sql

Migration 025 یا schema/seed را دوباره اجرا نکنید. این تغییر افزایشی است و مجوز دستی برای کسی ایجاد نمی‌کند؛ دسترسی آزمایشی موجود تا زمان ایجاد مجوز دستی حفظ می‌شود.

```sql
select to_regclass('public.pro_workspace_licenses'),
       to_regclass('public.pro_license_audit'),
       to_regclass('public.pro_failure_events'),
       to_regclass('public.pro_maintenance_runs'),
       to_regclass('public.pro_admin_workspace_commands');
select has_function_privilege('authenticated','public.pro_service_status()','execute') as client_probe,
       has_function_privilege('authenticated','public.pro_report_failure(uuid,uuid,uuid,text,text)','execute') as client_log_write;
```

پنج جدول موجود و هر دو مجوز آخر false باشند. اجراشدن migration با سبزشدن CI یکی نیست؛ هر دو لازم‌اند.

## ۴. انتشار و تست پنل‌ها

پس از SQL و CI موفق PR را Merge کنید و Deploy هر سه پروژه را بررسی کنید. تنظیم env جدیدی نسبت به v2 لازم نیست؛ دو متغیر سروری فقط در behtan-pro بمانند.

در admin.behtan.fit با اکانت ادمین پلتفرم وارد و تب «مدیریت Pro» را باز کنید. owner فضای کاری به‌تن Pro، خودبه‌خود ادمین پلتفرم نیست.

- فهرست: فضای کاری، اعضا/شماره‌ها، تعداد پرونده و برنامه، اعتبار و ظرفیت.
- «مدیریت Pro»: تنظیم وضعیت، تاریخ، ظرفیت و دلیل تغییر. هر تغییر نسخه و تاریخچه دارد؛ تغییر هم‌زمان دو ادمین بی‌صدا بازنویسی نمی‌شود.
- «فعال‌سازی پنل برای کاربر»: UUID یک حساب OTP تأییدشده را از فهرست کاربران بردارید؛ نام پنل، مدت، ظرفیت و دلیل را پر کنید. فضای کاری و نقش owner با مجوز دستی ساخته می‌شوند. برای کاربر دارای فضای کاری دوباره پنل نمی‌سازیم؛ همان را تمدید کنید. این مسیر حساب Auth یا پیامک نمی‌سازد.
- این مجوزها دستی‌اند؛ سفارش یا درآمد نیستند. پرداخت Pro هنوز پیاده‌سازی نشده است. وضعیت سفارش/درآمد Pro نمایش ساختگی ندارد.
- اعتبار منقضی با وضعیت فعال: مشاهده/دانلود قبلی مجاز؛ ساخت و ویرایش ممنوع.
- وضعیت معلق: دسترسی سازمان، حتی با pilot معتبر، بسته می‌شود. نقش حذف نمی‌شود و با فعال‌سازی مجدد همان پرونده‌ها برمی‌گردند.
- ظرفیت، تعداد کل پرونده‌هاست؛ مفهوم آرشیو/مراجع فعال هنوز اضافه نشده است. کاهش ظرفیت چیزی را پاک نمی‌کند؛ فقط پرونده جدید محدود می‌شود.

در Pro:

1. «بررسی سرویس ساخت برنامه» را بزنید. پس از تأیید، یک پرونده تست بسازید و تولید/PDF را امتحان کنید.
2. نام یا شماره را جستجو کنید. جستجو روی کل دیتابیس و با رعایت دسترسی است؛ فهرست ۲۵تایی و بدون بارگیری پاسخ‌های پزشکی است.
3. تاریخچه اطلاعات و برنامه‌ها صفحه‌های ۱۰تایی دارند؛ دیگر سقف نمایش ۱۰۰ نسخه وجود ندارد.
4. یک مجوز دستی پایان‌یافته تست کنید: مشاهده/PDF برقرار و ذخیره/تولید غیرفعال باشد؛ سپس تمدید کنید.
5. اگر تولید خطا داد، کد پیگیری کنار پیام را در مدیریت Pro → همان فضای کاری → خطاها و لاگ Vercel تطبیق دهید. لاگ دیتابیس فقط کد، زمان و شناسه‌هاست؛ توکن، شماره، پاسخ پزشکی، یادداشت و exception خام ذخیره نمی‌شود. خطاهای قبل از احراز هویت/تنظیم سرور ممکن است فقط در لاگ Vercel ثبت شوند. ثبت دیتابیس حداکثر ۱۰۰ خطا در ساعت برای هر حساب دارد.

## ۵. پاک‌سازی و زمان‌بندی

دکمه «پاک‌سازی داده‌های موقت» در ادمین پس از تأیید شما هر بار حداکثر ۵۰۰ پیش‌نمایش و ۵۰۰ خطای قدیمی را بررسی می‌کند:

- پیش‌نمایش تأییدنشده: بیش از ۲۴ ساعت از انقضای ۳۰ دقیقه‌ای آن گذشته باشد.
- پیش‌نمایش مطابق یک برنامه تأییدشده حفظ می‌شود تا تلاش مجدد ذخیره قبلی سالم بماند.
- خطاهای بیش از ۹۰ روز حذف می‌شوند.
- برنامه تأییدشده، پرونده، نسخه ورودی و تاریخچه مجوز پاک نمی‌شوند.

برای زمان‌بندی ساعتی، در Supabase Cron یک Job با نام behtan-pro-cleanup، زمان‌بندی `17 * * * *` و SQL زیر بسازید:

```sql
select public.pro_service_cleanup(gen_random_uuid());
```

Job باید در محیط مدیریتی دیتابیس اجرا شود، نه با JWT مرورگر. هیچ کلیدی داخل job لازم نیست. migration به‌تنهایی Job نصب نمی‌کند. اگر Job با همین نام وجود دارد، همان را بررسی کنید و دومی نسازید. نتیجه هر اجرا در pro_maintenance_runs ثبت می‌شود. برای backlog بزرگ چند اجرای بعدی لازم است.

مرجع رسمی Cron:
https://supabase.com/docs/guides/cron/quickstart

## ۶. بکاپ و بازیابی

راهنمای RECOVERY_RUNBOOK_FA.md و فایل فقط‌خواندنی RESTORE_VERIFY.sql را ببینید. تست CI، دیتابیس مصنوعی خودش را dump/restore می‌کند؛ بکاپ یا بازیابی Production توسط این بسته انجام نشده است. فایل‌های واقعی Storage و تنظیمات Auth/Edge/Vercel باید جداگانه در برنامه بازیابی ثبت شوند.
