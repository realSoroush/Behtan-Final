import { test, expect } from "@playwright/test";
import { setup } from "./real-fixture";
const report = {
  version: 1,
  created_at: "2026-10-22T12:00:00Z",
  intake_revision: 1,
  height_cm: 165,
  weight_kg: 75,
  bmi: 27.55,
  measurements: { waist_cm: 90 },
  waist_height_ratio: 0.55,
  waist_hip_ratio: null,
  fat_mass_kg: null,
  fat_free_mass_kg: null,
  photos: [{ view: "front", usable: true, issues: [] }],
  processor: "openai",
  model: "synthetic-model",
  consent_version: 1,
  photo_count: 1,
};
test("subscription opens in a focus-trapped dialog and Escape restores navigation", async ({
  page,
}) => {
  await setup(page, { existing: true });
  await page.goto("/");
  const button = page.getByRole("button", {
    name: "اشتراک و ظرفیت",
    exact: true,
  });
  await button.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "اشتراک و ظرفیت", exact: true }).last(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button).toBeFocused();
});
test("body report is optional, approved explicitly and no AI body fat is invented", async ({
  page,
}) => {
  await setup(page, { existing: true });
  let approved = false;
  await page.route("**/rest/v1/rpc/pro_body_reports", (r) =>
    r.fulfill({
      json: [
        {
          id: "90000000-0000-4000-8000-000000000001",
          intake_revision: 1,
          created_at: report.created_at,
          report,
          approved_at: approved ? report.created_at : null,
        },
      ],
    }),
  );
  await page.route("**/rest/v1/rpc/pro_approve_body_report", (r) => {
    approved = true;
    return r.fulfill({ json: null });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تحلیل تصویری بدن و گزارش‌ها", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("عکس روبه‌رو", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تحلیل و ساخت گزارش", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "مشاهده گزارش بدن", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(2);
  await expect(
    page.getByText("اندازه‌گیری نشده", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "گزارش را بازبینی کردم؛ تأیید", exact: true })
    .click();
  await expect.poll(() => approved).toBe(true);
  await expect(
    page.getByRole("button", { name: "بستن پنجره", exact: true }).last(),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("custom selects remain usable inside native modal top layer", async ({
  page,
}) => {
  await setup(page, { existing: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تحلیل تصویری بدن و گزارش‌ها", exact: true })
    .click();
  await page
    .getByLabel("درصد چربی اندازه‌گیری‌شده", { exact: true })
    .fill("30");
  await page
    .getByRole("combobox", { name: "روش سنجش درصد چربی", exact: true })
    .click();
  await page.getByRole("option", { name: "دستگاه BIA", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "روش سنجش درصد چربی", exact: true }),
  ).toContainText("دستگاه BIA");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("existing approved reports remain visible when workspace is read-only", async ({
  page,
}) => {
  const state = await setup(page, { existing: true });
  await page.route("**/rest/v1/rpc/pro_workspace_status", (r) =>
    r.fulfill({
      json: {
        can_write: false,
        expires_at: "2026-01-01",
        case_count: 1,
        case_limit: 20,
      },
    }),
  );
  await page.route("**/rest/v1/rpc/pro_body_reports", (r) =>
    r.fulfill({
      json: [
        {
          id: "90000000-0000-4000-8000-000000000001",
          intake_revision: 1,
          created_at: report.created_at,
          report,
          approved_at: report.created_at,
        },
      ],
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "پرونده جدید", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "ذخیره اطلاعات پرونده", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "تحلیل تصویری بدن و گزارش‌ها", exact: true })
    .click();
  await expect(page.getByLabel("عکس روبه‌رو", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "مشاهده گزارش بدن", exact: true })
    .click();
  await expect(
    page.getByText("تصویری روشن‌تر از اطلاعات مراجع", { exact: true }),
  ).toBeVisible();
});
test("photo upload strips metadata and retries the same request after connection failure", async ({
  page,
}, info) => {
  await setup(page, { existing: true });
  let calls: any[] = [];
  let first = true;
  let stored: any[] = [];
  await page.route("**/rest/v1/rpc/pro_body_reports", (r) =>
    r.fulfill({ json: stored }),
  );
  await page.route("**/api/pro-body-scan", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (first) {
      first = false;
      await route.abort("failed");
      return;
    }
    stored = [
      {
        id: "90000000-0000-4000-8000-000000000002",
        intake_revision: 1,
        created_at: report.created_at,
        report,
        approved_at: null,
      },
    ];
    await route.fulfill({ json: { id: stored[0].id, report } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تحلیل تصویری بدن و گزارش‌ها", exact: true })
    .click();
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 960;
    const x = c.getContext("2d")!;
    x.fillStyle = "#ddd";
    x.fillRect(0, 0, 640, 960);
    x.fillStyle = "#174";
    x.fillRect(220, 100, 200, 700);
    return c.toDataURL("image/jpeg").split(",")[1];
  });
  await page
    .getByLabel("عکس روبه‌رو", { exact: true })
    .setInputFiles({
      name: "secret-name-location.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(jpeg, "base64"),
    });
  await expect(
    page.getByAltText("نمای انتخاب‌شده روبه‌رو", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "تحلیل و ساخت گزارش", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("اتصال برقرار نشد");
  await expect(
    page.getByAltText("نمای انتخاب‌شده روبه‌رو", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "بررسی دوباره همان درخواست", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "تصویری روشن‌تر از اطلاعات مراجع",
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[0].key).toBe(calls[1].key);
  expect(JSON.stringify(calls)).not.toContain("secret-name-location");
  await page.screenshot({
    path: info.outputPath("body-report.png"),
    fullPage: true,
  });
});
test("revocation closes nested report dialogs and restores page scrolling", async ({
  page,
}) => {
  const state = await setup(page, { existing: true });
  await page.route("**/rest/v1/rpc/pro_body_reports", (r) =>
    r.fulfill({
      json: [
        {
          id: "90000000-0000-4000-8000-000000000003",
          intake_revision: 1,
          created_at: report.created_at,
          report,
          approved_at: report.created_at,
        },
      ],
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تحلیل تصویری بدن و گزارش‌ها", exact: true })
    .click();
  await page
    .getByRole("button", { name: "مشاهده گزارش بدن", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(2);
  state.revoke();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("دسترسی این حساب به پنل فعال نیست.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});
test("approved matching report attaches once and appears after the original diet in PDF", async ({
  page,
}) => {
  await setup(page, { existing: true });
  let attached = false;
  let attaches = 0;
  await page.route("**/rest/v1/rpc/pro_body_reports", (r) =>
    r.fulfill({
      json: [
        {
          id: "90000000-0000-4000-8000-000000000004",
          intake_revision: 1,
          created_at: report.created_at,
          report,
          approved_at: report.created_at,
        },
      ],
    }),
  );
  await page.route("**/rest/v1/rpc/pro_plan_body_report", (r) =>
    r.fulfill({ json: attached ? report : null }),
  );
  await page.route("**/rest/v1/rpc/pro_attach_body_report", (r) => {
    attaches++;
    attached = true;
    return r.fulfill({ json: null });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تولید و پیش‌نمایش برنامه", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ذخیره این برنامه", exact: true })
    .click();
  const select = page.getByRole("combobox", {
    name: "گزارش بدن برای PDF",
    exact: true,
  });
  await select.click();
  await page.getByRole("option").last().click();
  await page
    .getByRole("button", {
      name: "تأیید و پیوست به PDF این برنامه",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "گزارش تأییدشده به این برنامه متصل است و در انتهای PDF درج می‌شود.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(attaches).toBe(1);
  const popupEvent = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "خروجی PDF / چاپ", exact: true })
    .click();
  const popup = await popupEvent;
  await expect(popup.locator(".body-appendix")).toContainText(
    "گزارش تصویری و اندازه‌های بدن",
  );
  await expect(popup.locator("header").first()).toContainText("برنامه غذایی");
  await expect(popup.locator("body > section").last()).toHaveClass(
    "body-appendix",
  );
});
