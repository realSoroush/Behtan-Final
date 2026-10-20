# نصب فاز ۲الف — پرونده و اطلاعات آزمایشی

این بسته روی `main` پس از PR #10، یعنی `5bd9755` ساخته شده است. پچ فاز اول را دوباره اعمال نکنید. پنل فعلی، همان Supabase اصلی و حساب تست شما مبنا هستند؛ هیچ دستور این بسته خودکار روی آن‌ها اجرا نشده است. همچنان فقط دادهٔ مصنوعی وارد کنید.

## ۱. پچ روی سیستم ویندوز

فایل `behtan-pro-phase-2a.patch` را کنار `package.json` بگذارید. ابتدا وضعیت تغییرات محلی را بررسی کنید؛ تغییرات دستی را حذف نکنید. اگر دو فایل خروجی `vite.config.js` و `vite.config.d.ts` صرفاً با بیلد تولید شده‌اند، تفاوتشان را بررسی و فقط در صورت اطمینان به نسخهٔ مخزن برگردانید.

```powershell
git status
git switch main
git pull --ff-only origin main
git switch -c feature/pro-phase-2a-records
git apply --check behtan-pro-phase-2a.patch
git apply behtan-pro-phase-2a.patch
npm ci
npm run test:pro
npm run test:protein
npm run test:feasibility
npm run test:production
npm run build
npm run build:admin
npm run build:pro
```

اگر `--check` خطا داد، ادامه ندهید. تست مرورگر با Playwright:

```powershell
npx playwright install chromium
npm run test:pro:browser
```

اگر دانلود مرورگر روی ویندوز ممکن نشد، نتیجهٔ این تست را از CI بررسی کنید؛ موفقیت بیلد جای تست مرورگر را نمی‌گیرد.

## ۲. Migration 024 — تنها تغییر دیتابیس

قبل از اجرا از دیتابیس بکاپ قابل بازیابی داشته باشید. در SQL Editor همان پروژه‌ای که پنل Pro به آن متصل است، بررسی کنید:

```sql
select to_regclass('public.pro_organizations') as phase_1,
       to_regclass('public.pro_case_records') as phase_2a;
```

فاز اول باید موجود و فاز دوم باید NULL باشد. سپس **فقط یک‌بار** کل فایل زیر را اجرا کنید:

```
supabase/migrations/20261020_024_pro_case_records.sql
```

مهاجرت‌های قبلی، `schema.sql` یا seed را روی دیتابیس موجود دوباره اجرا نکنید. ۰۲۴ افزایشی است؛ جدول‌های قبلی و پرونده‌های مصنوعی فاز اول را تغییر نمی‌دهد. هشت جدول جدید، policyها، RPCها و triggerهای نسخه‌بندی/audit اضافه می‌کند. اگر خطا داد، اجرای ادامه‌دار یا تکراری نکنید؛ متن خطا را بررسی کنید.

نسخهٔ فعلی Pro هنگام اعمال ۰۲۴ همچنان کار می‌کند. بهتر است SQL پس از موفقیت تست‌های شاخه و پیش از Deploy رابط جدید اعمال شود تا رابط جدید با جدول مفقود مواجه نشود. `pro_private` نباید به Exposed Schemas اضافه شود.

## ۳. نقش متخصص برای حساب تست

مالک سازمان به‌تنهایی مجاز به مشاهدهٔ سلامت نیست. اگر حساب خودت باید نقش متخصص آزمایشی هم داشته باشد، UUID خودت و سازمانت را جایگزین کن:

```sql
update public.pro_memberships
set roles = array['owner','practitioner']::text[]
where organization_id = 'YOUR_ORGANIZATION_UUID'::uuid
  and user_id = 'YOUR_AUTH_USER_UUID'::uuid
  and status = 'active'
  and 'owner' = any(roles)
returning organization_id, user_id, roles;
```

این کوئری نقش مالک را حفظ می‌کند. برای پیدا کردن سازمان‌های حساب خودت:

```sql
select o.id, o.name, m.roles
from public.pro_organizations o
join public.pro_memberships m on m.organization_id=o.id
where m.user_id='YOUR_AUTH_USER_UUID'::uuid;
```

دسترسی زمان‌دار `pro_pilot_access` قبلی نیز باید هنوز معتبر باشد.

## ۴. مجوز تخصصی صرفاً برای تست مصنوعی

این مجوز **احراز صلاحیت پزشکی نیست** و جدول مدرک واقعی متخصص را تغییر نمی‌دهد. فقط از SQL Editor/زیرساخت مجاز صادر می‌شود؛ هیچ کلید Service در مرورگر قرار نمی‌گیرد.

UUID حساب تست و UUID حساب ادمین به‌تنِ تأییدکننده را جایگزین کنید. اگر خودت ادمین سامانه هستی، هر دو می‌توانند UUID خودت باشند:

```sql
insert into public.pro_sandbox_capabilities(user_id, expires_at, granted_by)
select u.id, now()+interval '7 days', reviewer.user_id
from auth.users u
join public.pro_pilot_access p on p.user_id=u.id and p.expires_at>now()
join public.admin_members reviewer
  on reviewer.user_id='YOUR_PLATFORM_ADMIN_UUID'::uuid
join auth.users reviewer_auth on reviewer_auth.id=reviewer.user_id
where u.id='YOUR_TEST_USER_UUID'::uuid
  and u.phone is not null and u.phone_confirmed_at is not null
  and reviewer_auth.phone is not null and reviewer_auth.phone_confirmed_at is not null
on conflict(user_id) do update
set expires_at=excluded.expires_at, granted_by=excluded.granted_by, granted_at=now()
returning user_id, expires_at;
```

باید یک سطر برگردد؛ صفر سطر یعنی حساب، ادمین تأییدکننده، تأیید شماره یا دسترسی Pilot معتبر نیست. سابقهٔ تغییر این مجوز در جدول append-only ثبت می‌شود. برای لغو:

```sql
update public.pro_sandbox_capabilities
set expires_at=now()
where user_id='YOUR_TEST_USER_UUID'::uuid;
```

## ۵. پوش و Deploy

```powershell
git add package.json .github/workflows/pro-foundation.yml
git add src/professional src/utils/mealPlanEngine.ts
git add scripts/pro-database.test.mjs scripts/pro-case-database.test.mjs
git add scripts/pro-intake.test.mjs scripts/nutrition-feasibility-repair.test.mjs
git add tests/pro/cases.spec.ts
git add supabase/migrations/20261020_024_pro_case_records.sql
git add docs/professional
git diff --cached --stat
git commit -m "Add versioned sandbox intake and repair nutrition feasibility search"
git push -u origin HEAD
```

خود فایل پچ و خروجی‌های بیلد/تست را commit نکنید. پس از بررسی موفقیت CI، PR را مرج کنید. پروژهٔ `behtan-pro` همان `npm run build:pro` / `dist-pro` و متغیرهای قبلی را دارد؛ متغیر یا Secret جدید لازم نیست. اصلاح موتور مشترک پس از Deploy به B2C هم می‌رسد؛ تست‌های تغذیه، اندازهٔ وعده، آلرژی و حفظ وعدهٔ مصرف‌شده در گزارش آمده‌اند.

## ۶. سناریوی پذیرش در پنل

۱. وارد `pro.behtan.fit` شو؛ سازمان را انتخاب کن و «پرونده‌ها و اطلاعات ورودی» را باز کن.
۲. «ساخت پروندهٔ جدید» را بزن. شماره و نام واقعی وارد نمی‌شود؛ کد CASE خودکار است.
۳. پرونده را باز کن. در «تخصیص متخصص و مجوزهای آزمایش»، عضو متخصص خودت را انتخاب و پرونده را تخصیص بده.
۴. «اعطای آزمایشی پردازش اطلاعات» را بزن. این دکمه فقط شبیه‌سازی است و رضایت واقعی بیمار محسوب نمی‌شود. پذیرش ارتباط و اشتراک پیشرفت مستقل‌اند و برای بازکردن فرم intake لازم نیستند.
۵. اگر نقش، Pilot، مجوز تخصصی آزمایش و تخصیص معتبر باشند، فرم پایه باز می‌شود. فقط اعداد ساختگی وارد کن، بخش ایمنی را تأیید و ذخیره کن.
۶. وزن ساختگی را تغییر بده و دوباره ذخیره کن. نسخهٔ اول از «تاریخچهٔ اطلاعات» همچنان فقط‌خواندنی قابل مشاهده است.
۷. مجوز پردازش یا تخصیص را لغو کن؛ فرم و تاریخچه باید بسته شوند. با نقش پذیرش/مالک بدون تخصص نیز سلامت قابل مشاهده نیست.
۸. برای تست توقف پزشکی، در یک سناریوی مصنوعی دیابت را انتخاب کن؛ هشدار توقف باید نمایش داده شود. ذخیره‌سازی، توقف را رفع نمی‌کند و هنوز دکمهٔ تولید رژیم وجود ندارد.

در این فاز تاریخچه تا ۱۰۰ نسخهٔ اخیر دریافت می‌شود؛ صفحه‌بندی کامل در مرحلهٔ بعد تکمیل خواهد شد. پاسخ‌های فرم در localStorage ذخیره نمی‌شوند. هنگام خطای شبکه، همان درخواست را Retry کنید؛ هنگام تعارض نسخه، آخرین نسخه را دریافت و تغییرات را دوباره بررسی کنید.

## بازگشت از انتشار

برای بستن کل پنل، `VITE_PRO_SANDBOX_ENABLED=false` و Redeploy؛ برای قطع دسترسی یک متخصص آزمایش، انقضای capability بالا کافی است. جدول‌های تاریخچه و audit را حذف نکنید. بازگشت فرانت‌اند به نسخهٔ قبل، داده‌های Migration افزایشی را دست‌نخورده نگه می‌دارد. این دستورها مجوز ورود بیمار واقعی نیستند.
