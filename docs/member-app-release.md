# نصب نسخهٔ نهایی اپ اعضای به‌تن

این بسته روی main با شناسهٔ `425fb376c9dae5c663f46358c1548813d7d952fc` ساخته شده است؛ همان نسخه‌ای که لندینگ Relay در آن ادغام شده است. همهٔ تغییرات اپ از پیش‌نمایش‌های قبلی داخل همین پچ هستند. پچ‌های قبلی اپ را قبل از این بسته اجرا نکن.

## چه چیزی اضافه شده؟

- صفحهٔ اصلی با وعدهٔ بعدی، انتخاب سه روز، انرژی و ماکروهای جمع‌وجور و شخصیت تعاملی به‌تن.
- برنامهٔ امروز و هفته، بشقاب‌های SVG، تغییر و جایگزینی واقعی منو و روند ثبت غذا.
- پنجرهٔ تأیید با به‌تن برای ثبت وعدهٔ برنامه و غذای بررسی‌شده با عکس. بستن یا انصراف هیچ غذایی ثبت نمی‌کند.
- دکمهٔ بازگرداندن روی کارت وعده‌های ثبت‌شدهٔ امروز، بدون نیاز به بازکردن جزئیات.
- حرکت نرم پنجره‌ها و کارت‌ها، حالت فشردن دکمه‌ها، پشتیبانی از کاهش حرکت و رنگ‌های هماهنگ در حالت روشن و تاریک.

## ۱. پچ را روی پروژه اعمال کن

ZIP را در Downloads باز کن؛ پوشهٔ `behtan-member-final-v1` باید بیرون پوشهٔ مخزن باشد. ابتدا پروژه را به آخرین main برسان. اگر `git status` تغییر شخصی نشان می‌دهد، قبل از ادامه آن را جداگانه ذخیره کن؛ اسکریپت روی پروژهٔ دارای تغییر اجرا نمی‌شود.

```powershell
cd E:\Behtan-Final
git status --short
git switch main
git pull --ff-only origin main
git switch -c feature/member-app-final
$bundle = "$env:USERPROFILE\Downloads\behtan-member-final-v1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$bundle\Apply-Member-Update.ps1" -Repo "E:\Behtan-Final"
```

مسیر `$bundle` را مطابق محل استخراج خودت اصلاح کن. اسکریپت ابتدا سازگاری پچ را بررسی می‌کند و فقط بعد از موفقیت آن را اعمال می‌کند. اگر پچ سازگار نبود، خروجی خطا را نگه دار و ادامه نده. این اسکریپت چیزی را به GitHub یا Supabase ارسال نمی‌کند.

## ۲. نصب و تست محلی

Node.js 24 را مطابق CI پروژه استفاده کن. فایل `.env` فعلی خودت را نگه دار؛ `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` باید مربوط به همان پروژهٔ Supabase باشند.

```powershell
npm ci
node --experimental-strip-types scripts/member-redesign.test.mjs
node --experimental-strip-types scripts/member-meal-confirmation.test.mjs
node --experimental-strip-types scripts/member-meal-rotation.test.mjs
node --experimental-strip-types scripts/member-dialog-scroll.test.mjs
node --experimental-strip-types scripts/food-scan.test.mjs
node scripts/food-scan-edge.test.mjs
npm run test:meal-progress
npm run test:progress
npm run build
```

تست‌های SQL بالا در پایگاه دادهٔ آزمایشی داخل حافظه اجرا می‌شوند و به دیتابیس واقعی دست نمی‌زنند. برای اجرای اپ واقعی، مرحلهٔ بعد را هم انجام بده. فایل HTML داخل ZIP مستقل است و با دادهٔ نمونه کار می‌کند؛ اسکن آن پاسخ نمونه دارد و عکس را ارسال نمی‌کند.

## ۳. Migration 032 و 033 را اجرا کن

با توجه به اینکه 032 را اجرا نکرده‌ای، ابتدا آن و سپس 033 را در SQL Editor همان پروژهٔ Supabase اجرا کن. قبل از تغییر پایگاه داده، نسخهٔ پشتیبان فعلی پروژه را نگه دار. فایل‌های قدیمی، `schema.sql` و seed را دوباره اجرا نکن.

برای بررسی وضعیت فعلی این کوئری فقط‌خواندنی را بزن:

```sql
select
 to_regprocedure('public.billing_has_access()') as billing_ready,
 to_regclass('public.daily_plan_snapshots') as plans_ready,
 to_regclass('public.daily_meal_checkins') as checkins_ready,
 to_regclass('public.member_meal_schedule') as migration_032,
 to_regclass('public.member_food_scan_usage') as migration_033;
```

سه مقدار اول باید نام شیء را نشان بدهند. اگر null هستند، ساختار قبلی پروژه کامل نیست؛ ادامه نده. دو مقدار آخر قبل از نصب این آپدیت باید null باشند. اگر یکی قبلاً وجود داشت، همان migration را دوباره اجرا نکن و وضعیتش را با فایل بررسی زیر تطبیق بده.

۱. متن کامل `supabase/migrations/20261022_032_member_planning_and_activity.sql` را در یک Query جدید اجرا کن. این فایل برنامهٔ روزها و گزارش روند را اضافه می‌کند.

۲. پس از موفقیت، متن کامل `supabase/migrations/20261022_033_food_scan_quota.sql` را در Query دیگری اجرا کن. این فایل محدودیت بررسی عکس را اضافه می‌کند.

۳. متن `supabase/verify_member_app.sql` را اجرا کن. در هر دو خروجی، همهٔ ستون‌های `passed` باید `true` باشند.

فایل‌ها داخل مخزن پس از اعمال پچ و همچنین در پوشهٔ `database` بسته هستند؛ فقط یک بار آن‌ها را اجرا کن. تأیید ثبت و بازگرداندن غذا migration جداگانه‌ای نیاز ندارند و از جدول ثبت غذای موجود استفاده می‌کنند.

در این نصب از SQL Editor استفاده کن. اجرای دستی SQL سابقهٔ Supabase CLI را خودکار به‌روز نمی‌کند. نام‌گذاری فعلی پروژه چند فایل با پیشوند تاریخی مشترک دارد؛ `db push` یا اجرای دوبارهٔ همهٔ migrationها را جایگزین این دو مرحله نکن.

## ۴. بررسی واقعی عکس غذا را فعال کن

در Supabase، بخش Edge Functions → Secrets، مقدار سروری `GEMINI_API_KEY` را تنظیم کن. اگر برای body-scan همین کلید معتبر را از قبل داری، همان secret مشترک استفاده می‌شود. کلید باید به Gemini API و مدل `gemini-2.5-flash` دسترسی و ظرفیت داشته باشد. کلید را در `.env` سمت مرورگر یا متغیرهای `VITE_...` قرار نده.

از ریشهٔ مخزن:

```powershell
npx supabase login
npx supabase functions deploy food-scan --project-ref YOUR_PROJECT_REF
```

`YOUR_PROJECT_REF` را با شناسهٔ پروژهٔ Supabase خودت جایگزین کن؛ نه آدرس کامل و نه کلید API. بررسی JWT را فعال نگه دار و از `--no-verify-jwt` استفاده نکن. مقدارهای `SUPABASE_URL` و `SUPABASE_ANON_KEY` از محیط سروری Supabase خوانده می‌شوند.

دامنه‌های `https://behtan.fit` و `https://www.behtan.fit` و لوکال پورت 5173 مجازند. اگر دامنهٔ آزمایشی دیگری داری، secret سروری `FOOD_SCAN_ALLOWED_ORIGINS` را با مبدأ دقیق آن، بدون مسیر و با جداکنندهٔ کاما برای چند مبدأ تنظیم کن. مبدأ localhost با پورت متفاوت هم نیاز به اضافه‌شدن دارد.

بررسی عکس نیاز به ورود و دسترسی فعال کاربر دارد. هر حساب حداکثر ۱۰ درخواست در روز UTC و با فاصلهٔ حداقل ۱۰ ثانیه دارد. نتیجه تخمینی است؛ کاربر می‌تواند گرم‌ها را اصلاح کند. عکس در پایگاه داده یا فضای ذخیره‌سازی به‌تن ثبت نمی‌شود و برای تحلیل به Google فرستاده می‌شود.

## ۵. مسیرهای اصلی را بررسی کن

```powershell
npm run dev
```

با یک حساب آزمایشی دارای دسترسی فعال بررسی کن:

- «این وعده را خوردم» ابتدا تأییدیه بیاورد؛ «هنوز نخوردم»، ضربدر، لمس بیرون و Escape چیزی ثبت نکنند.
- «بله، ثبت کن» فقط یک بار غذا را ثبت کند و وعدهٔ بعدی نمایش داده شود. بعد از Refresh هم ثبت حفظ شود.
- در «وعده‌های امروز»، دکمهٔ «بازگرداندن» روی کارت ثبت‌شده دیده شود؛ زدن آن ثبت را حذف کند و پس از Refresh هم حذف باقی بماند.
- تغییر منو بعد از کلیک‌های پی‌درپی کار کند؛ وعده‌های دیگر تغییر نکنند.
- در بررسی عکس، یک عکس واقعی را ارسال کن، وزن را تغییر بده، جمع جدید را ببین و بعد از تأیید با عنوان «وعدهٔ دلخواه» ثبت کن. لغو ثبت هم قابل برگشت به برنامهٔ اصلی باشد.
- رنگ‌های حالت روشن و تاریک، صفحهٔ باریک و تنظیم Reduce Motion را بررسی کن.

برای اجرای تست‌های مرورگر محلی هم می‌توانی از دستورهای زیر استفاده کنی. این مرحله به نصب مرورگر نیاز دارد:

```powershell
npx playwright install chromium
npm run test:public:browser
```

## ۶. تغییرات را برای انتشار آماده کن

پس از موفقیت دیتابیس، تابع و بررسی محلی:

```powershell
git diff --check
git add --pathspec-from-file=MEMBER_APP_CHANGED_FILES.txt
git diff --cached --stat
git commit -m "Polish member app and confirm meal recording"
git push -u origin feature/member-app-final
```

سپس PR همین شاخه را به main باز کن و بعد از موفقیت CI ادغام کن. اگر انتشار سایت به main متصل است، ادغام PR همان مسیر معمول انتشار را فعال می‌کند؛ قبل از ادغام، migrationها و تابع باید آماده باشند. Build اپ اعضا همان `npm run build` و خروجی آن `dist` است.

## وضعیت بررسی این بسته

تست‌های منطق اپ، تأیید ثبت، بازگرداندن، گردش منو، SQL و سهمیهٔ عکس، ثبت وعده، روند، تغذیه، Companion، بخش Pro، پرداخت/ورود، ادمین، مسیرها و لندینگ اجرا شده‌اند. پچ روی یک checkout تمیز از main اعمال و Build اپ اعضا، ادمین و Pro بررسی شده است. جزییات در `VALIDATION.txt` داخل ZIP هستند.

تست‌های مرورگر برای مسیرهای جدید آماده‌اند و فهرست آن‌ها بررسی شده است؛ اجرای تعاملی مرورگر در این محیط ممکن نبود. بررسی واقعی Gemini، انتشار تابع و migrationهای پروژهٔ واقعی در این محیط انجام نشده‌اند و در مراحل بالا انجام می‌شوند.

اگر قبل از هر تغییر بعدی خواستی فقط پچ محلیِ commit‌نشده را برداری، ابتدا `git apply -R --check` را روی همان فایل پچ اجرا کن و فقط پس از موفقیت از `git apply -R` استفاده کن. داده‌ها یا جدول‌های واقعی را برای برگشت ظاهری حذف نکن.

مرجع دستورات Supabase:

https://supabase.com/docs/guides/functions/deploy

https://supabase.com/docs/guides/functions/secrets

https://supabase.com/docs/guides/deployment/database-migrations
