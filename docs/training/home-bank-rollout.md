# بانک منزل، تاریخ شمسی و فهرست مراجعان — راهنمای اعمال 055

مبنای این تغییر: `main` در `fcd7bfe`، پس از PR46 و migrationهای 053 و 054.
این راهنما اجرای خودکار روی production نیست؛ SQL را پس از بررسی و بکاپ خودتان اجرا کنید.

## تغییرات

- سه بانک مستقل باشگاه، اصلاحی و منزل؛ بانک منزل شامل تمام ۸۴ ورودی در ۹ دسته و ۸۳ نام یکتای ارسالی است. «نشر خم دمبل» در دو دسته مرتبط قرار دارد.
- بانک منزل انتخاب دستی مربی است؛ دوز، تأیید علمی یا تجویز خودکار جدیدی اضافه نشده است. بررسی تخصصی بانک اصلاحی حفظ می‌شود.
- تاریخ شروع برنامه دستی و خودکار با روز، ماه و سال شمسی انتخاب و به‌صورت ISO date-only ذخیره می‌شود. تاریخ برنامه دستی در نسخه ذخیره‌شده، آرشیو و PDF باقی می‌ماند. تاریخ برنامه قدیمیِ فاقد این فیلد ساخته نمی‌شود.
- «حرکت بعدی» جایگزین «گروه جدید» شده است؛ سوپرست و تریپل‌ست حفظ شده‌اند. دکمه «حرکات روز دوم/سوم/…» روز بعد را باز یا ایجاد می‌کند. برنامه جدید تا ۷ روز دارد؛ برنامه واردشده طولانی‌تر کوتاه نمی‌شود.
- مسیر «مراجعان» همیشه به فهرست پرونده‌های فعال برمی‌گردد؛ قبل از دورریختن تغییرات ثبت‌نشده تأیید می‌گیرد. صفحه‌بندی و بایگانی حفظ شده‌اند. جستجوی شماره فارسی/عربی، `09`، `+98`، `0098` و فاصله/خط تیره پشتیبانی می‌شود.
- آزمایشی جدید: یک **ماه تقویمی از زمان ثبت‌نام** و ۳ پرونده در مجموع. پرداخت ۱، ۳، ۶ یا ۱۲ماهه و تمدید از انتهای اعتبار فعال محاسبه می‌شود؛ ارتقای آزمایشی از زمان پرداخت شروع می‌شود.
- اصلاح اعتبار ده‌ساله قدیمی فقط با امضای دقیق اعطای خودکار انجام می‌شود: trial، ظرفیت ۳، سازنده همان متقاضی، تاریخ دقیق ایجاد سازمان +۱۰ سال، بدون هیچ سابقه تغییر مجوز مدیر. انتهای صحیح = ثبت‌نام اصلی +۱ ماه؛ این migration ماه رایگان تازه‌ای نمی‌دهد. بنابراین آزمایشی قدیمی ممکن است فقط اجازه مشاهده سوابق داشته باشد. هیچ پرونده یا برنامه‌ای حذف نمی‌شود.
- اشتراک پرداخت‌شده و مجوز دارای سابقه تنظیم مدیر بازنویسی نمی‌شوند. تاریخ واقعی مجوز مرجع نمایش است؛ اعتبار مدیر با عنوان جدا مشخص می‌شود. داده مبهم را خودکار حدس نمی‌زنیم.

## ۱. دریافت شاخه و بررسی — Windows PowerShell

در پروژه `E:\Behtan-Final`:

```powershell
Set-Location E:\Behtan-Final
git status
git fetch origin
git worktree add -b review/pro-home-training ..\Behtan-Home-Review origin/feat/pro-home-training-ux
Set-Location E:\Behtan-Home-Review
npm ci
npm run test:pro:ux
npm run test:pro:studio
npm run build:pro
scp .\supabase\migrations\20261108223703_055_pro_training_terms_directory.sql root@95.38.186.191:/opt/behtan/migration/
```

اگر شاخه/پوشه review از قبل وجود دارد، دوباره `worktree add` نزنید؛ در همان worktree وضعیت را بررسی و `git pull --ff-only` کنید. به تغییرات محلی پروژه اصلی دست نزنید.

## ۲. پیش‌بررسی و بکاپ — سرور ایران

ابتدا روی دیتابیس آزمایشی/کپی بازیابی‌شده اجرا و رفتارهای بخش ۴ را بررسی کنید. برای production، پس از تصمیم خودتان، در SSH سرور:

```bash
(
  set -e
  umask 077
  cd /opt/behtan/supabase
  test -s /opt/behtan/migration/20261108223703_055_pro_training_terms_directory.sql
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
select to_regprocedure('public.pro_browse_case_directory(uuid,text,integer,boolean)') is not null as directory_ready,
       to_regprocedure('pro_private.valid_authored_content(jsonb,text)') is not null as authored_ready,
       to_regprocedure('pro_private.immutable_audit()') is not null as audit_ready;
select to_regclass('pro_private.workspace_term_repairs') is not null as already_applied;
SQL
  mkdir -p /opt/behtan/backups
  behtan_training_backup="/opt/behtan/backups/before-055-$(date -u +%Y%m%dT%H%M%SZ).dump"
  docker compose exec -T db pg_dump -U postgres -d postgres -Fc > "$behtan_training_backup"
  test -s "$behtan_training_backup"
  docker compose exec -T db pg_restore --list < "$behtan_training_backup" > "$behtan_training_backup.toc"
  test -s "$behtan_training_backup.toc"
  sha256sum "$behtan_training_backup" > "$behtan_training_backup.sha256"
  printf 'BACKUP_READY: %s\n' "$behtan_training_backup"
)
```

سه مقدار ready باید `t` و `already_applied` باید `f` باشند. اگر `already_applied=t` است، migration را تکرار نکنید. آزمون TOC فقط صحت خواندن آرشیو را نشان می‌دهد؛ جای بازیابی آزمایشی کامل را نمی‌گیرد. بکاپ شامل داده خصوصی است؛ در گیت یا چت قرار ندهید.

## ۳. اعمال فقط 055 — سرور ایران، قبل از merge/deploy

```bash
(
  set -e
  cd /opt/behtan/supabase
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < /opt/behtan/migration/20261108223703_055_pro_training_terms_directory.sql
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
select count(*) as repaired_legacy_trials from pro_private.workspace_term_repairs;
select count(*) as incorrect_repaired_terms
from pro_private.workspace_term_repairs r join public.pro_workspace_licenses l using(organization_id)
where l.revision=(r.after_data->>'revision')::integer
and l.expires_at<>(r.after_data->>'expires_at')::timestamptz;
select has_function_privilege('authenticated','pro_private.self_workspace(uuid,text,integer,boolean)','EXECUTE') as direct_provisioning,
       has_table_privilege('authenticated','pro_private.workspace_term_repairs','SELECT') as repair_audit_public_read,
       has_function_privilege('authenticated','public.pro_browse_case_directory(uuid,text,integer,boolean)','EXECUTE') as directory_allowed;
SQL
)
```

انتظار: `incorrect_repaired_terms=0` و `direct_provisioning=f`، `repair_audit_public_read=f`، `directory_allowed=t`. تعداد repaired می‌تواند صفر باشد؛ مجوز دستی یا اشتراک پرداخت‌شده عمداً وارد این تعداد نمی‌شود.

این migration تراکنشی است؛ در خطا متوقف شوید و خروجی بدون داده خصوصی را بررسی کنید. migrationهای 053/054 یا کل پوشه migrations را دوباره اجرا نکنید. تغییری در secrets، Edge Functions، Vercel یا Cloudflare لازم نیست.

## ۴. merge و بررسی Preview/Production

پس از موفقیت SQL و CI، PR را خودتان در GitHub merge کنید؛ Vercel معمولاً از `main` deploy می‌کند.

1. در موبایل و دسکتاپ هر سه بانک را باز کنید؛ در منزل هر ۹ گروه، جستجو و انتخاب حرکت را ببینید. داده تأییدنشده اصلاحی همچنان نباید قابل تجویز شود.
2. دو حرکت روز اول، یک سوپرست و حرکت روز دوم بسازید؛ برگشت بین روزها باید محتوا را حفظ کند. تاریخ شمسی انتخاب و نسخه را ثبت کنید. با refresh، بازکردن آرشیو و PDF، تاریخ و تفکیک روزها ثابت بماند.
3. تمرین خودکار را با تاریخ شمسی بسازید و تاریخ پیش‌نمایش/نسخه اختصاصی آن را بررسی کنید.
4. پرونده‌ای باز کنید؛ از نمای کلی روی مراجعان بزنید. فهرست کامل فعال با صفحه‌بندی بیاید. شماره با ارقام فارسی و `+98` جستجو و «نمایش همه مراجعان» را امتحان کنید. در پرونده ویرایش‌نشده/ویرایش‌شده، لغو و تأیید خروج هر دو تست شوند.
5. با حساب آزمایشی تست، عنوان یک ماه/۳ پرونده و تاریخ واقعی را ببینید؛ ثبت پرونده چهارم ممنوع باشد. حساب پرداخت‌شده تاریخ قبلی خود را حفظ کند. حساب مدیر تاریخ مجوز واقعی و عنوان مدیر را نشان دهد.
6. پرداخت واقعی تازه صرفاً برای این بررسی لازم نیست؛ تسویه و callback تکراری با داده مصنوعی در تست SQL پوشش دارند. برای هر پرداخت production، رسید/تاریخ تمدید واقعی را جدا بررسی کنید.

## بازگشت

- کد: به deployment قبلی Vercel برگردید؛ فیلد اختیاری تاریخ و قرارداد SQL با داده قدیمی سازگارند. نسخه قدیمی کد ممکن است هنگام ویرایش نسخه جدید، تاریخ را نگه ندارد؛ پیش از بازگشت ویرایش برنامه‌های جدید را متوقف کنید.
- دیتابیس: rollback کد مجوزها را برنمی‌گرداند. جدول حسابرسی را نگه دارید؛ برای رفع یک مجوز اشتباه، با ثبت دلیل و کنترل revision از ابزار مجوز مدیر استفاده کنید. بازگردانی جمعی ده‌ساله یا restore کامل روی داده‌های جدید انجام ندهید.
- خرابی جدی: بکاپ قبل 055 را ابتدا در دیتابیس جدا بازیابی و اختلاف با داده‌های بعدی را بررسی کنید؛ بازگردانی مخرب production جزو این پچ نیست.

## محدوده اثبات

تست‌های renderer محلی و PGlite جدا از PostgreSQL واقعی و مرورگر CI هستند. تست واقعی PostgreSQL، بازیابی بکاپ مصنوعی و مرورگرهای موبایل/دسکتاپ در workflow موجود اجرا می‌شوند. نتیجه CI را در خود PR ببینید؛ سلامت production و پرداخت زنده از روی این تست‌ها ادعا نمی‌شود. هیچ migration این PR توسط عامل روی production اجرا نشده است.
