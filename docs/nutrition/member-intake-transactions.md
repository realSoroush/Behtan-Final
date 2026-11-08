# ثبت اتمیک مصرف عضو — E02/E03

پایهٔ این بسته `main@087a7a6`، پس از PR42 است. این سند مکمل گزارش ۱۸ تسک است. تغییر سیاست پزشکی، کاتالوگ یا ظاهر در این بسته وجود ندارد. migrationهای 051 و 052 در repository آماده‌اند؛ این نوشته به معنی اعمال آن‌ها روی production نیست.

## مسئله و رفتار جدید

پیش از اصلاح، ثبت «خوردم»، «نخوردم»، undo و غذای اضافه مستقیماً با مجوز authenticated جدول‌ها را تغییر می‌داد. این عملیات revision را بالا می‌بردند ولی revision مشاهده‌شده را شرط نوشتن نمی‌کردند؛ ثبت دستگاه دوم می‌توانست ثبت دستگاه اول را حذف کند. API قبلی برای تجویز اتمیک بود؛ مسیر legacy همچنان مجوز اجرا داشت.

اکنون `POST /api/member` با `action=meal_intake` فقط قصد ثبت، روز، requestId و نسخه‌های مشاهده‌شده را می‌گیرد. هویت از نشست تأییدشده سرور گرفته می‌شود. snapshot گزارش مصرف با validator مشترک عددی/معنایی بررسی می‌شود. گزارش واقعی غذا می‌تواند با محدودیت جدید ناسازگار باشد؛ این گزارش به پیشنهاد فعال تبدیل نمی‌شود و کاتالوگ امروز تاریخچهٔ غذا را بازحساب نمی‌کند.

RPC خدمت، اشتراک/پروفایل، نسخهٔ کاتالوگ، ساعت مصرف روز و timestamp برنامه را زیر قفل و در یک تراکنش کنترل می‌کند. ترتیب قفل با commit برنامه یکسان است. درخواست قدیمی با 409 رد می‌شود. ثبت جدید برای **امروز تهران** مجاز است؛ بعد از نیمه‌شب ابتدا صفحهٔ روز تازه را باز کنید. دادهٔ روز قبل حذف نمی‌شود.

requestId رسید ۲۴ساعته دارد. retry همان قصد، همان نتیجه را بدون اثر دوم دریافت می‌کند. شناسهٔ غذای اضافه همان requestId است؛ بعد از انقضای رسید هم همان شناسه ردیف دوم نمی‌سازد. شناسهٔ متعلق به کاربر/روز دیگر قابل حذف نیست. رسید فقط روز و نسخه و timestamp دارد؛ از کل تاریخچهٔ غذا در هر عملیات کپی تازه ذخیره نمی‌شود. شناسه‌های pending اسکن مانند قبل در sessionStorage فقط hash و UUID دارند؛ اطلاعات غذا/کاربر/تصویر در آن ذخیره نمی‌شود.

رابط بلافاصله پیش‌نمایش ثبت را نشان می‌دهد؛ تأیید «ثبت شد» بعد از پاسخ موفق است. موفقیت عادی با همان رسید نسخهٔ جدید را نصب می‌کند و read اضافی ندارد. دریافت رسید تکراری نیازمند read تازه است تا وضعیت قدیمی جای تغییر بعدی دستگاه دیگر ننشیند. قطع پاسخ دو بار با یک شناسه تلاش می‌شود؛ اگر نتیجه مبهم بماند، کاربر همان عملیات را بازیابی می‌کند. تعارض، rollback نمایش و دریافت نسخهٔ تازه دارد. تعویض حساب/روز، پاسخ متعلق به scope قبلی را کنار می‌گذارد.

بودجهٔ ثبت مصرف ۳۰ قصد جدید موفق در دقیقه برای هر حساب است، داخل تراکنش commit. تکرار رسید و درخواست ردشده بابت نسخه، سهمیه را مصرف نمی‌کند. بودجهٔ ساخت برنامه ۱۲ و preflight/تمرین ۵ باقی است. سقف HTTP این action برابر ۶۴ KiB و سایر actionها ۱۲٬۰۰۰ بایت است. این عدد سیاست تغذیه‌ای نیست؛ نرخ و latency واقعی باید بعد از انتشار پایش شود.

## تست‌ها و مرز شواهد

- `npm run test:member:intake`: ورودی اضافی/جعلی، تاریخ نامعتبر، اعداد و جمع نامعتبر، نسخهٔ پروفایل/کاتالوگ/مصرف/برنامه، replay و retry محدود deadlock.
- `npm run test:market`: PostgreSQL سازگار PGlite، grant و column grant، باقی‌ماندن SELECT، لغو legacy، جداسازی وضعیت‌ها، receipt و ownership.
- `npm run test:pro:native` با DB دورریختنی: PostgreSQL 17 واقعی؛ دو connection برای record/skip، یک requestId هم‌زمان، intake در برابر commit برنامه. promiseهای روی یک connection به عنوان concurrency معرفی نشده‌اند.
- `playwright.member-intake.config.ts`: دو browser context مستقل با hook اصلی برنامه، HTTP handler و سرویس اصلی و PostgREST واقعی نسخهٔ 14.18 و PostgreSQL 17. تعارض، preview فوری، refresh/focus، replay بعد از گم‌شدن دو پاسخ و مجوز REST/RPC بررسی می‌شوند. gate احراز هویت در این fixture، JWT امضاشدهٔ مصنوعی است؛ تست OTP یا GoTrue واقعی نیست. کاتالوگ این تست نیز مرجع مصنوعی است.
- مرورگر عمومی دسکتاپ/موبایل با fixture و build عضو/ادمین/پرو در CI حفظ شده‌اند. این تست‌ها جای تست واقعی روی شبکهٔ ایران یا برآورد latency کاربران را نمی‌گیرند. هیچ دیتابیس production در CI استفاده نمی‌شود.

نتیجهٔ اجرای نهایی و لینک CI در PR ثبت می‌شود. تست حقیقی روی دو دستگاه و شبکهٔ ایران بعد از deploy لازم است؛ نرخ موفقیت fixture، نرخ کاربران نیست.

## ترتیب اعمال پس از بررسی و تأیید

**051 → merge/deploy کد سازگار → بررسی کاربر → 052.** هر دو فایل را پیش از deploy یکجا با `supabase db push` اجرا نکنید. 052 مسیر مرورگر قدیمی را می‌بندد و باید آخر اجرا شود. 048 تا 050 باید قبلاً اعمال شده باشند. CI این‌ها را روی DB مصنوعی می‌آزماید و به سرور ایران دسترسی ندارد.

### ۱. Windows PowerShell، پروژه E:\Behtan-Final

وضعیت working tree را بررسی کنید. پوشهٔ جدا، تغییرهای پروژهٔ اصلی را دست نمی‌زند:

```powershell
Set-Location E:\Behtan-Final
git status
git fetch origin
git worktree add --detach ..\Behtan-Intake-Review origin/fix/member-intake-transactions
scp ..\Behtan-Intake-Review\supabase\migrations\20261107195116_051_member_intake_transactions.sql root@95.38.186.191:/opt/behtan/migration/
scp ..\Behtan-Intake-Review\supabase\migrations\20261107195535_052_close_legacy_member_writes.sql root@95.38.186.191:/opt/behtan/migration/
```

### ۲. سرور ایران، SSH؛ فقط 051 پیش از merge

بعد از تأیید خودتان و تست روی DB آزمایشی، بکاپ محدود به root بگیرید. بررسی فهرست بکاپ، آزمون بازیابی کامل نیست.

```bash
cd /opt/behtan/supabase
(
  set -eu
  umask 077
  behtan_backup=$(mktemp /opt/behtan/migration/pre-051-XXXXXX.dump)
  docker compose exec -T db pg_dump -U postgres -d postgres -Fc > "$behtan_backup"
  test -s "$behtan_backup"
  docker compose exec -T db pg_restore -l < "$behtan_backup" > /dev/null
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < /opt/behtan/migration/20261107195116_051_member_intake_transactions.sql
)
```

خروجی باید COMMIT داشته باشد. دوباره‌اجرای خودسرانهٔ فایل پس از موفقیت لازم نیست؛ ایجاد تابع جدید intentional است و از اعمال تصادفی دوباره جلوگیری می‌کند.

### ۳. GitHub و Vercel

Checks همین PR را سبز بررسی و PR را merge کنید. در Vercel پروژهٔ `behtan-final` منتظر Ready بمانید. env جدیدی لازم نیست. متغیرهای موجود URL، anon، service-role و `MEMBER_RELEASE_ENABLED=true` باید همان دیتابیس ایران را هدف بگیرند. فایل Edge Function تازه‌ای برای این PR روی سرور ایران deploy نمی‌شود؛ مسیر جدید در API عضو Vercel است.

با دو مرورگر حساب آزمایشی دارای اشتراک وارد شوید: خوردم/نخوردم/undo، غذای اضافه و حذف آن، تغییر وعده، جایگزینی و refresh را امتحان کنید. ابتدا هر دو صفحه را باز کنید، در A ثبت کنید و بدون refresh در B ثبت متفاوت بزنید: B باید تعارض بدهد. پس از بازیابی، ثبت مجاز است. از انتشار موفق روی یک مرورگر، نتیجهٔ concurrency استنباط نکنید.

### ۴. سرور ایران، پس از موفقیت مرحلهٔ ۳؛ بستن مسیر قدیمی

صفحه‌های قدیمی را ببندید/refresh کنید. تب قدیمی پس از 052 مجوز نوشتن مستقیم ندارد و باید نسخهٔ تازه را باز کند. بکاپ تازه بگیرید و فقط سپس اجرا کنید:

```bash
cd /opt/behtan/supabase
(
  set -eu
  umask 077
  behtan_backup=$(mktemp /opt/behtan/migration/pre-052-XXXXXX.dump)
  docker compose exec -T db pg_dump -U postgres -d postgres -Fc > "$behtan_backup"
  test -s "$behtan_backup"
  docker compose exec -T db pg_restore -l < "$behtan_backup" > /dev/null
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < /opt/behtan/migration/20261107195535_052_close_legacy_member_writes.sql
)
```

### ۵. Supabase Studio ایران → SQL Editor، بررسی بدون تغییر داده

```sql
select r.role_name,t.table_name,
  has_table_privilege(r.role_name,'public.'||t.table_name,'INSERT') as can_insert,
  has_table_privilege(r.role_name,'public.'||t.table_name,'UPDATE') as can_update,
  has_table_privilege(r.role_name,'public.'||t.table_name,'DELETE') as can_delete,
  has_any_column_privilege(r.role_name,'public.'||t.table_name,'INSERT') as column_insert,
  has_any_column_privilege(r.role_name,'public.'||t.table_name,'UPDATE') as column_update
from (values ('anon'),('authenticated')) r(role_name)
cross join (values ('daily_meal_checkins'),('member_skipped_meals'),('member_extra_foods'),('member_meal_schedule')) t(table_name);

select has_function_privilege('authenticated',
 'public.save_member_meal_schedule_v3(date,text,jsonb,jsonb,boolean,boolean)','EXECUTE') as legacy_execute,
 has_function_privilege('authenticated',
 'public.member_commit_intake(uuid,date,uuid,text,jsonb,bigint,bigint,timestamptz,text,text,jsonb,uuid)','EXECUTE') as browser_commit_execute,
 has_function_privilege('service_role',
 'public.member_commit_intake(uuid,date,uuid,text,jsonb,bigint,bigint,timestamptz,text,text,jsonb,uuid)','EXECUTE') as service_commit_execute;
```

ستون‌های write باید همه false باشند؛ legacy_execute و browser_commit_execute برابر false و service_commit_execute برابر true. پس از 052 مجدداً ثبت و بازکردن در دو مرورگر را آزمایش کنید. در Network، ثبت مصرف باید `/api/member` با `meal_intake` و status 200 باشد؛ REST مستقیمِ قدیمی نباید وجود داشته باشد. لاگ و اسکرین‌شات شامل token یا محتوای پزشکی منتشر نکنید.

## مسیر بازگشت

پیش از 052، برگشت دیپلوی کد ممکن است؛ 051 افزایشی باقی می‌ماند. پس از 052 فقط کدی سازگار با API جدید را redeploy کنید یا fix رو به جلو بدهید. برگرداندن دیپلوی قدیمی به‌تنهایی مجوزهای لغوشده را برنمی‌گرداند. بازکردن دوبارهٔ مجوزها تصمیم جدا و بازگشت محدودیت هم‌زمانی است. برای rollback کد، جدول/مصرف/رسید را حذف یا بکاپ قدیمی را روی دادهٔ تازه restore نکنید.

## وضعیت ۱۸ تسک پس از این بسته

| تسک | وضعیت مهندسی | باقی‌مانده |
|---|---|---|
| E01 | مسیر جداسازی و undo اصلاح شده | بازیابی تک‌وعده در نبود پیشنهاد با E10؛ تست واقعی پس از انتشار |
| E02 | عضو: سرور و UI منتقل، closure آماده | اعمال مرحله‌ای 052 و تأیید روی محیط هدف؛ قرارداد Pro با E15 جداست |
| E03 | CAS مشترک مصرف/برنامه و receipts پیاده شده | تأیید تست CI و تست دو دستگاه/نیمه‌شب و قطع شبکهٔ ایران |
| E04 | فاز فوری egg/sesame انجام شده | شواهد واقعی assessed_absent و taxonomy/تماس متقاطع |
| E05 | validator مشترک و سمت سرور عضو | قرارداد کامل تمام مسیرهای Pro/PDF |
| E06 | snapshot/instance مستقل و version check انجام شده | آرشیو بازتولیدپذیر کامل نسخه‌های کاتالوگ |
| E07 | باقی است | تصمیم مستند سیاست انرژی/پروتئین و بازبینی متخصص |
| E08 | جزئی | واحد، خام/پخته، yield، منشأ و نسخهٔ recipe کامل |
| E09 | جزئی | oracle، frontier و گزارش علت شکست heuristic |
| E10 | intent و اعتبارسنجی مجدد و مصرف نسخه‌دار | بازیابی امن تک‌وعده و بهینه‌سازی با تشخیص روشن علت شکست |
| E11 | باقی است | وعده و پس‌ازتمرین منعطف |
| E12 | جزئی | افق هفته، سقف تکرار و هدف هزینهٔ واقعی |
| E13 | جزئی | مدل unknown، پوشش و ریزمغذی‌ها با دادهٔ معتبر |
| E14 | محافظ فوری انجام شده | روند هموار، عدم‌قطعیت و adaptation مستند |
| E15 | جزئی | قرارداد مشترک متخصص/عضو/PDF و override مستند |
| E16 | نیازمند شواهد محیط هدف | latency/بار/قطع شبکه و تمرین بازیابی واقعی |
| E17 | رگرسیون‌ها و زیرساخت PG/REST/مرورگر افزوده شده | پیگیری نتیجهٔ CI و گسترش oracle/cohort در موج‌های بعد |
| E18 | جزئی | مسیر بازبینی واجد صلاحیت و انتشار تدریجی غذا/دستور |

موج بعد مطابق وابستگی‌های سند: E07 همراه تصمیم تخصصی؛ پایهٔ دادهٔ E08 و پیش‌نیازهای E13/E18. اتمام این PR به معنی اتمام آن تسک‌ها نیست.
