# بکاپ و عملیات پنل

## قبل از Migration

کد، اطلاعات دیتابیس، فایل‌های Storage و تنظیمات سرویس‌ها چهار بخش جدا هستند. GitHub فقط بخش commit‌شده کد را نگه می‌دارد. کپی محلی پروژه، فایل‌های env مورد نیاز را جدا و خصوصی نگه دارد.

اسکریپت جدید فقط از دیتابیس می‌خواند، هیچ restore یا migration اجرا نمی‌کند. به ابزارهای PostgreSQL `pg_dump`، `pg_dumpall` و `pg_restore` در PATH نیاز دارد؛ نسخه کلاینت باید با سرور سازگار و از سرور قدیمی‌تر نباشد. Docker لازم نیست. ابزارهای پیشین Supabase CLI با Docker هم مسیر جایگزین رسمی هستند.

در Supabase → Connect، اتصال **Session pooler پورت 5432** را برای شبکه معمول IPv4 بردارید. رمز، رمز دیتابیس است. در PowerShell، URL کامل را فقط در ورودی مخفی محلی وارد کنید؛ پسورد داخل URL باید URL-encode شده باشد:

```powershell
cd E:\Behtan-Final
$connection = Read-Host "Supabase database connection URL" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($connection)
try {
  $env:BEHTAN_BACKUP_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  npm run backup:pro -- E:\Behtan-Backups\before-028
} finally {
  Remove-Item Env:BEHTAN_BACKUP_DATABASE_URL -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable connection,pointer -ErrorAction SilentlyContinue
}
npm run backup:verify -- E:\Behtan-Backups\before-028
```

پوشه مقصد تازه باشد. فقط پس از موفقیت هر دو دستور ادامه دهید. خروجی `database.dump` شامل ساختار، داده، توابع، RLS و grants دیتابیس است؛ `roles.sql` تعریف نقش‌ها بدون رمز و manifest شامل checksum است. فایل‌های partial شکست‌خورده به‌عنوان بکاپ معتبر پذیرفته نمی‌شوند. `pg_restore --list` فقط سالم‌بودن فهرست آرشیو را بررسی می‌کند؛ restore واقعی را اثبات نمی‌کند. URL/رمز و خروجی خام خطا در لاگ اسکریپت چاپ نمی‌شود.

یک کپی رمزگذاری‌شده خارج از سیستم نگه دارید. بکاپ شامل اطلاعات سلامت است و نباید در GitHub یا فضای عمومی قرار گیرد. بکاپ دیتابیس شامل فایل‌های واقعی Storage، کلیدهای Vercel، تنظیمات OTP/SMS و رمز نقش‌ها نیست. آن موارد را جدا نگه دارید.

## بازیابی قابل اتکا

پیش از اتکا به بکاپ، بازیابی را در یک دیتابیس/پروژه جدا تمرین کنید. اسکریپت عمداً دستور restore روی Production ندارد. در پروژه Supabase جدید، بازسازی schemaهای مدیریت‌شده و نقش‌های موجود باید مطابق راهنمای Supabase و نسخه پروژه انجام شود؛ اجرای کور roles.sql یا pg_restore روی پروژه زنده درست نیست.

پس از restore، تعداد رکوردها، توابع و grants/RLS را با مبدأ مقایسه کنید؛ سپس با دو سازمان مصنوعی جداسازی داده، ورود، خواندن سوابق، PDF و ایجاد پرونده را تست کنید. Migrationهای بعد از بکاپ را فقط در محیط بازیابی‌شده اجرا و دوباره تست کنید. تا موفقیت این تمرین، manifest مقدار restore_verified=false دارد.

CI موجود PostgreSQL 17، داده‌های مصنوعی را با pg_dump ذخیره و در دیتابیس جدا pg_restore می‌کند؛ سپس تمام جدول‌های public/auth/pro_private، checksum رکوردها، sequences، grants، تعریف توابع، RLS و constraints مقایسه می‌شوند. جدول‌های گزارش جدید هم خودکار در این مقایسه قرار می‌گیرند. این تست از Supabase زنده بکاپ نمی‌گیرد.

## خطا و ارتباط

- API رژیم و گزارش بدن برای هر درخواست X-Request-Id و Cache-Control:no-store دارند. خطاها با کد و شناسه پیگیری ثبت می‌شوند؛ JWT، نام، شماره، عکس و ورودی سلامت لاگ نمی‌شوند.
- خطاهای تحلیل پس از شناسایی کاربر در همان pro_failure_events با operation=scan ثبت می‌شوند و در ادمین → مدیریت Pro → مدیریت فضای کاری → خطاها دیده می‌شوند. خطا پیش از احراز هویت/پیکربندی در لاگ Vercel است.
- RPCهای پنل timeout محدود و retry خودکار خاموش دارند. درخواست‌های نوشتن با همان کلید صریح کاربر تکرار می‌شوند؛ اتصال نامطمئن با لغو دسترسی اشتباه گرفته نمی‌شود.
- روی Pro بررسی ساخت برنامه و یک پرونده مصنوعی، و روی ادمین مشاهده رویدادها، بخشی از بررسی بعد از Deploy باشد. تنظیم نگهداری/هشدار لاگ Vercel وابسته به پلن حساب است؛ در این بسته سرویس مانیتورینگ خارجی متصل نشده است.
- در صورت خطای فراگیر عکس، flag تحلیل جدید را خاموش کنید؛ خواندن گزارش‌های قبلی و رژیم‌ها فعال می‌ماند. برای rollback رابط می‌توان Deploy قبلی را بازگرداند؛ Migration 028 را خودکار down نکنید و جدول‌ها را حذف نکنید.

منابع:
https://supabase.com/docs/guides/platform/backups
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
