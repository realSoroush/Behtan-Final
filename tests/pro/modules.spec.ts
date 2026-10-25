import { test, expect } from "@playwright/test";
import { setup, org, record } from "./real-fixture";
test("authored nutrition can be saved, exported, cloned and retried without duplicates", async ({
  page,
}, info) => {
  await setup(page, { existing: true });
  const rows: any[] = [],
    keys: string[] = [];
  let lose = true;
  await page.route("**/rest/v1/pro_authored_plans?*", (r) =>
    r.fulfill({ json: rows }),
  );
  await page.route("**/rest/v1/rpc/pro_save_authored_plan", async (r) => {
    const b = r.request().postDataJSON();
    keys.push(b.p_key);
    expect(b.p_org).toBe(org);
    expect(b.p_record).toBe(record);
    expect(b.p_content.reviewed).toBe(true);
    if (!rows.some((p) => p.id === b.p_key))
      rows.unshift({
        id: b.p_key,
        kind: b.p_kind,
        content: b.p_content,
        intake_revision: 1,
        recorded_at: "2026-10-22T12:00:00Z",
      });
    if (lose) {
      lose = false;
      return r.abort("failed");
    }
    return r.fulfill({ json: b.p_key });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await expect(page.locator(".pro-module-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "تدوین اختصاصی تغذیه و سوابق" })
    .click();
  await page.getByLabel("نام سطر 1-1", { exact: true }).fill("نان و پنیر");
  await page
    .getByLabel("توضیحات سطر 1-1", { exact: true })
    .fill("مقدار مصرف با نظر متخصص");
  await page.getByLabel("تأیید برنامه اختصاصی متخصص", { exact: true }).check();
  await page
    .getByRole("button", { name: "ثبت نسخهٔ تأییدشده", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "تلاش مجدد ثبت نسخه", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "تلاش مجدد ثبت نسخه", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "نسخهٔ تأییدشده ذخیره شد" }),
  ).toBeVisible();
  expect(rows).toHaveLength(1);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.screenshot({
    path: info.outputPath("authored-editor.png"),
    fullPage: true,
  });
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "PDF نسخه ثبت‌شده", exact: true })
    .click();
  const print = await popup;
  await expect(print.locator("h1")).toContainText("برنامه غذایی اختصاصی");
  await expect(print.locator("table")).toContainText("نان و پنیر");
  await print.close();
  await page
    .getByRole("button", { name: "ساخت نسخه جدید", exact: true })
    .click();
  await expect(page.getByLabel("تأیید برنامه اختصاصی متخصص")).not.toBeChecked();
  await page.getByLabel("نام سطر 1-1").fill("منوی اصلاح‌شده");
  expect(rows[0].content.sections[0].lines[0].name).toBe("نان و پنیر");
});
test("training-only subscription disables nutrition generation but keeps shared body and histories", async ({
  page,
}) => {
  await setup(page, { existing: true });
  await page.route("**/rest/v1/rpc/pro_workspace_status", (r) =>
    r.fulfill({
      json: {
        modules: { nutrition: false, training: true, body: true },
        can_write: true,
        source: "admin",
        expires_at: "2026-11-22T00:00:00Z",
        case_limit: 200,
        case_count: 1,
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "تولید و پیش‌نمایش برنامه", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "تحلیل تصویری بدن و گزارش‌ها",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "تدوین اختصاصی تغذیه و سوابق" })
    .click();
  await expect(
    page.getByRole("button", { name: "ثبت نسخهٔ تأییدشده", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page
    .getByRole("button", { name: "برنامه تمرینی مراجع", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تنظیم دستی برنامه تمرینی", exact: true })
    .click();
  await expect(page.getByLabel("عنوان برنامه اختصاصی")).toBeEditable();
});
