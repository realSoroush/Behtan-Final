# مشخصات متخصص، PDF و فوتر به‌تن

مبنای پچ: `main@8b5b2e5c2535c8f3ef489a1776a79bd74c119084`.

## رفتار نهایی

- بعد از ورود پیامکی، کاربر جدید یا کاربر قدیمی بدون مشخصات کامل، فرم نام و نام خانوادگی، شماره تماس کاری، رسته کاری، استان، شهر و آدرس را می‌بیند.
- اطلاعات در `pro_specialist_profiles` ذخیره می‌شود؛ بعد از ثبت موفق و ورود بعدی، فرم اجباری تکرار نمی‌شود. خطای ذخیره، مقدارهای واردشده را پاک نمی‌کند.
- نام و حوزهٔ ثبت‌نام قبلی و شمارهٔ حساب برای شروع فرم پیشنهاد می‌شوند؛ آدرس حدس زده نمی‌شود.
- از «حساب و تنظیمات ← ویرایش مشخصات حرفه‌ای و اطلاعات PDF» می‌توان اطلاعات را اصلاح کرد.
- شماره تماس کاری، شماره OTP حساب را تغییر نمی‌دهد. تلفن همراه یا ثابت با پیش‌شماره پذیرفته می‌شود؛ ارقام فارسی و عربی به انگلیسی تبدیل می‌شوند.
- انتخاب رسته، تأیید صلاحیت حرفه‌ای محسوب نمی‌شود و دسترسی یا ماژول تازه‌ای ایجاد نمی‌کند.
- PDF تغذیهٔ خودکار، تمرین خودکار و برنامه‌های اختصاصی شامل نام، تماس و آدرس متخصص است. در برنامه تمرینی تأییدشده، اطلاعات تأییدکننده استفاده می‌شود؛ در سایر برنامه‌ها اطلاعات ثبت‌کنندهٔ نسخه.
- هنگام چاپ آرشیو توسط همکار، مشخصات نویسندهٔ همان نسخه نمایش داده می‌شود. اگر آن نویسنده هنوز پروفایل خود را تکمیل نکرده، چاپ با پیام مشخص متوقف می‌شود؛ نام همکار جایگزین او نمی‌شود.
- مشخصات تماس هنگام چاپ از پروفایل خوانده می‌شود؛ اصلاح مشخصات در خروجی‌های بعدی نسخه‌های قدیمی هم منعکس می‌شود. فایل PDF قبلاً دانلودشده تغییر نمی‌کند.
- اطلاعات و محاسبات ذخیره‌شدهٔ برنامه‌ها، پرداخت‌ها و اشتراک‌ها در این migration تغییر نمی‌کنند.
- فوتر مشترک صفحات عمومی با آدرس دفتر و کانال‌های اعلام‌شده به‌روز شده؛ نماد اعتماد حفظ شده است. لینک WhatsApp در قالب استاندارد `https://wa.me/989115391016` است.

## اعمال روی Windows / PowerShell

ZIP را در Downloads استخراج کنید. در نمونه‌های زیر پوشهٔ استخراج‌شده `Behtan-Pro-Specialist-Profile` است.

### ۱. آماده‌سازی شاخه و اعمال پچ

```powershell
cd E:\Behtan-Final
git status
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

پوشه باید تمیز و کامیت مبنا همان `8b5b2e5...` باشد. اگر تغییر ثبت‌نشده یا کامیت جدیدتری دارید، قبل از ادامه وضعیت را بررسی کنید؛ از reset استفاده نکنید.

```powershell
$behtanPatchDir = "$HOME\Downloads\Behtan-Pro-Specialist-Profile"
git switch -c feat/pro-specialist-profile
git apply --check "$behtanPatchDir\behtan-pro-specialist-profile.patch"
```

اگر دستور آخر بدون خطا بود:

```powershell
git apply "$behtanPatchDir\behtan-pro-specialist-profile.patch"
git diff --stat
```

هرجا خطا آمد، ادامه ندهید و خروجی را بررسی کنید. فایل‌های `.env` نیازی به تغییر ندارند.

### ۲. اجرای SQL فقط روی سرور ایران، پیش از انتشار کد

در PowerShell یک پنجره برای تونل باز کنید و باز نگه دارید:

```powershell
ssh -N -L 127.0.0.1:18000:127.0.0.1:8000 -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 root@95.38.186.191
```

در مرورگر `http://127.0.0.1:18000` را باز کنید و با نام کاربری و رمز Studio وارد شوید. SQL Editor ← New Query.

در ترمینال دیگری، محتوای migration را کپی کنید:

```powershell
cd E:\Behtan-Final
Get-Content -Raw -Encoding UTF8 .\supabase\migrations\20261101083339_040_pro_specialist_profile.sql | Set-Clipboard
```

در SQL Editor سرور ایران Paste و Run کنید. این فایل یک بار اجرا می‌شود؛ آن را روی Supabase Cloud قدیمی اجرا نکنید. بعد کوئری بررسی را کپی و در یک Query جدید اجرا کنید:

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\verify_pro_specialist_profile.sql | Set-Clipboard
```

نتیجه باید `SPECIALIST_PROFILE_READY` باشد. این مرحله فقط ساختار و مجوزها را بررسی می‌کند؛ ورود و PDF هم باید تست شوند. برای این پچ به `supabase db push`، تغییر secrets، ری‌استارت Docker یا انتشار Edge Functions نیازی نیست.

### ۳. تست محلی

```powershell
npm ci
npm run test:pro:profile
npm run test:market
npm run test:pro
npm run test:pro:studio
npm run test:landing
npm run build
npm run build:admin
$env:VITE_PRO_SANDBOX_ENABLED = "true"
npm run build:pro
npm run dev:pro
```

هر دستور را پس از موفقیت دستور قبلی اجرا کنید. اگر از فایل محیط مقدار flag پرو را تنظیم کرده‌اید، متغیر PowerShell لازم نیست.

در پنل محلی این موارد را بررسی کنید:

1. حساب قدیمی بدون مشخصات: نمایش فرم و ثبت هر شش مقدار.
2. refresh و ورود مجدد: فرم اجباری تکرار نشود.
3. حساب تازه: بعد از فرم، انتخاب اشتراک؛ نام دوباره پرسیده نشود.
4. ویرایش تماس در تنظیمات: شماره ورود عوض نشود.
5. PDF برنامه تغذیه و تمرین، خودکار و اختصاصی: نام متخصص، شماره تماس و استان/شهر/آدرس صحیح باشند.
6. پرونده و PDF قدیمی توسط همکار: نویسندهٔ همان برنامه نمایش داده شود.
7. فوتر صفحه اصلی و متخصصان: آدرس و سه لینک، در موبایل و دسکتاپ.

برای تست‌های مرورگر خودکار، در صورت نصب‌نبودن Chromium:

```powershell
npx playwright install chromium
npm run test:pro:browser
npm run test:public:browser
```

### ۴. Commit و PR بعد از تست

```powershell
git status
git add .github/workflows/pro-foundation.yml package.json scripts/market-database.test.mjs scripts/pro-specialist-profile-database.test.mjs scripts/pro-specialist-profile.test.mjs site.html src/marketing/navigation.css src/professional src/training/print.ts supabase/migrations/20261101083339_040_pro_specialist_profile.sql supabase/verify_pro_specialist_profile.sql tests/pro/real-fixture.ts tests/pro/specialist-profile.spec.ts tests/pro/studio.spec.ts tests/public/landing.spec.ts docs/professional/SPECIALIST_PROFILE_UPDATE_FA.md
git diff --cached --stat
git commit -m "feat(pro): collect specialist profile and brand PDF contact details"
git push -u origin feat/pro-specialist-profile
```

در GitHub یک PR از `feat/pro-specialist-profile` به `main` باز کنید. پس از موفقیت Preview و CI، Merge و انتشار سایت اصلی و پنل Pro؛ پنل ادمین تنظیم جدیدی لازم ندارد.

## بازگشت در صورت نیاز

اگر پچ هنوز commit نشده است، فقط برای برگرداندن همین پچ:

```powershell
git apply --reverse --check "$behtanPatchDir\behtan-pro-specialist-profile.patch"
git apply --reverse "$behtanPatchDir\behtan-pro-specialist-profile.patch"
```

اگر بعد از اعمال پچ فایل‌هایش را ویرایش کرده‌اید، ابتدا آن تغییرات را محفوظ کنید؛ دستور reverse ممکن است عمداً رد شود. اگر منتشر شده، انتشار قبلی را برگردانید. جدول و اطلاعات پروفایل را حذف نکنید؛ migration افزایشی است و با نسخهٔ قبلی برنامه سازگار می‌ماند.
