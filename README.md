# به‌تن | Behtan

برنامهٔ فارسی و راست‌به‌چپ برای برنامه‌ریزی غذا، ثبت مصرف، پیگیری وزن و تمرین؛ همراه با پنل مستقل متخصصان و ادمین.

**وضعیت این شاخه:** نسخهٔ توسعه برای بازبینی محلی. انتشار یا اجرای Migration روی دیتابیس اصلی، بخشی از این بسته نیست. راهنمای جاری: [اصلاحات نسخهٔ سوم](docs/release/MARKET_READY_V3_FA.md) و [نصب محلی](docs/release/MARKET_READY_DEV_FA.md).

## محصول

- **اپ کاربران:** برنامهٔ غذایی قطعی و قابل آزمون، جایگزینی غذا، برنامهٔ هفته، ثبت و بازگرداندن وعده، ثبت نخوردن وعده، ثبت دستی غذا و تخمین از عکس، روند وزن و بازخورد، اسکن بدن اختیاری، و تمرین برای اشتراک واجد دسترسی.
- **اشتراک‌ها:** آزمایشی یک‌بارمصرف سه‌روزه، تغذیه، تغذیه و تمرین. قیمت ماهانه در دیتابیس است؛ دورهٔ ۱۴روزه نصف قیمت با گردکردن رو به بالای تومان دارد. ارتقای تغذیه به ترکیبی، مابه‌تفاوت قیمت همان دوره را می‌گیرد و پایان دوره را نگه می‌دارد. ارتقای Trial یک خرید کامل است.
- **Pro:** ورود OTP، ثبت نام و حوزهٔ کاری، آزمایش با سقف سه پرونده در مجموع، خرید از کاتالوگ Pro، پرونده و نسخه‌ها، برنامهٔ تغذیه/تمرین، تدوین اختصاصی و PDF. ثبت‌نام حوزهٔ کاری، تأیید صلاحیت حرفه‌ای نیست. White Label خدمت قراردادی جداگانه است و در پلن‌های استاندارد ارائه نمی‌شود.
- **ادمین:** کاربران، پرداخت‌ها و سوابق، مدیریت Pro، تجربیات کاربران، نبض بیزینس و ویرایش منوهای غذایی با مواد استاندارد.

## فناوری و معماری

| بخش | فناوری و مرز مسئولیت |
| --- | --- |
| رابط | React 18، TypeScript، Vite، Tailwind، Framer Motion، Lucide، Rive |
| زبان و برند | فارسی RTL، IRANSansX، تم روشن/تیره و هویت سبز به‌تن |
| هویت و داده | Supabase Auth Phone OTP، PostgreSQL، RLS و RPCهای محدود |
| پرداخت | زرین‌پال؛ قیمت و تسویه در سرور/دیتابیس؛ محیط sandbox و live جدا |
| منطق غذا و تمرین | موتورهای TypeScript مشترک با تست‌های عددی و محدودیت‌های دامنه |
| تصویر | Edge Function با رضایت کاربر، محدودیت حجم و سهمیه؛ عکس خام ذخیره نمی‌شود |
| سئو | HTML عمومی از پیش رندرشده برای دو صفحه، canonical، sitemap، robots و دادهٔ ساختاریافته |

اعداد کالری و ماکرو از موتور قطعی محاسبه می‌شوند. تحلیل عکس تخمینی است؛ سن بیولوژیک از UI حذف شده و چربی تصویری مبنای فرمول کالری نیست. این نرم‌افزار جایگزین پزشک یا متخصص نیست.

## ساختار مخزن

```text
src/components/     رابط اپ، آنبوردینگ، لندینگ و اجزای مشترک
src/member/         قابلیت‌های کاربران، محاسبهٔ مشترک، تمرین و تحلیل تعامل
src/admin/          رابط مدیریت با کنترل دسترسی سروری
src/professional/   پنل متخصصان و قراردادهای ارتباطی
src/training/       موتور تمرین و آموزش حرکات
src/utils/          موتور تغذیه، کاتالوگ و قواعد دامنه
src/services/auth/  واسط هویت و Supabase OTP
server/            مرزهای HTTP و سرویس‌های محرمانه
api/               ورودی توابع Vercel
supabase/functions/ توابع تصویر، پرداخت و پیامک
supabase/migrations/ تغییرات نسخه‌دار دیتابیس
scripts/           تست‌ها، بکاپ و ابزارهای نگهداری
public/            فونت، هویت بصری، آموزش تمرین و فایل‌های سئو
```

## اجرای توسعه

Node.js نسخهٔ ۲۴ LTS و npm لازم است. برای بررسی محلی، از Supabase محلی یا پروژهٔ staging جداگانه استفاده کن؛ تغییر `.env` به‌تنهایی دیتابیس اصلی را کپی نمی‌کند.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

مقادیر عمومی لازم در `.env`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_STAGING_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_STAGING_ANON_KEY
VITE_TURNSTILE_SITE_KEY=YOUR_SITE_KEY
```

برای API جدید در توسعه، این مقادیر **فقط سمت سرور** لازم‌اند:

```dotenv
MEMBER_RELEASE_ENABLED=true
SUPABASE_SERVICE_ROLE_KEY=YOUR_STAGING_SERVICE_ROLE_KEY
```

کلید service role، کلید مدل، کلید زرین‌پال و امضای SMS نباید پیشوند `VITE_` بگیرند. این فایل را commit نکن. برای app جدید از `vite.config.ts` استفاده می‌شود؛ خروجی config در `.cache/` تولید می‌شود و دیگر فایل JS قدیمی کنار منبع قرار نمی‌گیرد.

```powershell
npm run dev:admin
npm run dev:pro
```

Pro از تنظیمات و پرچم‌های سروری مستند در `docs/professional/` استفاده می‌کند. آدرس‌های محلی معمولاً ۵۱۷۳، ۵۱۷۴ و ۵۱۷۵ هستند. تغییر توابع پرداخت و اسکن فقط با Vite روی سرویس ابری اعمال نمی‌شود؛ آن‌ها را باید در محیط محلی Supabase یا staging جدا اجرا کرد. API جدید member در Vite اپ اصلی متصل است؛ پرداخت همچنان Edge Function است.

## دیتابیس

`supabase/schema.sql` مبنای تاریخی schema تا فاز احراز هویت/پرداخت است، نه snapshot کامل آخرین محصول. برای محیط خالی با Auth آمادهٔ Supabase، مبنا و seed تغذیه و سپس Migrationهای ۰۱۶ به بعد به ترتیب لازم‌اند. برای دیتابیس موجود، فقط Migrationهای اجرا‌نشده اعمال شوند. دستور reset روی دیتابیس موجود ممنوع است.

جدول‌های اصلی:

| دامنه | جدول‌های اصلی |
| --- | --- |
| حساب و برنامه | `user_profiles`, `member_meal_schedule`, `daily_plan_snapshots`, `daily_meal_checkins`, `member_skipped_meals` |
| کاتالوگ | `food_items`, `food_substitutes`, `meal_templates`, `meal_template_slots`, `nutrition_protein_policy` |
| خرید | `subscription_plans`, `payment_orders`, `user_subscriptions`, `member_trial_claims`, `member_preflights` |
| تجربه و سنجش | `user_progress_entries`, `member_experiences`, `product_events` |
| تمرین و سهمیه | `member_training_plans`, `member_body_scan_usage`, `member_compute_usage` |
| Pro | `pro_applications`, `pro_organizations`, `pro_memberships`, `pro_workspace_licenses` و جدول‌های پرونده/نسخه/برنامه |

در این شاخه Migrationهای **۰۳۵ تا ۰۳۹** اضافه شده‌اند؛ همگی فقط روی clone/local بررسی شوند. ویرایش منوها به مواد موجود اشاره می‌کند و اطلاعات تغذیه‌ای مواد را ویرایش نمی‌کند. متادیتای خشک/پخته، ضریب تبدیل آب یا تغییر عدد غذایی نیست.

## تست و build

```powershell
npm run test:market
npm run test:production
npm run test:onboarding:lifecycle
npm run test:nutrition
npm run test:medical-safety
npm run test:training
npm run build
npm run build:admin
npm run build:pro
```

`test:market` مرز HTTP واقعی محلی، محاسبات مشترک، SQL با نقش‌های واقعی در PGlite، قیمت/Trial/ارتقا، دسترسی ادمین و Pro را بررسی می‌کند. PGlite جای PostgreSQL بومی، تست هم‌زمانی و اتصال زندهٔ Supabase را نمی‌گیرد. تست‌های Playwright در تنظیمات مستقل public/Pro/admin نگهداری می‌شوند. بعضی قراردادهای قدیمی مرورگر باید در بازبینی این انتشار با UI جدید تطبیق داده شوند؛ نتیجهٔ سبز CI قبلی، تأیید این شاخه نیست.

## بکاپ و انتشار

قبل از تغییر دیتابیس اصلی، آرشیو کامل PostgreSQL و تعریف نقش‌ها گرفته و در محیط کاملاً جدا بازیابی شود:

```powershell
npm run backup:full
npm run backup:full:verify -- "ABSOLUTE_BACKUP_DIRECTORY"
```

این دستورها نیازمند PostgreSQL client و متغیرهای محرمانهٔ `BEHTAN_DATABASE_URL` و `BEHTAN_RESTORE_URL` هستند. خروجی در `backups/` نگهداری و از Git خارج است. حالت پیش‌فرض TLS برابر verify-full است و گواهی معتبر سرور لازم است. آرشیو دیتابیس شامل فایل‌های واقعی Storage، تنظیمات داشبورد و Secretهای Edge/Vercel نیست؛ آن‌ها جدا پشتیبان‌گیری می‌شوند. checksum یا فهرست آرشیو به‌تنهایی اثبات بازیابی نیست.

فعلاً Merge، deploy یا Migration production انجام نده. مراحل بازبینی در [راهنمای انتشار توسعه](docs/release/MARKET_READY_DEV_FA.md) آمده است.

## امنیت و محدودیت‌ها

احراز هویت OTP، Turnstile، اعتبارسنجی ورودی، محدودیت حجم/تعداد درخواست، RLS، RPCهای service-only و عدم ثبت عکس/توکن در telemetry از مرزهای امنیتی‌اند. JWT امضاشده است؛ «رمزنگاری‌شده» خواندن همهٔ توکن‌ها دقیق نیست. TLS و رمزنگاری دیسک/بکاپ به تنظیمات سرویس میزبانی نیز وابسته‌اند و از روی کد قابل تضمین مطلق نیستند.

رویدادهای محصول فقط نام رویداد، مرحله، منبع و شناسهٔ تصادفی جلسه را دارند؛ نام، وزن، بیماری، عکس، متن آزاد و JWT وارد آن‌ها نمی‌شوند. تأیید خرید و درآمد از تراکنش سروری خوانده می‌شوند، نه ادعای مرورگر. آمار پیش از شروع سنجش بازسازی نمی‌شود.

مستندات قدیمی در `docs/` سابقهٔ فازها هستند. مرجع این شاخه README و راهنمای نسخهٔ جدید است. سیاست اقتصادی، شرایط بازگشت وجه، حذف حساب و متن جامع حریم خصوصی طبق دامنهٔ درخواست این انتشار تغییر نکرده‌اند.
