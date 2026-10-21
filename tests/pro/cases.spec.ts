import { expect, test } from "@playwright/test";
import { setup, fillNew } from "./real-fixture";
test("create actual record, save, generate menus, save plan and print Persian PDF", async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.goto("/");
  await fillNew(page);
  await page
    .getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true })
    .click();
  await expect(
    page.getByText("اطلاعات پرونده ذخیره شد.", { exact: true }),
  ).toBeVisible();
  expect(state.cases).toHaveLength(1);
  await page
    .getByRole("button", { name: "تولید و پیش‌نمایش برنامه", exact: true })
    .click();
  await expect(page.locator(".pro-plan-preview")).toBeVisible();
  await page
    .getByRole("button", { name: "ذخیره این برنامه", exact: true })
    .click();
  await expect(
    page.getByText("برنامه ذخیره شد و برای خروجی PDF آماده است.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.plans).toHaveLength(1);
  await page.screenshot({
    path: info.outputPath("real-plan.png"),
    fullPage: true,
  });
  const popupEvent = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "خروجی PDF / چاپ", exact: true })
    .click();
  const popup = await popupEvent;
  await expect(popup.locator("h1")).toContainText("برنامه غذایی");
  await expect(popup.locator("header")).toContainText("مراجع تست");
  await expect(popup.locator("table").first()).toBeVisible();
});
test("new record starts without mock identity or measurements", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "پرونده جدید", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "نام مراجع", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "سال تولد", exact: true }),
  ).toContainText("سال");
  await expect(
    page.getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true }),
  ).toBeDisabled();
});
test("lost response retries same committed create without duplicate", async ({
  page,
}) => {
  const s = await setup(page);
  await page.goto("/");
  await fillNew(page);
  s.failNext();
  await page
    .getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "تلاش مجدد ذخیره", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "تلاش مجدد ذخیره", exact: true })
    .click();
  await expect(
    page.getByText("اطلاعات پرونده ذخیره شد.", { exact: true }),
  ).toBeVisible();
  expect(s.cases).toHaveLength(1);
  expect(s.requests[0].p_key).toBe(s.requests[1].p_key);
});
test("validation failure allows correction and a fresh save", async ({
  page,
}) => {
  const s = await setup(page);
  await page.goto("/");
  await fillNew(page);
  s.invalidNext();
  await page
    .getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("نام، شماره تماس");
  await page.getByRole("tab", { name: "مشخصات اولیه" }).click();
  await expect(
    page.getByRole("textbox", { name: "نام مراجع", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "نام مراجع", exact: true })
    .fill("نام اصلاح‌شده");
  await page
    .getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true })
    .click();
  await expect(
    page.getByText("اطلاعات پرونده ذخیره شد.", { exact: true }),
  ).toBeVisible();
  expect(s.cases[0].display_name).toBe("نام اصلاح‌شده");
});
test("edit invalidates safety confirmation and generation until saved", async ({
  page,
}) => {
  await setup(page, { existing: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "وزن (کیلوگرم)", exact: true })
    .fill("76");
  await expect(
    page.getByRole("button", { name: "تولید و پیش‌نمایش برنامه", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "ایمنی پزشکی" }).click();
  await page
    .getByText("پاسخ‌های ثبت‌شده را با مراجع بررسی کردم.", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true })
    .click();
  await expect(
    page.getByText("اطلاعات پرونده ذخیره شد.", { exact: true }),
  ).toBeVisible();
});
test("stale update cannot overwrite another saved intake", async ({ page }) => {
  const s = await setup(page, { existing: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "نام مراجع", exact: true })
    .fill("نام ویرایش‌شده");
  s.staleNext();
  await page
    .getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true })
    .click();
  await expect(
    page.getByText(
      "این پرونده در جای دیگری تغییر کرده است. آخرین نسخه را دریافت کنید.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(s.cases[0].display_name).toBe("مراجع تست");
  await expect(
    page.getByRole("button", { name: "تولید و پیش‌نمایش برنامه", exact: true }),
  ).toBeDisabled();
});


test('network and parent focus refresh preserve unsaved intake; recovery allows save', async ({ page }) => {
  const state = await setup(page, { existing:true });
  await page.goto('/');
  await page.getByRole('button',{name:'بازکردن پرونده',exact:true}).click();
  const weight=page.getByRole('spinbutton',{name:'وزن (کیلوگرم)',exact:true});
  await weight.fill('76');
  state.network(false);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(/اتصال موقتاً برقرار نیست؛ تغییرات شما حفظ شده‌اند/)).toBeVisible();
  await expect(weight).toHaveValue('76');
  await expect(weight).toBeEnabled();
  state.network(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(/اتصال موقتاً برقرار نیست؛ تغییرات شما حفظ شده‌اند/)).toHaveCount(0);
  await expect(weight).toHaveValue('76');
  await page.getByRole('tab',{name:'ایمنی پزشکی'}).click();
  await page.getByText('پاسخ‌های ثبت‌شده را با مراجع بررسی کردم.',{exact:true}).check();
  await page.getByRole('button',{name:'ذخیره اطلاعات پرونده',exact:true}).click();
  await expect(page.getByText('اطلاعات پرونده ذخیره شد.',{exact:true})).toBeVisible();
  expect(state.cases[0].answers.weight_kg).toBe(76);
});

test('periodic network check preserves an edited name', async ({ page }) => {
  const state = await setup(page, {existing:true});
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button',{name:'بازکردن پرونده',exact:true}).click();
  const name=page.getByRole('textbox',{name:'نام مراجع',exact:true});
  await name.fill('نام ذخیره‌نشده');
  state.network(false);
  await page.clock.fastForward(31000);
  await expect(page.getByText(/اتصال موقتاً برقرار نیست؛ تغییرات شما حفظ شده‌اند/)).toBeVisible();
  await expect(name).toHaveValue('نام ذخیره‌نشده');
});

test('server generation and publish response loss retries do not duplicate snapshots', async ({ page }) => {
  const state=await setup(page,{existing:true});
  await page.goto('/');
  await page.getByRole('button',{name:'بازکردن پرونده',exact:true}).click();
  state.failGenerationNext();
  const generate=page.getByRole('button',{name:'تولید و پیش‌نمایش برنامه',exact:true});
  await generate.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await generate.click();
  await expect(page.locator('.pro-plan-preview')).toBeVisible();
  expect(state.draftMap.size).toBe(1);
  state.failPlanNext();
  const save=page.getByRole('button',{name:'ذخیره این برنامه',exact:true});
  await save.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await save.click();
  await expect(page.getByText('برنامه ذخیره شد و برای خروجی PDF آماده است.',{exact:true})).toBeVisible();
  expect(state.plans).toHaveLength(1);
});


test('server search and pagination find a case beyond the first page',async({page})=>{
 const state=await setup(page);
 for(let i=0;i<31;i++)state.cases.push({id:crypto.randomUUID(),organization_id:'20000000-0000-4000-8000-000000000001',display_name:'مراجع '+i,phone:'',revision:1,updated_at:'2026-10-21T00:00:00Z'});
 await page.goto('/');
 await expect(page.getByRole('button',{name:'بازکردن پرونده',exact:true})).toHaveCount(25);
 await page.getByRole('button',{name:'صفحه بعد',exact:true}).click();
 await expect(page.getByRole('button',{name:'بازکردن پرونده',exact:true})).toHaveCount(6);
 await page.getByLabel('جست‌وجوی پرونده').fill('مراجع 30');
 await page.getByRole('button',{name:'جستجو',exact:true}).click();
 await expect(page.getByRole('button',{name:'بازکردن پرونده',exact:true})).toHaveCount(1);
 await expect(page.getByText('مراجع 30',{exact:true})).toBeVisible();
});

test('expired license preserves case access while disabling edits',async({page})=>{
 const state=await setup(page,{existing:true});state.expire();
 await page.goto('/');
 await expect(page.getByRole('button',{name:'پرونده جدید',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'بازکردن پرونده',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'نام مراجع',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'تولید و پیش‌نمایش برنامه',exact:true})).toBeDisabled();
 await expect(page.getByText(/اعتبار ساخت و ویرایش برنامه پایان یافته/)).toBeVisible();
});

test('service diagnostic distinguishes missing configuration from missing API',async({page})=>{
 await setup(page);await page.goto('/');
 await page.getByText('بررسی فنی سرویس ساخت برنامه',{exact:true}).click();
 await page.route('**/api/pro-plan',r=>r.fulfill({json:{ready:false,missing:['SUPABASE_SERVICE_ROLE_KEY']}}));
 await page.getByRole('button',{name:'بررسی سرویس ساخت برنامه',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'SUPABASE_SERVICE_ROLE_KEY'})).toBeVisible();
 await page.route('**/api/pro-plan',r=>r.fulfill({status:404,body:'Not found'}));
 await page.getByRole('button',{name:'بررسی سرویس ساخت برنامه',exact:true}).click();
 await expect(page.getByText(/API این انتشار موجود نیست/)).toBeVisible();
});
