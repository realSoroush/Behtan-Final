# نصب موتور تمرینی به‌تن — پایلوت داخلی Pro

این بسته برنامه تمرینی را به پرونده‌های واقعی Pro اضافه می‌کند. برنامه و PDF تغذیه فعلی حفظ شده‌اند. نیاز به کلید AI یا سرویس مدیای پولی ندارد. تمام مراحل با داده مصنوعی/شماره تحت کنترل خودتان تست شوند؛ این بسته خودش روی سایت منتشر نشده است.

## ۱. نصب فایل‌ها

ZIP را بیرون پوشه E:\Behtan-Final استخراج کن. ابتدا تغییرات شخصی را commit کن؛ خروجی build یا فایل .env را commit نکن. سپس PowerShell:

```powershell
cd E:\Behtan-Final
git status
git switch main
git pull --ff-only origin main
git switch -c feature/pro-training
```

از مسیر واقعی پوشه استخراج‌شده، اسکریپت را اجرا کن؛ مثال زیر را با مسیر خودت عوض کن:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\YOUR_NAME\Downloads\behtan-training-v1\Apply-Training.ps1" -Repo "E:\Behtan-Final"
```

اسکریپت ابتدا git apply --check می‌کند؛ در صورت خطا چیزی اعمال نمی‌کند. اگر فایل‌های بسته گزارش بدن ۰۲۸ موجود باشند، فقط پچ افزایشی تمرین را اعمال می‌کند. اگر موجود نباشند، پچ یکپارچه از main مرجع را اعمال می‌کند. دو پچ را پشت سر هم اعمال نکن؛ اسکریپت فقط یکی را انتخاب می‌کند. اگر تغییرات دیگری نسبت به مبنا داشته باشی و check خطا بدهد، همان خطا را بفرست؛ فایل‌ها را دستی روی هم کپی نکن.

مبنای GitHub بررسی‌شده: 2b47055b1732ea245090033af725b1de403f3d8a؛ بسته ۰۲۸ قبلی هم به‌عنوان مبنای دوم پشتیبانی می‌شود.

## ۲. تست محلی

```powershell
npm ci
npm run test:training
npm run test:pro
npm run test:production
npm run test:admin
npm run build
npm run build:admin
npm run build:pro
```

برای تست مرورگر:

```powershell
npx playwright install chromium
npm run test:pro:browser
npm run test:pro:admin:browser
```

اگر Chromium نصب نشد، خطا را نگه دار. تست‌های موتور و SQL جای تست مرورگر را نمی‌گیرند؛ CI هم برای اجرای آن‌ها تنظیم شده است. در محیط ساخت این بسته از Chromium 134 سازگار با تست‌ها استفاده شد؛ دانلود نسخه پیش‌فرض جدید در این محیط خراب بود. نسخه package-lock مخزن تغییر نکرده است.

## ۳. Supabase — قبل از انتشار

پس از بکاپ فعلی پروژه، در SQL Editor همان Supabase به‌تن بررسی کن:

```sql
select
 to_regclass('public.pro_body_report_jobs') as migration_028,
 to_regclass('public.pro_training_plans') as migration_029;
```

- اگر migration_028 برابر null است، اول کل فایل supabase/migrations/20261022_028_pro_read_access_and_body_reports.sql را یک‌بار اجرا کن.
- اگر migration_029 برابر null است، کل فایل supabase/migrations/20261022_029_pro_training.sql را یک‌بار اجرا کن.
- اگر جدول موجود است، Migration مربوطه را دوباره اجرا نکن. در نصب ناقص، ابتدا خطا را بررسی می‌کنیم.

پس از اجرا:

```sql
select
 to_regclass('public.pro_training_plans') as plans,
 to_regclass('public.pro_training_approvals') as approvals;
```

هر دو باید نام جدول نشان دهند. RLS و مجوز RPCها داخل Migration هستند؛ دسترسی مستقیم جدول‌ها را باز نکن.

## ۴. Vercel — فقط پروژه Pro

در Settings → Environment Variables → Production پروژه behtan-pro:

```text
PRO_TRAINING_ENABLED=true
```

متغیر VITE_PRO_SANDBOX_ENABLED=true را مثل قبل حفظ کن؛ این نام قدیمی، سوییچ روشن‌بودن پنل فعلی است. متغیرهای سروری فعلی VITE_SUPABASE_URL، VITE_SUPABASE_ANON_KEY و SUPABASE_SERVICE_ROLE_KEY همان Supabase اصلی را حفظ کن. برای تمرین، کلید OPENAI_API_KEY لازم نیست. کلید service_role نباید VITE_ داشته باشد یا داخل Git/چت قرار گیرد. تنظیمات build فعلی npm run build:pro و dist-pro باقی می‌ماند. اگر env پس از Deploy ثبت شد، Redeploy کن.

برای اجرای سرور محلی، همین متغیرها را در فایل محیطی محلیِ خارج از Git تنظیم کن؛ سپس npm run dev:pro. Vite API تمرین را هم در حالت توسعه اجرا می‌کند.

## ۵. Commit و PR

اسکریپت نصب، TRAINING_CHANGED_FILES.txt را در ریشه پروژه می‌گذارد؛ فهرست مناسب همان پچ انتخاب‌شده است:

```powershell
git add --pathspec-from-file=TRAINING_CHANGED_FILES.txt
git diff --cached --stat
git commit -m "Add shared training engine and Pro exercise programmes"
git push -u origin feature/pro-training
```

فایل patch، ZIP، TRAINING_CHANGED_FILES.txt، خروجی build و .env را اضافه نکن.

PR:
https://github.com/realSoroush/Behtan-Final/compare/main...feature/pro-training

CI را بررسی کن؛ پس از Merge و Deploy موفق behtan-pro، تست زیر را انجام بده.

## ۶. تست واقعی کوتاه

۱. Pro → پرونده مراجع مصنوعی سالم ۱۸–۶۴ سال → ذخیره اطلاعات.
۲. «برنامه تمرینی مراجع» را باز کن.
۳. خانه، تازه‌کار، یک جفت دمبل و نیمکت ثابت، دو روز شنبه/سه‌شنبه، زمان ۴۵ دقیقه را انتخاب کن؛ پرسش‌های آمادگی را بررسی و تأیید کن.
۴. ساخت پیش‌نویس؛ بین چهار هفته و جلسات جابه‌جا شو. یک حرکت را باز کن؛ GIF فقط با «دیدن حرکت» پخش شود.
۵. پس از بازبینی، تأیید نهایی؛ PDF برنامه تمرینی → Save as PDF.
۶. پنجره را ببند و دوباره باز کن؛ برنامه از سوابق بیاید و تغییر نکند.
۷. QR نمونه را با گوشی باز کن؛ فقط آموزش حرکت، بدون ورود به پرونده یا نمایش اطلاعات مراجع.
۸. پنل را از ادمین موقتاً معلق کن: تاریخچه و PDF تأییدشده باز بماند، ساخت و تأیید جدید بسته شود؛ سپس اعتبار تست را برگردان.
۹. روزهای شنبه/یکشنبه یا علامت علائم غیرمعمول را امتحان کن؛ تولید عمومی باید با پیام روشن متوقف شود.
۱۰. برنامه غذایی و PDF غذایی قبلی را دوباره باز کن؛ قالب و اعدادشان نباید تغییر کرده باشند.

این نسخه به تمرین B2C، لاگ انجام ست‌ها، تقویم اعلان، پرداخت Pro یا دعوت بیمار متصل نشده است. موتور مشترک برای این اتصال‌ها آماده است؛ مسیر اجرایی فعلی Pro و خروجی تمرینی مستقل است. توقف فوری ساخت برنامه جدید: PRO_TRAINING_ENABLED=false و Redeploy؛ Migration را حذف نکن تا سوابق باقی بمانند.
