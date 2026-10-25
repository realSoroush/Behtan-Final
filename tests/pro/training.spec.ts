import { test, expect } from "@playwright/test";
import { setup, base, org, record } from "./real-fixture";
import { buildTrainingPlan, TrainingError } from "../../src/training/engine";
import type { RealIntake } from "../../src/professional/menuPlan";
import type { TrainingSnapshot, TrainingInput } from "../../src/training/types";
const input: TrainingInput = {
  version: 1,
  location: "home",
  experience: "beginner",
  goal: "general",
  days: [0, 3],
  minutes: 45,
  equipment: ["dumbbells"],
  start_date: "2026-10-24",
  screening: {
    confirmed: true,
    symptoms: false,
    pain: false,
    restriction: false,
    recent_surgery: false,
  },
};
async function arrange(
  page: any,
  { saved = false, readonly = false, failOnce = false } = {},
) {
  const fixture = await setup(page, { existing: true });
  if (readonly) fixture.expire();
  const rows: TrainingSnapshot[] = saved
    ? [
        {
          id: "90000000-0000-4000-8000-000000000009",
          intake_revision: 1,
          created_at: "2026-10-22T12:00:00Z",
          approved_at: "2026-10-22T12:00:00Z",
          plan: buildTrainingPlan(
            base as RealIntake,
            input,
            1,
            new Date("2026-10-22T12:00:00Z"),
            true,
          ),
        },
      ]
    : [];
  const keys: string[] = [];
  let aborted = false;
  await page.route("**/rest/v1/rpc/pro_training_history", (r: any) =>
    r.fulfill({ json: { rows, total: rows.length } }),
  );
  await page.route("**/rest/v1/rpc/pro_approve_training", (r: any) => {
    const b = r.request().postDataJSON();
    const s = rows.find((x) => x.id === b.p_plan)!;
    s.approved_at = "2026-10-22T12:00:00Z";
    return r.fulfill({ json: null });
  });
  await page.route("**/api/pro-training", async (r: any) => {
    const b = r.request().postDataJSON();
    expect(b.org).toBe(org);
    expect(b.record).toBe(record);
    keys.push(b.key);
    try {
      let s = rows.find((x) => x.id === b.key);
      if (!s) {
        s = {
          id: b.key,
          intake_revision: 1,
          created_at: "2026-10-22T12:00:00Z",
          approved_at: null,
          plan: buildTrainingPlan(
            base as RealIntake,
            b.input,
            1,
            new Date("2026-10-22T12:00:00Z"),
            true,
          ),
        };
        rows.unshift(s);
      }
      if (failOnce && !aborted) {
        aborted = true;
        return r.abort("failed");
      }
      await r.fulfill({ json: { id: s.id, plan: s.plan } });
    } catch (e) {
      await r.fulfill({
        status: 422,
        json: {
          error: e instanceof TrainingError ? e.code : "PRO_INVALID_REQUEST",
        },
      });
    }
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await page
    .getByRole("button", { name: "برنامه تمرینی مراجع", exact: true })
    .click();
  // Manual editing remains the default; enter the engine through its explicit action.
  page.once("dialog", (dialog: any) => dialog.accept());
  await page.getByRole("button", { name: "تمرین‌دهی خودکار", exact: true }).click();
  return { fixture, rows, keys };
}
async function fill(page: any) {
  await page.getByLabel("تمرین شنبه",{exact:true}).check();
  await page.getByLabel("تمرین سه‌شنبه",{exact:true}).check();
  await page.getByLabel("یک جفت دمبل قابل‌کنترل", { exact: true }).check();
  await page.getByLabel("تأیید بررسی آمادگی تمرین", { exact: true }).check();
}
test("training draft, animation, approval and saved history are usable", async ({
  page,
}) => {
  const { rows } = await arrange(page);
  await expect(
    page.getByRole("button", { name: "ساخت پیش‌نویس تمرین" }),
  ).toBeDisabled();
  await fill(page);
  await page.getByRole("button", { name: "ساخت پیش‌نویس تمرین" }).click();
  await expect(
    page.getByText(
      "پیش‌نویس آماده است؛ حرکات و مقدار تمرین را قبل از تأیید بررسی کن.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "PDF برنامه تمرینی" }),
  ).toBeDisabled();
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith(".gif")) requests.push(r.url());
  });
  await page.getByRole("button", { name: /۱ اسکوات.*آموزش/ }).click();
  expect(requests.length).toBe(0);
  await page.getByRole("button", { name: /پخش آموزش/ }).click();
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole("button", { name: /توقف آموزش/ }).click();
  await page.getByRole("button", { name: "هفته ۴", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /اسکوات.*۲ ست/ }),
  ).toBeVisible();
  await page
    .getByText("حرکات، تجهیزات، مقدار تمرین و وضعیت مراجع را بازبینی کردم.", {
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "تأیید نهایی برنامه تمرینی" }).click();
  await expect(
    page.getByRole("button", { name: "PDF برنامه تمرینی" }),
  ).toBeEnabled();
  expect(rows[0].approved_at).toBeTruthy();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "PDF برنامه تمرینی" }).click();
  const popup = await popupPromise;
  await expect(popup.locator("h1")).toContainText("برنامه تمرینی");
  await expect(popup.locator("img.qr")).toHaveCount(6);
  await popup.close();
  await expect(page.locator(".training-panel")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByRole("dialog").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: "/tmp/behtan-training-" + test.info().project.name + ".png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "برنامه تمرینی مراجع", exact: true })
    .click();
  page.once("dialog", (dialog: any) => dialog.accept());
  await page.getByRole("button", { name: "تمرین‌دهی خودکار", exact: true }).click();
  await page.getByRole("button", { name: "مشاهده تمرین" }).click();
  await expect(
    page.getByRole("button", { name: "PDF برنامه تمرینی" }),
  ).toBeEnabled();
});
test("connection loss retries same request and avoids duplicate programme", async ({
  page,
}) => {
  const { rows, keys } = await arrange(page, { failOnce: true });
  await fill(page);
  await page.getByRole("button", { name: "ساخت پیش‌نویس تمرین" }).click();
  await expect(page.getByRole("alert").last()).toContainText(
    "ارتباط برقرار نشد",
  );
  await page.getByRole("button", { name: "ساخت پیش‌نویس تمرین" }).click();
  await expect(
    page.getByRole("button", { name: "PDF برنامه تمرینی" }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(rows).toHaveLength(1);
});
test("suspended subscription retains approved history and PDF but disables new work", async ({
  page,
}) => {
  await arrange(page, { saved: true, readonly: true });
  await page.getByRole("button", { name: "مشاهده تمرین" }).click();
  await expect(
    page.getByRole("button", { name: "PDF برنامه تمرینی" }),
  ).toBeEnabled();
  await page.getByText("تنظیم برنامه جدید", { exact: true }).click();
  await expect(
    page.getByLabel("یک جفت دمبل قابل‌کنترل", { exact: true }),
  ).toBeDisabled();
});
test("consecutive Pro days generate a split for specialist review", async ({
  page,
}) => {
  const { rows } = await arrange(page);
  await fill(page);
  await page.getByLabel("تمرین یکشنبه", { exact: true }).check();
  await page.getByLabel("تمرین سه‌شنبه", { exact: true }).uncheck();
  await page.getByRole("button", { name: "ساخت پیش‌نویس تمرین" }).click();
  await expect(page.getByText("پیش‌نویس آماده است؛ حرکات و مقدار تمرین را قبل از تأیید بررسی کن.",{exact:true})).toBeVisible();
  expect(rows).toHaveLength(1);
  expect(rows[0].plan.weeks[0].sessions[0].title).not.toBe(rows[0].plan.weeks[0].sessions[1].title);
});
test("exercise QR destination opens only generic instructions without login or patient data", async ({
  page,
}) => {
  await page.goto("/?exercise=1760");
  await expect(
    page.getByRole("heading", { name: "اسکوات گابلت", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "پخش آموزش اسکوات گابلت" }),
  ).toBeVisible();
  expect(await page.locator("input[type=tel]").count()).toBe(0);
  await page.goto("/?exercise=unknown");
  await expect(
    page.getByRole("heading", { name: "حرکت پیدا نشد." }),
  ).toBeVisible();
});
test("dark theme and reduced motion never auto-play instructional GIFs", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await arrange(page, { saved: true });
  await page.getByRole("button", { name: "مشاهده تمرین" }).click();
  await page.getByRole("button", { name: /۱ اسکوات.*آموزش/ }).click();
  await expect(page.getByRole("button", { name: /پخش آموزش/ })).toBeVisible();
  expect(await page.locator(".training-media img").getAttribute("src")).toMatch(
    /\.jpg$/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
