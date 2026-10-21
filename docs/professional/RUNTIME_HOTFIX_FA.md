# اصلاح اجرای Pro و تست بازیابی — ۲۱ اکتبر ۲۰۲۶

مبنای پچ: main در commit `ab12ba65c6ab595f2ee28b18672b75d4a2f9ce7e`، بعد از مرج PR شماره ۱۳. این بسته فقط اصلاحیه نسخه Operations است؛ پچ کامل قبلی را دوباره نصب نکنید. Migration جدید و تغییر تنظیمات Supabase ندارد.

## علت‌ها و اصلاح

۱. در CI، دستور `drop schema public` پیش از restore اشتباه بود. بکاپ مورد استفاده schema پیش‌فرض public را نمی‌سازد، در نتیجه اولین تابع متعلق به آن restore نمی‌شد. دستور حذف برداشته شد. بازیابی در دیتابیس آزمایشی جدا و مقایسه تمام داده‌ها، RLS، مجوزها، توابع و constraintها همچنان اجرا می‌شوند.

۲. API زنده پاسخ متنی `500 FUNCTION_INVOCATION_FAILED` می‌داد. در بررسی محلی با سازنده رسمی `@vercel/node` نسخه 26.0.0، خروجی `api/pro-plan.js` هنوز `../server/proPlanHttp.ts` را import می‌کرد؛ اما بسته سرور فایل `proPlanHttp.js` داشت. اجرای آن با Node 24 خطای `ERR_MODULE_NOT_FOUND` داد.

گزینه `rewriteRelativeImportExtensions` در tsconfig فعال شد؛ TypeScript اکنون پسوند importهای نسبی را هم به JavaScript تبدیل می‌کند. حداقل نسخه اعلام‌شده TypeScript به ^5.9.3 رسید؛ نسخه نصب‌شده در lockfile همان 5.9.3 قبلی است. موتور، اعتبارسنجی، OTP و مجوزها تغییر نکردند.

تست جدید `scripts/pro-runtime.test.mjs` یک گراف مستقل JavaScript می‌سازد؛ بدون فایل‌های TypeScript مبدا، هم entry واقعی API را بارگذاری می‌کند و هم کل ۵۴ بررسی سرور/HTTP و موتور را روی خروجی کامپایل‌شده اجرا می‌کند. این تست به `npm run test:pro:server` و در نتیجه `npm run test:pro` متصل است.

## نصب در PowerShell

فایل `behtan-pro-runtime-hotfix.patch` را کنار package.json قرار دهید. ابتدا:

```powershell
cd E:\Behtan-Final
git status
git switch main
git pull --ff-only origin main
git switch -c fix/pro-runtime-and-restore
git apply --check behtan-pro-runtime-hotfix.patch
```

اگر تغییرات شخصی commit نشده دارید، ابتدا آن‌ها را جدا ذخیره کنید. اگر check خطا داد، apply نکنید و خروجی را ارسال کنید. پس از check موفق:

```powershell
git apply behtan-pro-runtime-hotfix.patch
npm ci
npm run test:pro
npm run build
npm run build:admin
npm run build:pro
git add .github/workflows/pro-foundation.yml tsconfig.json package.json package-lock.json scripts/pro-runtime.test.mjs docs/professional/RUNTIME_HOTFIX_FA.md
git diff --cached --stat
git commit -m "Fix Pro function runtime imports and backup restore CI"
git push -u origin fix/pro-runtime-and-restore
```

فایل patch را commit نکنید. اگر tsc فایل‌های تولیدشده vite.config.js و vite.config.d.ts را تغییر داد، این دو فایل را به این commit اضافه نکنید. فقط شش مسیر صریح بالا را stage کنید.

سپس PR به main بسازید:
https://github.com/realSoroush/Behtan-Final/compare/main...fix/pro-runtime-and-restore

در CI جدید، مرحله Restore and verify synthetic PostgreSQL backup باید موفق شود. بعد از مرج و Deployment موفق پروژه behtan-pro، مسیر زیر را باز کنید:

https://pro.behtan.fit/api/pro-plan

بازکردن مستقیم، بدون ورود و Authorization، باید JSON زیر با HTTP 401 بدهد؛ این پاسخ در این حالت درست است:

```json
{"error":"PRO_AUTH_REQUIRED"}
```

سپس وارد پنل Pro شوید، «بررسی سرویس» را اجرا کنید و یک پرونده مصنوعی را تولید، ذخیره و چاپ کنید. اگر خطای جدید JSON یا شناسه درخواست نشان داده شد، همان را بفرستید. اگر هنوز FUNCTION_INVOCATION_FAILED بود، در پروژه behtan-pro، بخش Logs، درخواست /api/pro-plan را باز و متن خطای Runtime را ارسال کنید؛ مقادیر Secret یا Token را نفرستید.

## نتیجه واقعی بررسی این اصلاحیه

- پیش از اصلاح، خطای بارگذاری import در خروجی سازنده Vercel بازتولید شد.
- پس از اصلاح، همان خروجی با Node 24 اجرا شد و HTTP 401 JSON با X-Request-Id معتبر برگرداند.
- ۵۴ بررسی سرور/HTTP روی source و دوباره روی خروجی مستقل کامپایل‌شده موفق شدند؛ ۱۶ ماژول خروجی بدون فایل‌های TypeScript مبدا بارگذاری شدند.
- تست‌های Pro شامل ۲۴۶ بررسی SQL در PGlite، ۵۷۴ ترکیب منو، ۱۴ قرارداد و ۱۷ بررسی ورودی موفق شدند.
- بیلد B2C، ادمین و Pro و typecheck سرور موفق شدند.
- آزمون native PostgreSQL و pg_dump/pg_restore در این محیط اجرا نشده است؛ نتیجه واقعی آن باید از اجرای جدید GitHub Actions خوانده شود. تست‌های مرورگر این اصلاحیه دوباره اجرا نشده‌اند؛ رابط کاربری تغییر نکرده است.
- این بسته روی Vercel یا دیتابیس زنده منتشر نشده و تولید رژیم در سرور زنده پس از نصب باید بررسی شود.

پیام‌های webextension.js و contentscript.js با خطای این API متفاوت‌اند و با نام و رفتار افزونه‌های مرورگر سازگارند. برای تشخیص قطعی، پنل را در یک پروفایل مرورگر بدون افزونه امتحان کنید. محدودیت listener برنامه را برای خاموش‌کردن پیام افزونه تغییر ندهید.

مراجع فنی:
https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html
https://vercel.com/docs/functions/runtimes/node-js
