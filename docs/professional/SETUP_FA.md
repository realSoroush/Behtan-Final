# نصب و بررسی فاز اول به‌تن حرفه‌ای

این بسته **زیرساخت آزمایش داخلی** است؛ هنوز نسخهٔ آمادهٔ استفاده با بیمار واقعی نیست. هیچ تغییر خودکار در Supabase یا Vercel انجام نشده است. مایگریشن ۰۲۳ افزایشی است و کد B2C، تعرفه‌ها، موتور تغذیه و جدول‌های مصرف‌کننده را تغییر نمی‌دهد.

## ۱. اعمال پچ در Codespaces

ابتدا فایل `behtan-pro-phase-1.patch` را کنار `package.json` آپلود کنید. شاخهٔ فعلی باید بدون تغییر ذخیره‌نشده باشد. اگر شاخهٔ زیر از قبل وجود دارد، به‌جای ساخت دوباره به همان شاخه بروید.

```bash
git status
git switch main
git pull --rebase origin main
git switch -c feature/pro-phase-1-foundation
git apply --check behtan-pro-phase-1.patch
git apply behtan-pro-phase-1.patch
npm ci
npm run test:pro
npm run test:production
npm run test:admin
npm run test:diagnostics
npm run build
npm run build:admin
npm run build:pro
npx playwright install --with-deps chromium
npm run test:pro:browser
```

پچ بر مبنای `61f0d19` است. اگر بررسی پچ خطا داد، آن را با `--reject` یا جایگزینی فایل‌ها تحمیل نکنید؛ ابتدا تفاوت نسخه بررسی شود. مرورگرِ تست به API مصنوعی وصل می‌شود و SMS واقعی نمی‌فرستد. دیتابیس تستِ پیش‌فرض داخل حافظه است و به Supabase وصل نمی‌شود.

## ۲. آماده‌سازی Supabase آزمایشی

یک پروژهٔ **Staging جدا از Production** لازم است. این بسته ایجاد پروژه یا کپی دادهٔ واقعی را انجام نمی‌دهد. ساختار B2C و مهاجرت‌های فعلی تا ۰۲۲ باید در آن موجود باشند؛ `schema.sql` به‌تنهایی جایگزین تمام مهاجرت‌ها و کاتالوگ نیست. مراحل قدیمی را روی دیتابیس دارای جدول‌ها دوباره اجرا نکنید. قبل از اجرا، نام پروژه را در SQL Editor بررسی کنید.

فقط فایل زیر را یک‌بار در SQL Editor پروژهٔ Staging اجرا کنید:

```
supabase/migrations/20261019_023_pro_foundation.sql
```

SQL در تراکنش اجرا می‌شود. در صورت خطا ادامه ندهید؛ مشکل را اصلاح و وضعیت تراکنش را بررسی کنید. برای بررسی افزوده‌شدن جدول‌ها:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname='public' and tablename like 'pro_%'
order by tablename;
```

هفت جدول باید RLS فعال داشته باشند. `pro_private` را به Exposed Schemas اضافه نکنید. نقش‌های عمومی اجازهٔ نوشتن مستقیم ندارند.

OTP واقعی Staging و CAPTCHA را با تنظیمات فعلی Auth فعال نگه دارید؛ سرویس ارسال OTP را غیرفعال نکنید. آدرس توسعه/Preview را در تنظیمات CAPTCHA و تنظیمات مجاز Auth ثبت کنید. با حساب تست خودتان در Staging وارد شوید؛ سپس UUID همان حساب را در SQL زیر جایگزین کنید. این کوئری فقط حسابی با شمارهٔ تأییدشده را مجاز می‌کند و دسترسی هفت‌روزه می‌دهد:

```sql
insert into public.pro_pilot_access(user_id,expires_at)
select id, now()+interval '7 days'
from auth.users
where id='YOUR_STAGING_AUTH_USER_UUID'::uuid
  and phone is not null and phone_confirmed_at is not null
on conflict(user_id) do update set expires_at=excluded.expires_at
returning user_id,expires_at;
```

اگر هیچ سطری برنگشت، حساب/تأیید شماره درست نیست. UUID یا شمارهٔ بیمار واقعی استفاده نشود. وجود حساب در `admin_members` مجوز ورود به Pro نمی‌دهد.

## ۳. اجرای پنل

در فایل محلی `.env.local` فقط مقادیر عمومی پروژهٔ Staging را قرار دهید؛ این فایل نباید commit شود:

```dotenv
VITE_SUPABASE_URL=https://YOUR-STAGING-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-STAGING-ANON-KEY
VITE_AUTH_DRIVER=supabase
VITE_TURNSTILE_SITE_KEY=YOUR-STAGING-SITE-KEY
VITE_PRO_SANDBOX_ENABLED=true
```

سپس `npm run dev:pro` را اجرا و پورت ۵۱۷۵ را باز کنید. با OTP وارد شوید، محیط آزمایش بسازید و پروندهٔ مصنوعی اضافه کنید. فیلد نام، شماره و اطلاعات پزشکی عمداً وجود ندارد. هر مالک دعوت‌شده یک محیط و هر محیط حداکثر ۱۰۰ پرونده می‌سازد. نقش مالک به‌تنهایی مجوز درمان نیست. تاریخ انقضای دسترسی در دیتابیس اعمال می‌شود؛ UI flag مجوز امنیتی نیست.

برای قطع دسترسی آزمایش:

```sql
update public.pro_pilot_access
set expires_at=now()
where user_id='YOUR_STAGING_AUTH_USER_UUID'::uuid;
```

برای تعلیق یک محیط:

```sql
update public.pro_organizations
set status='suspended'
where id='YOUR_STAGING_ORGANIZATION_UUID'::uuid;
```

نکتهٔ نگهداری داده: کلیدهای خارجی جدید، حذف مستقیم حسابِ دارای سازمان/عضویت/رویداد را محدود می‌کنند. اسکریپت قدیمی «پاک‌کردن همهٔ کاربران» برای این ساختار کافی نیست؛ پاک‌سازی یا انتقال مالکیت باید جداگانه طراحی شود. در این فاز صرفاً دسترسی را منقضی/محیط را تعلیق کنید.

تغییر اعضا و تخصیص آزمایشی فعلاً عملیات زیرساختی SQL/Service است؛ فرم خودخدمتی و دعوت تیم در فاز بعد ساخته می‌شود. نقش `service_role` یا کلید مدیریتی را در مرورگر/متغیر VITE قرار ندهید.

## ۴. اجرای PostgreSQL واقعی و CI

`npm run test:pro` از PGlite استفاده می‌کند. برای اجرای همان مجموعه روی PostgreSQL واقعی، یک دیتابیس **خالی و قابل حذف** با نام دقیق `behtan_pro_test` بسازید. ابزار تست اگر نام دیگری باشد یا جدول عمومی/Auth وجود داشته باشد متوقف می‌شود. این ابزار برای دیتابیس Supabase موجود نیست.

```bash
PRO_TEST_DATABASE_URL=postgres://postgres:YOUR_LOCAL_TEST_PASSWORD@localhost:5432/behtan_pro_test npm run test:pro:native
```

برای اجرای دوباره، دیتابیس تستِ دورریختنی را از نو بسازید. فایل `.github/workflows/pro-foundation.yml` همین کار را در PostgreSQL 17 سرویس CI انجام می‌دهد. تست هم‌زمانی فقط در حالت Native اجرا می‌شود؛ اجرای موفق CI و بررسی Staging قبل از هر انتشار الزامی است. در بررسی baseline یک خطای قدیمی در `npm run test:protein` برای سناریوی ۱۲۵ کیلوگرم/افزایش وزن/گیاه‌خواری لاکتواوو بازتولید شد؛ در این فاز موتور را برای سبزشدن تست تغییر نداده‌ایم. گزارش دقیق در `TEST_REPORT.md` است و CI عمداً آن را مخفی نمی‌کند.

تست مرورگر فعلی transport را شبیه‌سازی می‌کند و جای E2E واقعی OTP/PostgREST نیست.

## ۵. Vercel و انتشار

فعلاً `pro.behtan.fit` را به این فاز عمومی وصل نکنید. برای Preview خصوصی یک پروژهٔ مستقل از همان مخزن بسازید:

- Build Command: `npm run build:pro`
- Output Directory: `dist-pro`
- Install Command: `npm ci`
- متغیرها: فقط مقادیر عمومی **Staging** بالا؛ دسترسی Preview محدود باشد.

تنظیمات پروژه‌های فعلی B2C و Admin عوض نشوند. پروفایل/اشتراک B2C پس از OTP همان رفتار فعلی را دارد؛ این فاز به بیمار برنامه نمی‌دهد و خرید را دور نمی‌زند. برای خاموش‌کردن پنل، flag را `false` و دوباره build کنید؛ برای قطع واقعی دسترسی از انقضا/تعلیق SQL استفاده کنید. جدول‌ها را در rollback حذف نکنید؛ بازگشت فرانت‌اند و بستن دسترسی کافی است.

## ۶. ذخیرهٔ تغییرات در GitHub برای بازبینی

```bash
git add .env.example .gitignore package.json package-lock.json
git add src/professional vite.pro.config.ts playwright.pro.config.ts
git add scripts/pro-contracts.test.mjs scripts/pro-database.test.mjs tests/pro
git add scripts/nutrition-diagnostics.smoke-test.mjs
git add supabase/migrations/20261019_023_pro_foundation.sql
git add docs/professional .github/workflows/pro-foundation.yml
git diff --cached --stat
git commit -m "Add isolated Professional sandbox foundation"
git push -u origin feature/pro-phase-1-foundation
```

خود پچ را commit نکنید. PR بسازید، نتایج CI را ببینید و اثر تغییرات را در Staging بررسی کنید. این راهنما مجوز انتشار بالینی نیست؛ گیت‌های پزشکی، حقوقی، امنیت و نسخهٔ نهایی در `ARCHITECTURE.md` آمده‌اند.
